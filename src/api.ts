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
export async function loadData(): Promise<Data> {
  const c = client();
  const init = await c.rpc("initialize_statuses");
  if (init.error) throw init.error;
  const results = await Promise.all(
    ["statuses", "activity_rules", "rule_versions", "effort_entries"].map(
      async (table) => {
        // Page explicitly: Supabase defaults to a 1,000-row response cap.
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await c
            .from(table)
            .select("*")
            .order("id")
            .range(offset, offset + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) return rows;
        }
      },
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
