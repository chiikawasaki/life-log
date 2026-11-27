// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { STATUS_NAMES } from "../src/domain";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
let status: string;
let version: string;
let rule: string;
let art: string;
const legacyGoal = "66666666-6666-4666-8666-666666666666";
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; insert into auth.users values('${owner}'),('${stranger}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202611160001_mvp.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202611270001_goals.sql", "utf8"),
  );
  await db.exec(
    `insert into public.app_owner(user_id) values('${owner}'); set role authenticated; set request.jwt.claim.sub='${owner}';`,
  );
  await db.query("select public.initialize_statuses()");
  status = (
    await db.query<{ id: string }>("select id from statuses where name='知識'")
  ).rows[0].id;
  rule = (
    await db.query<{ save_rule: string }>(
      "select save_rule(null,'勉強',$1,'分',120,1)",
      [status],
    )
  ).rows[0].save_rule;
  version = (await db.query<{ id: string }>("select id from rule_versions"))
    .rows[0].id;
  art = (
    await db.query<{ id: string }>("select id from statuses where name='芸術'")
  ).rows[0].id;
  await db.exec("reset role");
  await db.exec(
    readFileSync(
      "supabase/migrations/202611270002_status_categories.sql",
      "utf8",
    ),
  );
  await db.query(
    "insert into goals (id, user_id, title) values ($1, $2, '既存の目標')",
    [legacyGoal, owner],
  );
  await db.exec(
    readFileSync("supabase/migrations/202611270003_goal_statuses.sql", "utf8"),
  );
  await db.exec("set role authenticated");
  await db.query("select public.initialize_statuses()");
}, 20000);
afterAll(async () => {
  await db.close();
});
it("指定順の13ステータスを繰り返し初期化しても重複しない", async () => {
  await db.query("select initialize_statuses()");
  const { rows } = await db.query<{ id: string; name: string }>(
    "select id, name from statuses order by display_order",
  );
  expect(rows.map(({ name }) => name)).toEqual(STATUS_NAMES);
  expect(rows.find(({ name }) => name === "その他知識")?.id).toBe(status);
  expect(rows.find(({ name }) => name === "デザイン")?.id).toBe(art);
  expect(
    (
      await db.query("select status_id from activity_rules where id = $1", [
        rule,
      ])
    ).rows,
  ).toEqual([{ status_id: status }]);
});
it("所有者が記録・訂正・削除できる", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  await db.query(
    "insert into effort_entries(id,user_id,rule_version_id,performed_on,quantity) values($1,$2,$3,$4,120)",
    [id, owner, version, "2026-01-01"],
  );
  await db.query("update effort_entries set quantity=180 where id=$1", [id]);
  expect(
    (
      await db.query<{ quantity: number }>(
        "select quantity from effort_entries where id=$1",
        [id],
      )
    ).rows[0].quantity,
  ).toBe(180);
  await expect(
    db.query("update effort_entries set rule_version_id=$1 where id=$2", [
      crypto.randomUUID(),
      id,
    ]),
  ).rejects.toThrow("immutable");
  await db.query("delete from effort_entries where id=$1", [id]);
  expect((await db.query("select * from effort_entries")).rows).toHaveLength(0);
});
it("入力制約と所有者参照をDBで強制する", async () => {
  await expect(
    db.query(
      "insert into effort_entries(id,user_id,rule_version_id,performed_on,quantity) values($1,$2,$3,$4,0)",
      [crypto.randomUUID(), owner, version, "2026-01-01"],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into effort_entries(id,user_id,rule_version_id,performed_on,quantity) values($1,$2,$3,$4,1)",
      [crypto.randomUUID(), stranger, version, "2026-01-01"],
    ),
  ).rejects.toThrow();
  await expect(
    db.query("select save_rule(null,'bad',$1,'分',120,1)", [
      crypto.randomUUID(),
    ]),
  ).rejects.toThrow("Invalid status");
});
it("既存の版は変更不可、変更は新しい版になる", async () => {
  await expect(
    db.query("update rule_versions set required_quantity=60"),
  ).rejects.toThrow();
  await db.query("select save_rule($1,'勉強',$2,'分',60,1)", [rule, status]);
  expect(
    (
      await db.query<{ required_quantity: number }>(
        "select required_quantity from rule_versions order by created_at",
      )
    ).rows.map((v) => v.required_quantity),
  ).toEqual([120, 60]);
  await expect(
    db.query("update activity_rules set status_id=$1 where id=$2", [
      status,
      rule,
    ]),
  ).rejects.toThrow();
});
it("別ユーザーは読めず、初期化や書き込みもできない", async () => {
  await db.exec(`set request.jwt.claim.sub='${stranger}';`);
  expect((await db.query("select * from statuses")).rows).toHaveLength(0);
  expect((await db.query("select * from rule_versions")).rows).toHaveLength(0);
  await expect(db.query("select initialize_statuses()")).rejects.toThrow(
    "OWNER_REQUIRED",
  );
  await expect(
    db.query("select save_rule(null,'bad',$1,'分',120,1)", [status]),
  ).rejects.toThrow("OWNER_REQUIRED");
  await expect(
    db.query(
      "insert into effort_entries(id,user_id,rule_version_id,performed_on,quantity) values($1,$2,$3,$4,1)",
      [crypto.randomUUID(), stranger, version, "2026-01-01"],
    ),
  ).rejects.toThrow();
  await db.exec(`set request.jwt.claim.sub='${owner}';`);
});
it("匿名は個人テーブルとRPCにアクセスできない", async () => {
  await db.exec("reset role;set role anon;");
  for (const table of [
    "app_owner",
    "statuses",
    "activity_rules",
    "rule_versions",
    "effort_entries",
  ])
    await expect(db.query("select * from " + table)).rejects.toThrow();
  await expect(db.query("select initialize_statuses()")).rejects.toThrow();
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${owner}';`,
  );
});

