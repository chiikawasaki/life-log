import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createGoal,
  friendlyError,
  loadGoals,
  setGoalCompleted,
  setGoalDetails,
  type Goal,
} from "./api";
import { today, validDate, type Status } from "./domain";

const goalDate = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

function DeadlineInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="d-block" style={{ maxWidth: "16rem" }}>
      締め切り（任意）
      <input
        className="form-control mt-1"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function GoalDeadline({
  dueOn,
  active = false,
}: {
  dueOn: string | null;
  active?: boolean;
}) {
  if (!dueOn) return null;
  const current = today();
  return (
    <div className="small text-body-secondary">
      締め切り <time dateTime={dueOn}>{dueOn.replaceAll("-", "/")}</time>
      {active && dueOn < current && (
        <span className="ms-2 text-danger fw-semibold">期限超過</span>
      )}
      {active && dueOn === current && (
        <span className="ms-2 fw-semibold">今日まで</span>
      )}
    </div>
  );
}

function StatusPicker({
  statuses,
  selected,
  onChange,
  disabled,
}: {
  statuses: Status[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="fs-6 mb-2">必要なステータス（任意・複数選択）</legend>
      <div className="d-flex flex-wrap gap-2">
        {statuses.map((status) => (
          <label
            key={status.id}
            className="d-inline-flex align-items-center gap-2 px-2 py-1 border rounded"
          >
            <input
              className="form-check-input mt-0"
              type="checkbox"
              checked={selected.includes(status.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, status.id]
                    : selected.filter((id) => id !== status.id),
                )
              }
            />
            {status.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GoalStatuses({ statuses, goal }: { statuses: Status[]; goal: Goal }) {
  const selected = statuses.filter((status) =>
    goal.required_status_ids?.includes(status.id),
  );
  if (!selected.length) return null;
  return (
    <ul
      aria-label="必要なステータス"
      className="list-unstyled d-flex flex-wrap gap-1 mt-2 mb-0"
    >
      {selected.map((status) => (
        <li
          key={status.id}
          className="badge bg-primary-subtle text-primary-emphasis"
        >
          {status.name}
        </li>
      ))}
    </ul>
  );
}

export function Goals({
  userId,
  statuses,
  view,
  onManage,
}: {
  userId: string;
  statuses: Status[];
  view?: "home" | "manage";
  onManage: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>();
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [requiredStatuses, setRequiredStatuses] = useState<string[]>([]);
  const [editor, setEditor] = useState<{
    id: string;
    statusIds: string[];
    dueOn: string;
  }>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const draftId = useRef<string>(undefined);

  useEffect(() => {
    let active = true;
    loadGoals().then(
      (items) => {
        if (active) setGoals(items);
      },
      (cause: unknown) => {
        if (active) setError(friendlyError(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [retry]);

  async function run(action: () => Promise<void>) {
    if (pending.current || !goals) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 120 || (dueOn && !validDate(dueOn)))
      return;
    void run(async () => {
      const id = (draftId.current ??= crypto.randomUUID());
      await createGoal(id, userId, trimmed, requiredStatuses, dueOn || null);
      setGoals(await loadGoals());
      draftId.current = undefined;
      setTitle("");
      setDueOn("");
      setRequiredStatuses([]);
    });
  }

  function toggle(goal: Goal) {
    void run(async () => {
      const updated = await setGoalCompleted(
        goal.id,
        goal.completed_at ? null : new Date().toISOString(),
      );
      replaceGoal(updated);
    });
  }

  function replaceGoal(updated: Goal) {
    setGoals((items) =>
      items?.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!editor || (editor.dueOn && !validDate(editor.dueOn))) return;
    void run(async () => {
      replaceGoal(
        await setGoalDetails(editor.id, editor.statusIds, editor.dueOn || null),
      );
      setEditor(undefined);
    });
  }

  if (!view) return null;

  const active = goals
    ?.filter((goal) => !goal.completed_at)
    .sort(
      (a, b) =>
        (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31") ||
        b.created_at.localeCompare(a.created_at),
    );
  const completed = goals
    ?.flatMap((goal) =>
      goal.completed_at ? [{ ...goal, completed_at: goal.completed_at }] : [],
    )
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  return (
    <div className="d-grid gap-3 mb-4">
      {error && (
        <div role="alert" className="alert alert-danger mb-0">
          {error}
          {!goals && (
            <button
              className="btn btn-outline-secondary btn-sm ms-2"
              type="button"
              onClick={() => {
                setError("");
                setRetry((value) => value + 1);
              }}
            >
              目標を再読み込み
            </button>
          )}
        </div>
      )}
      {view === "manage" && (
        <section
          className="card shadow-sm p-3 p-md-4"
          aria-labelledby="goal-new"
        >
          <h2 id="goal-new" className="h5">
            目標を追加
          </h2>
          <form className="d-grid gap-3" onSubmit={submit}>
            <label>
              目標の内容
              <input
                className="form-control mt-1"
                type="text"
                value={title}
                required
                maxLength={120}
                disabled={busy || !goals}
                onChange={(event) => {
                  setTitle(event.target.value);
                  draftId.current = undefined;
                }}
              />
            </label>
            <DeadlineInput
              value={dueOn}
              disabled={busy || !goals}
              onChange={(value) => {
                setDueOn(value);
                draftId.current = undefined;
              }}
            />
            <StatusPicker
              statuses={statuses}
              selected={requiredStatuses}
              disabled={busy || !goals}
              onChange={(ids) => {
                setRequiredStatuses(ids);
                draftId.current = undefined;
              }}
            />
            <button
              className="btn btn-primary me-auto"
              disabled={busy || !goals || !title.trim()}
            >
              目標を登録
            </button>
          </form>
        </section>
      )}
      <section
        className="card shadow-sm p-3 p-md-4"
        aria-labelledby="goal-active"
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 id="goal-active" className="h5 mb-0">
            進行中の目標
          </h2>
          {view === "home" && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={onManage}
            >
              目標を管理
            </button>
          )}
        </div>
        {!goals && !error && (
          <p className="text-body-secondary mb-0" role="status">
            目標を読み込み中…
          </p>
        )}
        {active?.length === 0 && (
          <p className="text-body-secondary mb-0">進行中の目標はありません。</p>
        )}
        <ul className="list-group list-group-flush">
          {active?.map((goal) => (
            <li
              className="list-group-item px-0 d-flex flex-wrap align-items-center justify-content-between gap-2"
              key={goal.id}
            >
              <div>
                <div className="text-break">{goal.title}</div>
                <GoalDeadline dueOn={goal.due_on} active />
                <GoalStatuses goal={goal} statuses={statuses} />
              </div>
              {view === "manage" && (
                <div className="d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setEditor({
                        id: goal.id,
                        statusIds: goal.required_status_ids ?? [],
                        dueOn: goal.due_on ?? "",
                      })
                    }
                  >
                    締め切り・ステータスを編集
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (editor?.id === goal.id) setEditor(undefined);
                      toggle(goal);
                    }}
                  >
                    達成にする
                  </button>
                </div>
              )}
              {view === "manage" && editor?.id === goal.id && (
                <form
                  className="w-100 d-grid gap-2 mt-2"
                  onSubmit={saveDetails}
                >
                  <DeadlineInput
                    value={editor.dueOn}
                    disabled={busy}
                    onChange={(value) => setEditor({ ...editor, dueOn: value })}
                  />
                  <StatusPicker
                    statuses={statuses}
                    selected={editor.statusIds}
                    disabled={busy}
                    onChange={(statusIds) =>
                      setEditor({ ...editor, statusIds })
                    }
                  />
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary btn-sm" disabled={busy}>
                      設定を保存
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => setEditor(undefined)}
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      {view === "manage" && (
        <section
          className="card shadow-sm p-3 p-md-4"
          aria-labelledby="goal-completed"
        >
          <h2 id="goal-completed" className="h5">
            達成した目標
          </h2>
          {completed?.length === 0 && (
            <p className="text-body-secondary mb-0">
              達成した目標はありません。
            </p>
          )}
          <ul className="list-group list-group-flush">
            {completed?.map((goal) => (
              <li
                className="list-group-item px-0 d-flex flex-wrap align-items-center justify-content-between gap-2"
                key={goal.id}
              >
                <div className="text-break">
                  <div>{goal.title}</div>
                  <time
                    className="small text-body-secondary"
                    dateTime={goal.completed_at}
                  >
                    達成日 {goalDate.format(new Date(goal.completed_at))}
                  </time>
                  <GoalDeadline dueOn={goal.due_on} />
                  <GoalStatuses goal={goal} statuses={statuses} />
                </div>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(goal)}
                >
                  進行中に戻す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
