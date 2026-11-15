import { describe, expect, it } from "vitest";
import {
  type Data,
  summarize,
  dailyPoints,
  periodDays,
  validateEntry,
} from "../src/domain";
const base: Data = {
  statuses: [
    { id: "knowledge", name: "知識", display_order: 1 },
    { id: "health", name: "体力", display_order: 2 },
  ],
  rules: [
    { id: "study", name: "勉強", status_id: "knowledge", archived_at: null },
    { id: "gym", name: "運動", status_id: "health", archived_at: null },
  ],
  versions: [
    {
      id: "v1",
      rule_id: "study",
      unit: "分",
      required_quantity: 120,
      reward_points: 1,
      created_at: "2026-01-01",
    },
    {
      id: "g1",
      rule_id: "gym",
      unit: "回",
      required_quantity: 1,
      reward_points: 1,
      created_at: "2026-01-01",
    },
  ],
  entries: [],
};
const entry = (
  quantity: number,
  date = "2026-01-01",
  version = "v1",
  id = crypto.randomUUID(),
) => ({
  id,
  quantity,
  performed_on: date,
  rule_version_id: version,
  note: "",
  created_at: date,
});
describe("成長の計算", () => {
  it("空の記録はレベル1・0XP", () => {
    expect(summarize(base)).toMatchObject({ xp: 0, level: 1, next: 15 });
  });
  it("日をまたぐ90分と30分を累積する", () => {
    const data = { ...base, entries: [entry(90), entry(30, "2026-01-02")] };
    expect(summarize(data, "2026-01-01").progress[0]).toMatchObject({
      earned: 0,
      remaining: 30,
    });
    expect(summarize(data).xp).toBe(1);
  });
  it("まとめて5時間記録した場合は2XPと残り60分", () => {
    expect(
      summarize({ ...base, entries: [entry(300)] }).progress[0],
    ).toMatchObject({ earned: 2, remainder: 60, remaining: 60 });
  });
  it.each([
    [0, 1, 15],
    [14, 1, 1],
    [15, 2, 15],
    [29, 2, 1],
    [30, 3, 15],
  ])("%i XPはレベル%i", (xp, level, next) => {
    expect(
      summarize({
        ...base,
        entries: xp ? [entry(xp, "2026-01-01", "g1")] : [],
      }),
    ).toMatchObject({ xp, level, next });
  });
  it("別ステータスの経験値も合算する", () => {
    expect(
      summarize({
        ...base,
        entries: [entry(120), entry(2, "2026-01-02", "g1")],
      }),
    ).toMatchObject({ xp: 3, points: { knowledge: 1, health: 2 } });
  });
  it("ルールの版を変更しても過去の閾値や端数を混ぜない", () => {
    const data = {
      ...base,
      versions: [
        ...base.versions,
        {
          ...base.versions[0],
          id: "v2",
          required_quantity: 60,
          created_at: "2026-01-03",
        },
      ],
      entries: [entry(90), entry(30, "2026-01-03", "v2")],
    };
    expect(summarize(data).xp).toBe(0);
    expect(
      summarize({
        ...data,
        entries: [...data.entries, entry(30, "2026-01-04", "v2")],
      }).xp,
    ).toBe(1);
  });
  it("訂正と削除でポイントを再計算し、非表示ルールのポイントは残る", () => {
    const data = {
      ...base,
      rules: base.rules.map((r) => ({ ...r, archived_at: "2026-01-03" })),
      entries: [entry(240)],
    };
    expect(summarize(data).xp).toBe(2);
    expect(summarize({ ...data, entries: [entry(60)] }).xp).toBe(0);
    expect(summarize({ ...data, entries: [] }).xp).toBe(0);
  });
  it("期間前の端数を含め、閾値を越えた日にXPを計上する", () => {
    expect(
      dailyPoints({ ...base, entries: [entry(90, "2025-12-31"), entry(30)] }, [
        "2026-01-01",
      ]),
    ).toEqual([{ day: "2026-01-01", xp: 1, count: 1 }]);
  });
  it("週は月曜から・月は1日から（年境界も対応）", () => {
    expect(periodDays("week", "2026-01-01")).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
    ]);
    expect(periodDays("month", "2026-01-02")).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });
  it.each([0, -1, 0.5, Infinity, NaN, 1000001])(
    "不正数量 %s を拒否する",
    (q) => {
      expect(() => validateEntry(q, "2026-01-01", "")).toThrow();
    },
  );
  it("無効日・未来日・長すぎるメモを拒否する", () => {
    for (const date of ["2026-02-30", "2099-01-01", "bad"])
      expect(() => validateEntry(1, date, "")).toThrow();
    expect(() => validateEntry(1, "2026-01-01", "x".repeat(1001))).toThrow();
  });
});
