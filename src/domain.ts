export const STATUS_NAMES = [
  "知識",
  "体力",
  "コミュ力",
  "芸術",
  "生活力",
  "副業",
];
export type Status = { id: string; name: string; display_order: number };
export type Rule = {
  id: string;
  name: string;
  status_id: string;
  archived_at: string | null;
};
export type Version = {
  id: string;
  rule_id: string;
  unit: string;
  required_quantity: number;
  reward_points: number;
  created_at: string;
};
export type Entry = {
  id: string;
  rule_version_id: string;
  performed_on: string;
  quantity: number;
  note: string;
  created_at: string;
};
export type Data = {
  statuses: Status[];
  rules: Rule[];
  versions: Version[];
  entries: Entry[];
};
export const emptyData: Data = {
  statuses: [],
  rules: [],
  versions: [],
  entries: [],
};
export const MAX_QUANTITY = 1_000_000;
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}
export function positiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateEntry(quantity: number, date: string, note: string) {
  if (!positiveInteger(quantity))
    throw new Error("数量は1〜1,000,000の整数で入力してください。");
  if (!validDate(date) || date > today())
    throw new Error("実施日は今日以前の有効な日付を選んでください。");
  if (note.length > 1000)
    throw new Error("メモは1,000文字以内で入力してください。");
}
export function summarize(data: Data, through = "9999-12-31") {
  const quantities = new Map<string, number>();
  for (const entry of data.entries)
    if (entry.performed_on <= through)
      quantities.set(
        entry.rule_version_id,
        (quantities.get(entry.rule_version_id) ?? 0) + entry.quantity,
      );
  const points: Record<string, number> = Object.fromEntries(
    data.statuses.map((s) => [s.id, 0]),
  );
  const progress = data.versions.map((version) => {
    const quantity = quantities.get(version.id) ?? 0;
    const earned =
      Math.floor(quantity / version.required_quantity) * version.reward_points;
    const rule = data.rules.find((r) => r.id === version.rule_id);
    if (rule) points[rule.status_id] = (points[rule.status_id] ?? 0) + earned;
    return {
      ...version,
      quantity,
      earned,
      remainder: quantity % version.required_quantity,
      remaining:
        version.required_quantity - (quantity % version.required_quantity),
    };
  });
  const xp = Object.values(points).reduce((a, b) => a + b, 0);
  return {
    points,
    progress,
    xp,
    level: 1 + Math.floor(xp / 15),
    levelProgress: xp % 15,
    next: 15 - (xp % 15),
  };
}
export function shiftDay(day: string, delta: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function periodDays(mode: "week" | "month", end: string) {
  const date = new Date(end + "T00:00:00Z");
  const start =
    mode === "week"
      ? shiftDay(end, -((date.getUTCDay() + 6) % 7))
      : end.slice(0, 8) + "01";
  const days: string[] = [];
  for (let day = start; day <= end; day = shiftDay(day, 1)) days.push(day);
  return days;
}
export function dailyPoints(data: Data, days: string[]) {
  return days.map((day) => ({
    day,
    xp: summarize(data, day).xp - summarize(data, shiftDay(day, -1)).xp,
    count: data.entries.filter((e) => e.performed_on === day).length,
  }));
}
