import { Icon, navIcons, statusIcons } from "./Icon";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { db, friendlyError, loadData, saveEntry } from "./api";
import {
  type Data,
  type Entry,
  type Rule,
  emptyData,
  summarize,
  today,
} from "./domain";
import { EntryForm, RuleForm } from "./Forms";
const Reflection = lazy(() => import("./Reflection"));
const tabs = ["ホーム", "履歴", "行動ルール", "振り返り"] as const;
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recordNotice, setRecordNotice] = useState<{ level?: number }>();
  const [tab, setTab] = useState<(typeof tabs)[number]>("ホーム");
  const [editing, setEditing] = useState<Entry>();
  const [ruleEditor, setRuleEditor] = useState<Rule | "new" | null>(null);
  const userRef = useRef<string | null>(null);
  const mutationLock = useRef(false);
  const refresh = useCallback(async () => {
    const owner = userRef.current;
    if (!owner) return;
    setLoading(true);
    try {
      const result = await loadData();
      if (userRef.current === owner) {
        setData(result);
        setError("");
        return result;
      }
    } catch (e) {
      if (userRef.current === owner) setError(friendlyError(e));
    } finally {
      if (userRef.current === owner) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!db) {
      setChecking(false);
      return;
    }
    let alive = true;
    db.auth.getSession().then(({ data: result, error: err }) => {
      if (alive) {
        if (err) setError(friendlyError(err));
        setSession(result.session);
        setChecking(false);
      }
    });
    const { data: listener } = db.auth.onAuthStateChange((_event, value) => {
      if (alive) {
        setSession(value);
        setChecking(false);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    userRef.current = session?.user.id ?? null;
    setData(emptyData);
    setEditing(undefined);
    setRuleEditor(null);
    setRecordNotice(undefined);
    setMessage("");
    setError("");
    if (session) void refresh();
  }, [session?.user.id, refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (!mutationLock.current && userRef.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  async function mutate(
    action: () => Promise<void>,
    success: string | ((updated?: Data) => void),
  ) {
    if (mutationLock.current) throw new Error("保存中");
    const owner = userRef.current;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (userRef.current !== owner) return;
      if (typeof success === "string") setMessage(success);
      const updated = await refresh();
      if (userRef.current === owner && typeof success === "function") {
        success(updated);
      }
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  function saveRecord(
    entry: Omit<Entry, "created_at">,
    userId: string,
    editing: boolean,
  ) {
    return mutate(
      async () => {
        await saveEntry(entry, userId, editing);
        if (editing) setEditing(undefined);
      },
      (updated) => {
        const level = updated ? summarize(updated).level : summary.level;
        setRecordNotice({ level: level > summary.level ? level : undefined });
      },
    );
  }
  async function logout() {
    if (!db) return;
    const { error: err } = await db.auth.signOut();
    if (err) setError(friendlyError(err));
  }
  const summary = summarize(data);
  const history = [...data.entries].sort(
    (a, b) =>
      b.performed_on.localeCompare(a.performed_on) ||
      b.created_at.localeCompare(a.created_at),
  );
  return (
    <div className="d-flex min-vh-100 flex-column">
      <header className="navbar bg-white border-bottom">
        <div className="container gap-2">
          <a
            href="#"
            className="navbar-brand d-inline-flex align-items-center gap-2 fw-semibold"
            onClick={() => setTab("ホーム")}
          >
            <span className="app-icon bg-primary text-white">
              <Icon name="leaf" />
            </span>
            life-log
          </a>
          {session && (
            <nav
              className="nav nav-pills header-nav gap-1"
              aria-label="メインメニュー"
            >
              {tabs.map((t, i) => (
                <button
                  key={t}
                  className={`nav-link ${tab === t ? "active" : ""}`}
                  aria-current={tab === t ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    setTab(t);
                    setEditing(undefined);
                  }}
                >
                  <Icon name={navIcons[i]} />
                  {t === "ホーム" ? "記録する" : t}
                </button>
              ))}
            </nav>
          )}
          {session && (
            <button
              className="btn btn-outline-secondary btn-sm ms-auto"
              onClick={logout}
              disabled={busy}
            >
              ログアウト
            </button>
          )}
        </div>
      </header>
      <main className="container py-4 py-lg-5 flex-grow-1">
        {checking ? (
          <p role="status">読み込み中…</p>
        ) : !db ? (
          <section className="card shadow-sm p-3 p-md-4">
            <h1 className="h2">接続設定が必要です</h1>
            <p>
              開発環境にSupabaseのURLと公開キーを設定して、サーバーを再起動してください。
            </p>
          </section>
        ) : !session ? (
          <Login error={error} setError={setError} />
        ) : (
          <>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
              <div>
                <h1 className="h2">{tab === "ホーム" ? "今日の記録" : tab}</h1>
                <p className="text-body-secondary mb-0">
                  {tab === "ホーム"
                    ? "できたことを、ひとつずつ。"
                    : tab === "履歴"
                      ? "これまでに取り組んだこと。"
                      : tab === "行動ルール"
                        ? "自分のペースに合わせて。"
                        : "少し離れて、眺めてみよう。"}
                </p>
              </div>
              <span className="small text-body-secondary text-nowrap">
                {today().replaceAll("-", " / ")}
              </span>
            </div>
            {error && (
              <div
                role="alert"
                className="alert alert-danger d-flex flex-wrap align-items-center gap-2"
              >
                {error}{" "}
                <button
                  className="btn btn-outline-secondary"
                  disabled={loading || busy}
                  onClick={() => void refresh()}
                >
                  再読み込み
                </button>
              </div>
            )}
            {message && (
              <div role="status" className="alert alert-success">
                {message}
              </div>
            )}
            {recordNotice && (
              <RecordNotice
                level={recordNotice.level}
                onClose={() => setRecordNotice(undefined)}
              />
            )}
            {loading && (
              <p role="status" className="text-body-secondary">
                最新の記録を読み込み中…
              </p>
            )}
            {tab === "ホーム" && (
              <div className="row g-4">
                <div className="col-lg-7 d-grid gap-4 align-content-start">
                  <section className="card shadow-sm p-3 p-md-4">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="app-icon bg-primary-subtle text-primary">
                        <Icon name="write" />
                      </span>
                      <h2 className="h5 mb-0">今日は何をしましたか？</h2>
                    </div>
                    <p className="text-body-secondary">
                      時間や回数を入れて、さっと記録。
                    </p>
                    <EntryForm
                      key={data.versions.map((v) => v.id).join()}
                      data={data}
                      busy={busy || loading}
                      onSave={(entry) =>
                        saveRecord(entry, session.user.id, false)
                      }
                    />
                  </section>
                  <section className="card shadow-sm p-3 p-md-4">
                    <h2 className="h5">次のポイントまで</h2>
                    <p className="text-body-secondary">
                      途中の分も、ちゃんと貯まっています。
                    </p>
                    <div className="list-group list-group-flush">
                      {summary.progress
                        .filter(
                          (v) =>
                            data.rules.some(
                              (r) => r.id === v.rule_id && !r.archived_at,
                            ) &&
                            !data.versions.some(
                              (other) =>
                                other.rule_id === v.rule_id &&
                                other.created_at > v.created_at,
                            ),
                        )
                        .map((v) => (
                          <article
                            className="list-group-item px-0 py-3"
                            key={v.id}
                          >
                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                              <strong>
                                {
                                  data.rules.find((r) => r.id === v.rule_id)
                                    ?.name
                                }
                              </strong>
                              <span>＋{v.reward_points} pt</span>
                            </div>
                            <Progress
                              label={`${data.rules.find((r) => r.id === v.rule_id)?.name}の進捗`}
                              max={v.required_quantity}
                              value={v.remainder}
                            />
                            <small>
                              あと {v.remaining} {v.unit}で達成 · 累計{" "}
                              {v.quantity} {v.unit}
                            </small>
                          </article>
                        ))}
                    </div>
                    {!data.rules.some((r) => !r.archived_at) && (
                      <div className="alert alert-light border mb-0">
                        「勉強120分で＋1」など、自分に合うルールを作りましょう。
                        <button
                          className="btn btn-outline-secondary d-block mt-2"
                          onClick={() => {
                            setTab("行動ルール");
                            setRuleEditor("new");
                          }}
                        >
                          行動ルールを作る
                        </button>
                      </div>
                    )}
                  </section>
                </div>
                <aside className="col-lg-5" aria-label="成長のまとめ">
                  <section className="hero card bg-primary-subtle border-primary-subtle p-3 p-md-4 shadow-sm">
                    <div>
                      <span className="d-inline-flex align-items-center gap-2 small text-primary-emphasis">
                        <Icon name="leaf" />
                        これまでの積み重ね
                      </span>
                      <p className="fs-5 mb-0">
                        これまでの努力 <strong>{summary.xp}</strong> XP
                      </p>
                    </div>
                    <div className="d-flex align-items-baseline gap-2 my-3">
                      <span>レベル</span>
                      <strong className="display-5 fw-semibold">
                        {summary.level}
                      </strong>
                    </div>
                    <div className="small">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span>次のレベルまであと {summary.next} XP</span>
                        <span>{summary.levelProgress} / 15</span>
                      </div>
                      <Progress
                        label="次のレベルへの進捗"
                        value={summary.levelProgress}
                        max={15}
                      />
                    </div>
                  </section>
                  <section
                    aria-label="ステータス"
                    className="row row-cols-2 row-cols-sm-3 g-2 mt-2"
                  >
                    {data.statuses.map((s, i) => (
                      <article className="col" key={s.id}>
                        <div className="card h-100 p-3">
                          <span className="app-icon bg-primary-subtle text-primary">
                            <Icon name={statusIcons[i % statusIcons.length]} />
                          </span>
                          <h3 className="h6 mt-2">{s.name}</h3>
                          <p className="mb-0">
                            <strong>{summary.points[s.id] ?? 0}</strong>
                            <span className="text-body-secondary"> pt</span>
                          </p>
                        </div>
                      </article>
                    ))}
                  </section>
                  <p className="text-body-secondary small mt-3 mb-0">
                    休む日があっても、積み重ねはそのまま。
                  </p>
                </aside>
              </div>
            )}
            {tab === "行動ルール" && (
              <section className="card shadow-sm p-3 p-md-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <h2 className="h5 mb-0">行動ルール</h2>
                  <button
                    className="btn btn-primary d-inline-flex align-items-center gap-1"
                    disabled={busy || loading || !data.statuses.length}
                    onClick={() => setRuleEditor("new")}
                  >
                    <Icon name="plus" />
                    追加する
                  </button>
                </div>
                <p className="text-body-secondary">
                  勉強は120分で＋1から。必要な量とポイントは自由に設定できます。
                </p>
                {ruleEditor && (
                  <RuleForm
                    key={typeof ruleEditor === "string" ? "new" : ruleEditor.id}
                    data={data}
                    editing={
                      typeof ruleEditor === "string" ? undefined : ruleEditor
                    }
                    busy={busy}
                    onCancel={() => setRuleEditor(null)}
                    onSave={(args) =>
                      mutate(async () => {
                        const { error: err } = await db!.rpc("save_rule", args);
                        if (err) throw err;
                        setRuleEditor(null);
                      }, "行動ルールを保存しました。")
                    }
                  />
                )}
                <div className="list-group list-group-flush">
                  {data.rules
                    .filter((r) => !r.archived_at)
                    .map((r) => {
                      const v = data.versions
                        .filter((v) => v.rule_id === r.id)
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )[0];
                      return (
                        <article
                          className="list-item list-group-item d-flex flex-wrap justify-content-between align-items-start gap-3 px-0 py-3"
                          key={r.id}
                        >
                          <div>
                            <h3 className="h6 text-break">{r.name}</h3>
                            <p className="text-body-secondary">
                              {
                                data.statuses.find((s) => s.id === r.status_id)
                                  ?.name
                              }{" "}
                              · {v?.required_quantity}
                              {v?.unit}で＋{v?.reward_points}
                            </p>
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            <button
                              className="btn btn-outline-secondary"
                              disabled={busy}
                              onClick={() => setRuleEditor(r)}
                            >
                              変更
                            </button>
                            <button
                              className="btn btn-outline-danger"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "この行動を非表示にしますか？過去の記録とポイントは残ります。",
                                  )
                                )
                                  void mutate(async () => {
                                    const { error: err } = await db!
                                      .from("activity_rules")
                                      .update({
                                        archived_at: new Date().toISOString(),
                                      })
                                      .eq("id", r.id);
                                    if (err) throw err;
                                  }, "行動を非表示にしました。").catch(
                                    () => {},
                                  );
                              }}
                            >
                              非表示
                            </button>
                          </div>
                        </article>
                      );
                    })}
                </div>
                {!data.rules.length && (
                  <p className="alert alert-light border mb-0">
                    まだ行動ルールはありません。最初のひとつを追加しましょう。
                  </p>
                )}
              </section>
            )}
            {tab === "履歴" && (
              <section className="card shadow-sm p-3 p-md-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <h2 className="h5 mb-0">これまでの記録</h2>
                  <button
                    className="btn btn-outline-secondary"
                    disabled={busy || loading}
                    onClick={() => void refresh()}
                  >
                    最新に更新
                  </button>
                </div>
                {editing && (
                  <div className="bg-body-tertiary border rounded p-3 my-3">
                    <h3 className="h6">記録を訂正</h3>
                    <EntryForm
                      key={editing.id}
                      data={data}
                      entry={editing}
                      busy={busy || loading}
                      onCancel={() => setEditing(undefined)}
                      onSave={(entry) =>
                        saveRecord(entry, session.user.id, true)
                      }
                    />
                  </div>
                )}
                {!history.length && (
                  <p className="alert alert-light border mb-0">
                    まだ記録がありません。今日の小さな一歩から始めましょう。
                  </p>
                )}
                <div className="list-group list-group-flush">
                  {history.map((e) => {
                    const v = data.versions.find(
                      (v) => v.id === e.rule_version_id,
                    );
                    const r = data.rules.find((r) => r.id === v?.rule_id);
                    return (
                      <article
                        className="list-item list-group-item d-flex flex-wrap justify-content-between align-items-start gap-3 px-0 py-3"
                        key={e.id}
                      >
                        <div>
                          <small className="text-body-secondary">
                            {e.performed_on}
                          </small>
                          <h3 className="h6 text-break">
                            {r?.name ?? "行動"}{" "}
                            <span className="badge text-bg-primary ms-2">
                              {e.quantity}
                              {v?.unit}
                            </span>
                          </h3>
                          {e.note && (
                            <p className="text-break mb-0">{e.note}</p>
                          )}
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            className="btn btn-outline-secondary"
                            disabled={busy}
                            onClick={() => setEditing(e)}
                          >
                            訂正
                          </button>
                          <button
                            className="btn btn-outline-danger"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "この記録を削除しますか？経験値も再計算されます。",
                                )
                              )
                                void mutate(async () => {
                                  const { error: err } = await db!
                                    .from("effort_entries")
                                    .delete()
                                    .eq("id", e.id);
                                  if (err) throw err;
                                  if (editing?.id === e.id)
                                    setEditing(undefined);
                                }, "記録を削除しました。").catch(() => {});
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {tab === "振り返り" && (
              <Suspense fallback={<p role="status">グラフを読み込み中…</p>}>
                <Reflection key={session.user.id} data={data} />
              </Suspense>
            )}
          </>
        )}
      </main>
      <footer className="border-top py-3 text-center text-body-secondary small">
        <Icon name="leaf" /> わたしのペースで。
      </footer>
    </div>
  );
}
function Progress({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div
      className="progress my-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div
        className="progress-bar"
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}
function RecordNotice({
  level,
  onClose,
}: {
  level?: number;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const timer = window.setTimeout(() => dialog.close(), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal record-notice"
      aria-labelledby="record-notice-title"
      aria-describedby={level === undefined ? undefined : "record-notice-level"}
      onClose={onClose}
    >
      <div className="modal-content shadow">
        <div className="modal-header">
          <h2 id="record-notice-title" className="modal-title h5">
            記録を保存しました
          </h2>
        </div>
        {level !== undefined && (
          <div className="modal-body">
            <p id="record-notice-level" className="mb-0">
              レベルアップ！{" "}
              <strong className="badge text-bg-primary">Lv. {level}</strong>
            </p>
          </div>
        )}
        <form method="dialog" className="modal-footer">
          <button className="btn btn-primary">閉じる</button>
        </form>
      </div>
    </dialog>
  );
}
function Login({
  error,
  setError,
}: {
  error: string;
  setError: (value: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { error: err } = await db!.auth.signInWithPassword({
        email,
        password,
      });
      if (err) setError(friendlyError(err));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="card shadow-sm mx-auto p-3 p-md-4 login-card">
      <span className="app-icon bg-primary text-white mb-3">
        <Icon name="leaf" />
      </span>
      <h1 className="h2">おかえりなさい</h1>
      <p className="text-body-secondary">今日のできたこと、残していこう。</p>
      <form className="d-grid gap-3 mb-3" onSubmit={login}>
        <label>
          メールアドレス
          <input
            className="form-control mt-1"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </label>
        <label>
          パスワード
          <input
            className="form-control mt-1"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
        </label>
        {error && (
          <p role="alert" className="alert alert-danger mb-0">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "ログイン中…" : "ログイン"}
        </button>
      </form>
      <p className="text-body-secondary">
        <small>あなただけの記録帳です。</small>
      </p>
    </section>
  );
}
