import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createGoal,
  friendlyError,
  loadGoals,
  setGoalCompleted,
  type Goal,
} from "./api";

const goalDate = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

export function Goals({
  userId,
  view,
  onManage,
}: {
  userId: string;
  view?: "home" | "manage";
  onManage: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>();
  const [title, setTitle] = useState("");
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
    if (!trimmed || trimmed.length > 120) return;
    void run(async () => {
      const id = (draftId.current ??= crypto.randomUUID());
      await createGoal(id, userId, trimmed);
      setGoals(await loadGoals());
      draftId.current = undefined;
      setTitle("");
    });
  }

  function toggle(goal: Goal) {
    void run(async () => {
      const updated = await setGoalCompleted(
        goal.id,
        goal.completed_at ? null : new Date().toISOString(),
      );
      setGoals((items) =>
        items?.map((item) => (item.id === updated.id ? updated : item)),
      );
    });
  }

  if (!view) return null;

  const active = goals
    ?.filter((goal) => !goal.completed_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
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
          <form
            className="d-flex flex-wrap align-items-end gap-2"
            onSubmit={submit}
          >
            <label className="flex-grow-1">
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
            <button
              className="btn btn-primary"
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
              <span className="text-break">{goal.title}</span>
              {view === "manage" && (
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(goal)}
                >
                  達成にする
                </button>
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
