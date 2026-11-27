import { Icon, navIcons, statusIcons } from "./Icon";
import {
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
  dailyPoints,
  emptyData,
  periodDays,
  summarize,
  today,
} from "./domain";
import { EntryForm, RuleForm } from "./Forms";
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const activityLevels = [0, 1, 2, 3, 4];
const tabs = ["ホーム", "履歴", "行動ルール", "振り返り"] as const;
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("ホーム");
  const [editing, setEditing] = useState<Entry>();
  const [ruleEditor, setRuleEditor] = useState<Rule | "new" | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [end, setEnd] = useState(today());
  const [selectedDay, setSelectedDay] = useState<string>();
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
  async function mutate(action: () => Promise<void>, success: string) {
    if (mutationLock.current) throw new Error("保存中");
    mutationLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    if (!db) return;
    const { error: err } = await db.auth.signOut();
    if (err) setError(friendlyError(err));
  }
  const summary = summarize(data);
  const series =
    tab === "振り返り" ? dailyPoints(data, periodDays(period, end)) : [];
  const firstDay = series[0]?.day ?? end;
  const firstWeekday = (new Date(firstDay).getUTCDay() + 6) % 7;
  const selectedPoint =
    series.find((point) => point.day === selectedDay) ?? series.at(-1);
  const history = [...data.entries].sort(
    (a, b) =>
      b.performed_on.localeCompare(a.performed_on) ||
      b.created_at.localeCompare(a.created_at),
  );
  return (
    <div className="shell">
      <header className="topbar">
        <a href="#" className="brand" onClick={() => setTab("ホーム")}>
          <span className="brand-mark">
            <Icon name="leaf" />
          </span>
          life-log
        </a>
        <span className="tagline">わたしの記録帳</span>
        {session && (
          <button className="text-button" onClick={logout} disabled={busy}>
            ログアウト
          </button>
        )}
      </header>
      <main>
        {checking ? (
          <p role="status">読み込み中…</p>
        ) : !db ? (
          <section className="card">
            <h1>接続設定が必要です</h1>
            <p>
              開発環境にSupabaseのURLと公開キーを設定して、サーバーを再起動してください。
            </p>
          </section>
        ) : !session ? (
          <Login error={error} setError={setError} />
        ) : (
          <>
            <div className="intro">
              <div>
                <h1>{tab === "ホーム" ? "今日の記録" : tab}</h1>
                <p className="muted">
                  {tab === "ホーム"
                    ? "できたことを、ひとつずつ。"
                    : tab === "履歴"
                      ? "これまでに取り組んだこと。"
                      : tab === "行動ルール"
                        ? "自分のペースに合わせて。"
                        : "少し離れて、眺めてみよう。"}
                </p>
              </div>
              <span className="date">{today().replaceAll("-", " / ")}</span>
            </div>
            <nav aria-label="メインメニュー">
              {tabs.map((t, i) => (
                <button
                  key={t}
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
            {error && (
              <div role="alert" className="notice error">
                {error}{" "}
                <button
                  className="secondary"
                  disabled={loading || busy}
                  onClick={() => void refresh()}
                >
                  再読み込み
                </button>
              </div>
            )}
            {message && (
              <div role="status" className="notice success">
                {message}
              </div>
            )}
            {loading && (
              <p role="status" className="muted">
                最新の記録を読み込み中…
              </p>
            )}
            {tab === "ホーム" && (
              <div className="home-layout">
                <aside className="growth-panel" aria-label="成長のまとめ">
                  <section className="hero card">
                    <div>
                      <span className="section-kicker">
                        <Icon name="leaf" />
                        これまでの積み重ね
                      </span>
                      <p className="xp-total">
                        これまでの努力 <strong>{summary.xp}</strong> XP
                      </p>
                    </div>
                    <div className="level">
                      <span>レベル</span>
                      <strong>{summary.level}</strong>
                    </div>
                    <div className="level-meter">
                      <div className="between">
                        <span>次のレベルまであと {summary.next} XP</span>
                        <span>{summary.levelProgress} / 15</span>
                      </div>
                      <progress
                        aria-label="次のレベルへの進捗"
                        value={summary.levelProgress}
                        max={15}
                      />
                    </div>
                  </section>
                  <section aria-label="ステータス" className="stats">
                    {data.statuses.map((s, i) => (
                      <article className="stat" key={s.id}>
                        <span className="stat-icon">
                          <Icon name={statusIcons[i % statusIcons.length]} />
                        </span>
                        <h3>{s.name}</h3>
                        <p>
                          <strong>{summary.points[s.id] ?? 0}</strong>
                          <span> pt</span>
                        </p>
                      </article>
                    ))}
                  </section>
                  <p className="growth-note">
                    休む日があっても、積み重ねはそのまま。
                  </p>
                </aside>
                <div className="columns">
                  <section className="card record-card">
                    <div className="record-heading">
                      <span className="section-icon">
                        <Icon name="write" />
                      </span>
                      <h2>今日は何をしましたか？</h2>
                    </div>
                    <p className="muted">時間や回数を入れて、さっと記録。</p>
                    <EntryForm
                      key={data.versions.map((v) => v.id).join()}
                      data={data}
                      busy={busy || loading}
                      onSave={(entry) =>
                        mutate(
                          () => saveEntry(entry, session.user.id, false),
                          "記録しました。おつかれさま ☕",
                        )
                      }
                    />
                  </section>
                  <section className="next-panel">
                    <h2>次のポイントまで</h2>
                    <p className="muted">
                      途中の分も、ちゃんと貯まっています。
                    </p>
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
                        <article className="goal" key={v.id}>
                          <div className="between">
                            <strong>
                              {data.rules.find((r) => r.id === v.rule_id)?.name}
                            </strong>
                            <span>＋{v.reward_points} pt</span>
                          </div>
                          <progress
                            aria-label={`${data.rules.find((r) => r.id === v.rule_id)?.name}の進捗`}
                            max={v.required_quantity}
                            value={v.remainder}
                          />
                          <small>
                            あと {v.remaining} {v.unit}で達成 · 累計{" "}
                            {v.quantity} {v.unit}
                          </small>
                        </article>
                      ))}
                    {!data.rules.some((r) => !r.archived_at) && (
                      <div className="empty">
                        「勉強120分で＋1」など、自分に合うルールを作りましょう。
                        <button
                          className="secondary"
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
              </div>
            )}
            {tab === "行動ルール" && (
              <section className="card">
                <div className="between">
                  <h2>行動ルール</h2>
                  <button
                    disabled={busy || loading || !data.statuses.length}
                    onClick={() => setRuleEditor("new")}
                  >
                    <Icon name="plus" />
                    追加する
                  </button>
                </div>
                <p className="muted">
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
                {data.rules
                  .filter((r) => !r.archived_at)
                  .map((r) => {
                    const v = data.versions
                      .filter((v) => v.rule_id === r.id)
                      .sort((a, b) =>
                        b.created_at.localeCompare(a.created_at),
                      )[0];
                    return (
                      <article className="list-item" key={r.id}>
                        <div>
                          <h3>{r.name}</h3>
                          <p className="muted">
                            {
                              data.statuses.find((s) => s.id === r.status_id)
                                ?.name
                            }{" "}
                            · {v?.required_quantity}
                            {v?.unit}で＋{v?.reward_points}
                          </p>
                        </div>
                        <div className="actions">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => setRuleEditor(r)}
                          >
                            変更
                          </button>
                          <button
                            className="text-button"
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
                                }, "行動を非表示にしました。").catch(() => {});
                            }}
                          >
                            非表示
                          </button>
                        </div>
                      </article>
                    );
                  })}
                {!data.rules.length && (
                  <p className="empty">
                    まだ行動ルールはありません。最初のひとつを追加しましょう。
                  </p>
                )}
              </section>
            )}
            {tab === "履歴" && (
              <section className="card">
                <div className="between">
                  <h2>これまでの記録</h2>
                  <button
                    className="secondary"
                    disabled={busy || loading}
                    onClick={() => void refresh()}
                  >
                    最新に更新
                  </button>
                </div>
                {editing && (
                  <div className="inset">
                    <h3>記録を訂正</h3>
                    <EntryForm
                      key={editing.id}
                      data={data}
                      entry={editing}
                      busy={busy}
                      onCancel={() => setEditing(undefined)}
                      onSave={(entry) =>
                        mutate(async () => {
                          await saveEntry(entry, session.user.id, true);
                          setEditing(undefined);
                        }, "記録を更新しました。")
                      }
                    />
                  </div>
                )}
                {!history.length && (
                  <p className="empty">
                    まだ記録がありません。今日の小さな一歩から始めましょう。
                  </p>
                )}
                {history.map((e) => {
                  const v = data.versions.find(
                    (v) => v.id === e.rule_version_id,
                  );
                  const r = data.rules.find((r) => r.id === v?.rule_id);
                  return (
                    <article className="list-item" key={e.id}>
                      <div>
                        <small className="muted">{e.performed_on}</small>
                        <h3>
                          {r?.name ?? "行動"}{" "}
                          <span className="pill">
                            {e.quantity}
                            {v?.unit}
                          </span>
                        </h3>
                        {e.note && <p className="note">{e.note}</p>}
                      </div>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setEditing(e)}
                        >
                          訂正
                        </button>
                        <button
                          className="text-button"
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
                                if (editing?.id === e.id) setEditing(undefined);
                              }, "記録を削除しました。").catch(() => {});
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
            {tab === "振り返り" && (
              <section className="card">
                <h2>記録のペース</h2>
                <div className="form-row">
                  <label>
                    表示期間
                    <select
                      value={period}
                      onChange={(e) => {
                        setPeriod(e.target.value as "week" | "month");
                        setSelectedDay(undefined);
                      }}
                    >
                      <option value="week">週（月曜から）</option>
                      <option value="month">月</option>
                    </select>
                  </label>
                  <label>
                    この日まで
                    <input
                      type="date"
                      value={end}
                      max={today()}
                      onChange={(e) => {
                        if (e.target.value && e.target.value <= today()) {
                          setEnd(e.target.value);
                          setSelectedDay(undefined);
                        }
                      }}
                    />
                  </label>
                </div>
                <p className="muted">
                  色の濃さは記録件数を表します。マスを選ぶと、その日の件数と獲得XPを確認できます（日付は日本時間）。
                </p>
                <div className="chart">
                  <div
                    className="activity-calendar"
                    role="group"
                    aria-label="日ごとの記録"
                  >
                    {weekdays.map((day) => (
                      <span
                        key={day}
                        className="activity-weekday"
                        aria-hidden="true"
                      >
                        {day}
                      </span>
                    ))}
                    {series.map((point, index) => (
                      <button
                        type="button"
                        key={point.day}
                        className="activity-day"
                        data-level={Math.min(point.count, 4)}
                        style={{
                          gridRow: ((firstWeekday + index) % 7) + 1,
                          gridColumn:
                            Math.floor((firstWeekday + index) / 7) + 2,
                        }}
                        aria-label={`${point.day} ${point.xp} XP / ${point.count}件`}
                        aria-pressed={point.day === selectedPoint?.day}
                        title={`${point.day} ${point.xp} XP / ${point.count}件`}
                        onClick={() => setSelectedDay(point.day)}
                      />
                    ))}
                  </div>
                  <div className="activity-legend" aria-label="色の凡例">
                    <span>0件</span>
                    {activityLevels.map((level) => (
                      <span
                        key={level}
                        className="activity-swatch"
                        data-level={level}
                        aria-hidden="true"
                      />
                    ))}
                    <span>4件以上</span>
                  </div>
                  {selectedPoint && (
                    <p className="activity-detail" aria-live="polite">
                      <time dateTime={selectedPoint.day}>
                        {selectedPoint.day}
                      </time>
                      <strong>
                        {selectedPoint.xp} XP / {selectedPoint.count}件
                      </strong>
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <Icon name="leaf" /> わたしのペースで。
      </footer>
    </div>
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
    <section className="card login">
      <span className="login-symbol">
        <Icon name="leaf" />
      </span>
      <h1>おかえりなさい</h1>
      <p className="muted">今日のできたこと、残していこう。</p>
      <form className="form" onSubmit={login}>
        <label>
          メールアドレス
          <input
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={pending}>
          {pending ? "ログイン中…" : "ログイン"}
        </button>
      </form>
      <p className="muted">
        <small>あなただけの記録帳です。</small>
      </p>
    </section>
  );
}