it("同じ記録UUIDで再送しても重複せず、訂正内容が反映される", async () => {
  const id = "44444444-4444-4444-8444-444444444444";
  const sql =
    "insert into effort_entries(id,user_id,rule_version_id,performed_on,quantity) values($1,$2,$3,$4,$5) on conflict(id) do update set quantity=excluded.quantity,user_id=excluded.user_id,rule_version_id=excluded.rule_version_id,performed_on=excluded.performed_on";
  await db.query(sql, [id, owner, version, "2026-01-01", 90]);
  await db.query(sql, [id, owner, version, "2026-01-01", 120]);
  expect(
    (
      await db.query<{ quantity: number }>(
        "select quantity from effort_entries where id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ quantity: 120 }]);
});

it("目標は所有者だけが登録し、達成状態を変更できる", async () => {
  const id = crypto.randomUUID();
  await db.query(
    "insert into goals (id, user_id, title) values ($1, $2, $3) on conflict (id) do nothing",
    [id, owner, "本を1冊読む"],
  );
  await db.query("update goals set completed_at = now() where id = $1", [id]);
  expect(
    (
      await db.query<{ completed_at: Date }>(
        "select completed_at from goals where id = $1",
        [id],
      )
    ).rows[0].completed_at,
  ).not.toBeNull();
  try {
    await db.exec(`set request.jwt.claim.sub='${stranger}';`);
    expect(
      (await db.query("select id from goals where id = $1", [id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update goals set completed_at = null where id = $1 returning id",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("insert into goals (user_id, title) values ($1, $2)", [
        stranger,
        "goal",
      ]),
    ).rejects.toThrow();
  } finally {
    await db.exec(`set request.jwt.claim.sub='${owner}';`);
  }
  await db.query("update goals set completed_at = null where id = $1", [id]);
  expect(
    (
      await db.query<{ completed_at: Date | null }>(
        "select completed_at from goals where id = $1",
        [id],
      )
    ).rows[0].completed_at,
  ).toBeNull();
});

it("既存目標に複数のステータスを設定でき、不明・重複IDを拒否する", async () => {
  const { rows } = await db.query<{ id: string }>(
    "select id from statuses where name in ('英語', '研究') order by display_order",
  );
  const ids = rows.map(({ id }) => id);
  expect(ids).toHaveLength(2);
  const read = () =>
    db.query("select required_status_ids from goals where id = $1", [
      legacyGoal,
    ]);
  expect((await read()).rows).toEqual([{ required_status_ids: [] }]);
  await db.query(
    "update goals set required_status_ids = $1::uuid[] where id = $2",
    [ids, legacyGoal],
  );
  expect((await read()).rows).toEqual([{ required_status_ids: ids }]);
  for (const invalid of [[ids[0], ids[0]], [crypto.randomUUID()]]) {
    await expect(
      db.query(
        "update goals set required_status_ids = $1::uuid[] where id = $2",
        [invalid, legacyGoal],
      ),
    ).rejects.toThrow("Invalid goal statuses");
  }
  expect((await read()).rows).toEqual([{ required_status_ids: ids }]);
});
