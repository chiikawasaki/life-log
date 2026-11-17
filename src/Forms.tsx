import { useRef, useState, type FormEvent } from "react";
import {
  type Data,
  type Entry,
  type Rule,
  positiveInteger,
  today,
  validateEntry,
} from "./domain";
export function EntryForm({
  data,
  entry,
  busy,
  onSave,
  onCancel,
}: {
  data: Data;
  entry?: Entry;
  busy: boolean;
  onSave: (value: Omit<Entry, "created_at">) => Promise<void>;
  onCancel?: () => void;
}) {
  const active = data.rules.filter((r) => !r.archived_at);
  const versions = data.versions
    .filter((v) => active.some((r) => r.id === v.rule_id))
    .filter(
      (v) =>
        !data.versions.some(
          (other) =>
            other.rule_id === v.rule_id && other.created_at > v.created_at,
        ),
    );
  if (entry && !versions.some((v) => v.id === entry.rule_version_id)) {
    const old = data.versions.find((v) => v.id === entry.rule_version_id);
    if (old) versions.push(old);
  }
  const [versionId, setVersionId] = useState(
    entry?.rule_version_id ?? versions[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState(entry?.quantity.toString() ?? "");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(entry?.performed_on ?? today());
  const [note, setNote] = useState(entry?.note ?? "");
  const [validation, setValidation] = useState("");
  const id = useRef(entry?.id ?? crypto.randomUUID());
  const sending = useRef(false);
  const version = data.versions.find((v) => v.id === versionId);
  const minutes = version?.unit === "分";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || sending.current) return;
    const amount =
      Number(quantity || 0) + (minutes ? Number(hours || 0) * 60 : 0);
    try {
      if (!version) throw new Error("行動を選んでください。");
      validateEntry(amount, date, note);
    } catch (e) {
      setValidation((e as Error).message);
      return;
    }
    sending.current = true;
    setValidation("");
    try {
      await onSave({
        id: id.current,
        rule_version_id: versionId,
        quantity: amount,
        performed_on: date,
        note,
      });
      if (!entry) {
        id.current = crypto.randomUUID();
        setQuantity("");
        setHours("");
        setNote("");
      }
    } catch {
      /* Parent displays server errors; keep input and request ID. */
    } finally {
      sending.current = false;
    }
  }
  if (!versions.length)
    return (
      <div className="empty">
        まず「行動ルール」で、記録したい行動を登録しましょう。
      </div>
    );
  return (
    <form onSubmit={submit} className="form">
      <label>
        行動
        <select
          value={versionId}
          disabled={busy || !!entry}
          onChange={(e) => {
            setVersionId(e.target.value);
            setHours("");
            setQuantity("");
          }}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {data.rules.find((r) => r.id === v.rule_id)?.name}（
              {v.required_quantity}
              {v.unit}で＋{v.reward_points}）
            </option>
          ))}
        </select>
      </label>
      <div className="form-row entry-fields">
        <label>
          実施日
          <input
            type="date"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </label>
        {minutes && (
          <label>
            時間
            <input
              inputMode="numeric"
              type="number"
              min="0"
              step="1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={busy}
              placeholder="0"
            />
          </label>
        )}
        <label>
          {minutes ? "分" : `数量（${version?.unit ?? ""}）`}
          <input
            inputMode="numeric"
            type="number"
            min="0"
            max="1000000"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={busy}
            placeholder="0"
          />
        </label>
      </div>
      <label>
        メモ <span className="muted">任意</span>
        <textarea
          maxLength={1000}
          rows={2}
          placeholder="今日は何に取り組みましたか？"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </label>
      {validation && (
        <p role="alert" className="error">
          {validation}
        </p>
      )}
      <div className="actions">
        <button disabled={busy} type="submit">
          {busy ? "保存中…" : entry ? "変更を保存" : "努力を記録する"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
export function RuleForm({
  data,
  editing,
  busy,
  onSave,
  onCancel,
}: {
  data: Data;
  editing?: Rule;
  busy: boolean;
  onSave: (args: {
    p_rule_id: string | null;
    p_name: string;
    p_status_id: string;
    p_unit: string;
    p_required_quantity: number;
    p_reward_points: number;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const current = data.versions
    .filter((v) => v.rule_id === editing?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const [name, setName] = useState(editing?.name ?? "");
  const [status, setStatus] = useState(
    editing?.status_id ?? data.statuses[0]?.id ?? "",
  );
  const [unit, setUnit] = useState(current?.unit ?? "分");
  const [required, setRequired] = useState(
    current?.required_quantity.toString() ?? "120",
  );
  const [reward, setReward] = useState(
    current?.reward_points.toString() ?? "1",
  );
  const [error, setError] = useState("");
  const sending = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || sending.current) return;
    if (
      !name.trim() ||
      !unit.trim() ||
      !status ||
      !positiveInteger(Number(required)) ||
      !positiveInteger(Number(reward))
    ) {
      setError("名前・単位と、1〜1,000,000の整数を入力してください。");
      return;
    }
    sending.current = true;
    try {
      await onSave({
        p_rule_id: editing?.id ?? null,
        p_name: name.trim(),
        p_status_id: status,
        p_unit: unit.trim(),
        p_required_quantity: Number(required),
        p_reward_points: Number(reward),
      });
    } catch {
      /* Preserve input. */
    } finally {
      sending.current = false;
    }
  }
  return (
    <form className="form inset" onSubmit={submit}>
      <h3>{editing ? "ルールを変更" : "新しい行動ルール"}</h3>
      {editing && (
        <p className="muted">
          過去の記録はそのまま残ります。変更前の端数は新しいルールに持ち越されません。ステータスは変更できません。
        </p>
      )}
      <label>
        行動の名前
        <input
          required
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：勉強、論文を読む"
        />
      </label>
      <label>
        ステータス
        <select
          value={status}
          disabled={busy || !!editing}
          onChange={(e) => setStatus(e.target.value)}
        >
          {data.statuses.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          必要な量
          <input
            type="number"
            min="1"
            max="1000000"
            step="1"
            required
            value={required}
            disabled={busy}
            onChange={(e) => setRequired(e.target.value)}
          />
        </label>
        <label>
          単位
          <select
            value={unit}
            disabled={busy}
            onChange={(e) => setUnit(e.target.value)}
          >
            {["分", "回", "本", "冊", "件"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          ポイント
          <input
            type="number"
            min="1"
            max="1000000"
            step="1"
            required
            value={reward}
            disabled={busy}
            onChange={(e) => setReward(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={busy}>保存する</button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
