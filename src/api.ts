import { createClient } from "@supabase/supabase-js";
import { type Data, type Entry, validateEntry } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
function client() {
  if (!db) throw new Error("Supabaseの接続設定がありません。");
  return db;
}
export function friendlyError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42P01")
    return "データベースの準備が必要です。セットアップ手順に沿ってマイグレーションを適用してください。";
  if (e.code === "42501" || e.message?.includes("OWNER_REQUIRED"))
    return "このアカウントは利用者として登録されていません。所有者アカウントの設定を確認してください。";
  if (e.message?.includes("Invalid login credentials"))
    return "メールアドレスまたはパスワードを確認してください。";
  if (e.message?.includes("Failed to fetch"))
    return "接続できませんでした。通信状態を確認して再試行してください。";
  return "処理を完了できませんでした。入力は保持されています。接続や設定を確認して再試行してください。";
}
async function loadRows<T>(table: string) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    // Supabase caps responses at 1,000 rows by default.
    const { data, error } = await client()
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 499)
      .returns<T[]>();
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export type Goal = {
  id: string;
  title: string;
  created_at: string;
  completed_at: string | null;
  required_status_ids: string[];
};

export function loadGoals() {
  return loadRows<Goal>("goals");
}

export async function createGoal(
  id: string,
  userId: string,
  title: string,
  statusIds: string[],
) {
  const { error } = await client()
    .from("goals")
    .upsert(
      { id, user_id: userId, title, required_status_ids: statusIds },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export function setGoalCompleted(id: string, completedAt: string | null) {
  return updateGoal(id, { completed_at: completedAt });
}

export function setGoalStatuses(id: string, statusIds: string[]) {
  return updateGoal(id, { required_status_ids: statusIds });
}

async function updateGoal(
  id: string,
  changes: Partial<Pick<Goal, "completed_at" | "required_status_ids">>,
) {
  const { data, error } = await client()
    .from("goals")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single<Goal>();
  if (error) throw error;
  return data;
}

export async function loadData(): Promise<Data> {
  const c = client();
  const init = await c.rpc("initialize_statuses");
  if (init.error) throw init.error;
  const results = await Promise.all(
    ["statuses", "activity_rules", "rule_versions", "effort_entries"].map(
      (table) => loadRows<unknown>(table),
    ),
  );
  const result = {
    statuses: results[0],
    rules: results[1],
    versions: results[2],
    entries: results[3],
  } as Data;
  result.statuses.sort((a, b) => a.display_order - b.display_order);
  return result;
}
export async function saveEntry(
  entry: Omit<Entry, "created_at">,
  userId: string,
  editing: boolean,
) {
  validateEntry(entry.quantity, entry.performed_on, entry.note);
  const payload = { ...entry, user_id: userId };
  const result = editing
    ? await client()
        .from("effort_entries")
        .update(payload)
        .eq("id", entry.id)
        .select("id")
        .single()
    : await client()
        .from("effort_entries")
        .upsert(payload, { onConflict: "id" });
  if (result.error) throw result.error;
}
