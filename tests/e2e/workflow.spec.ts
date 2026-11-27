import { test, expect } from "@playwright/test";
import { STATUS_NAMES } from "../../src/domain";
test("ログイン・時間記録・訂正・振り返り・削除", async ({ page }, testInfo) => {
  const capture = (name: string) =>
    page.screenshot({
      path: testInfo.outputPath(name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  const owner = "11111111-1111-4111-8111-111111111111";
  const user = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.test",
    created_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
  };
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: owner,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "signature",
  ]
    .map((p) =>
      Buffer.from(typeof p === "string" ? p : JSON.stringify(p)).toString(
        "base64url",
      ),
    )
    .join(".");
  const statuses = STATUS_NAMES.map((name, i) => ({
    id: "status" + i,
    user_id: owner,
    name,
    display_order: i,
  }));
  const rules = [
    {
      id: "rule",
      user_id: owner,
      name: "勉強",
      status_id: "status0",
      archived_at: null,
    },
  ];
  const versions = [
    {
      id: "version",
      user_id: owner,
      rule_id: "rule",
      unit: "分",
      required_quantity: 120,
      reward_points: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const goals: Record<string, unknown>[] = [];
  let entries: Record<string, unknown>[] = [];
  await page.route("https://life-log-test.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    let body: unknown = {};
    if (url.pathname === "/auth/v1/token")
      body = {
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/rest/v1/rpc/initialize_statuses") body = null;
    else if (url.pathname === "/rest/v1/statuses") body = statuses;
    else if (url.pathname === "/rest/v1/activity_rules") body = rules;
    else if (url.pathname === "/rest/v1/rule_versions") body = versions;
    else if (url.pathname === "/rest/v1/goals") {
      if (req.method() === "POST") {
        const value = req.postDataJSON();
        if (!goals.some((goal) => goal.id === value.id)) {
          goals.push({
            ...value,
            created_at: new Date().toISOString(),
            completed_at: null,
          });
        }
        body = null;
      } else if (req.method() === "PATCH") {
        const goal = goals.find(
          (item) => item.id === url.searchParams.get("id")?.slice(3),
        );
        Object.assign(goal!, req.postDataJSON());
        body = goal;
      } else body = goals;
    } else if (url.pathname === "/rest/v1/effort_entries") {
      if (req.method() === "POST") {
        const value = req.postDataJSON();
        if (!entries.some((e) => e.id === value.id))
          entries.push({ ...value, created_at: new Date().toISOString() });
        body = null;
      } else if (req.method() === "PATCH") {
        const id = url.searchParams.get("id")?.slice(3);
        entries = entries.map((e) =>
          e.id === id ? { ...e, ...req.postDataJSON() } : e,
        );
        body = { id };
      } else if (req.method() === "DELETE") {
        const id = url.searchParams.get("id")?.slice(3);
        entries = entries.filter((e) => e.id !== id);
        body = null;
      } else body = entries;
    } else if (url.pathname === "/auth/v1/logout") body = null;
    else throw new Error("Unexpected API: " + url.pathname);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "ログイン", exact: true }),
  ).toBeVisible();
  await capture("login");
  await page.getByLabel("メールアドレス").fill("owner@example.test");
  await page.getByLabel("パスワード").fill("test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日の記録" })).toBeVisible();
  await page.getByLabel("時間", { exact: true }).fill("1");
  await page.getByLabel("分", { exact: true }).fill("30");
  await page
    .locator("form")
    .getByRole("button", { name: "記録する", exact: true })
    .click();
  const recordNotice = page.getByRole("dialog", { name: "記録を保存しました" });
  await expect(recordNotice).toBeVisible();
  await expect(recordNotice.getByText("レベルアップ！")).toHaveCount(0);
  await expect(recordNotice).toBeHidden({ timeout: 6000 });
  await expect(page.getByText(/あと 30 分で達成/)).toBeVisible();
  await page.getByLabel("分", { exact: true }).fill("30");
  await page
    .locator("form")
    .getByRole("button", { name: "記録する", exact: true })
    .click();
  await expect(recordNotice).toBeVisible();
  await recordNotice.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator(".hero")).toContainText("これまでの努力 1 XP");
  await capture("home");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const activeGoals = page.getByRole("region", { name: "進行中の目標" });
  await activeGoals.getByRole("button", { name: "目標を管理" }).click();
  await page.getByLabel("目標の内容").fill("本を1冊読む");
  await page.getByRole("button", { name: "目標を登録" }).click();
  await expect(activeGoals).toContainText("本を1冊読む");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "記録する" })
    .click();
  await expect(activeGoals).toContainText("本を1冊読む");
  await capture("goals-home");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "目標", exact: true })
    .click();
  await activeGoals.getByRole("button", { name: "達成にする" }).click();
  const completedGoals = page.getByRole("region", { name: "達成した目標" });
  await expect(completedGoals).toContainText("本を1冊読む");
  await expect(completedGoals).toContainText("達成日");
  await expect(activeGoals).not.toContainText("本を1冊読む");
  await capture("goals");
  await page.reload();
  await expect(activeGoals).toContainText("進行中の目標はありません。");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "目標", exact: true })
    .click();
  await expect(completedGoals).toContainText("本を1冊読む");
  await completedGoals.getByRole("button", { name: "進行中に戻す" }).click();
  await expect(activeGoals).toContainText("本を1冊読む");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "記録する" })
    .click();
  const headerNav = page
    .getByRole("banner")
    .getByRole("navigation", { name: "メインメニュー" });
  await expect(
    headerNav.getByRole("button", { name: "記録する" }),
  ).toHaveAttribute("aria-current", "page");
  const historyLink = headerNav.getByRole("button", {
    name: "履歴",
    exact: true,
  });
  await historyLink.click();
  await expect(historyLink).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".list-item")).toHaveCount(2);
  await capture("history");
  await page.getByRole("button", { name: "訂正", exact: true }).first().click();
  await page.getByLabel("分", { exact: true }).fill("1800");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(recordNotice).toContainText("レベルアップ！");
  await expect(recordNotice).toContainText("Lv. 2");
  await capture("level-up");
  await recordNotice.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "訂正", exact: true }).first().click();
  await page.getByLabel("分", { exact: true }).fill("60");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(recordNotice).toBeVisible();
  await expect(recordNotice.getByText("レベルアップ！")).toHaveCount(0);
  await recordNotice.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "振り返り", exact: true }).click();
  const reflection = page.getByRole("region", { name: "振り返りの表示期間" });
  await expect(reflection).toContainText("1 XP / 2件");
  const charts = [
    page.getByRole("img", { name: "日ごとの獲得XPの折れ線グラフ" }),
    page.getByRole("img", { name: "日ごとの記録件数の棒グラフ" }),
    page.getByRole("img", { name: "ステータス別の獲得XPのドーナツグラフ" }),
  ];
  for (const chart of charts) {
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toBeInViewport();
    await expect
      .poll(() =>
        chart.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return canvas
            .getContext("2d")
            ?.getImageData(0, 0, canvas.width, canvas.height)
            .data.some((channel) => channel !== 0);
        }),
      )
      .toBe(true);
  }
  await capture("reflection");
  await page.getByLabel("この日まで").fill("2026-01-04");
  await expect(reflection).toContainText("2025-12-05 〜 2026-01-04");
  await page.getByText("1週間", { exact: true }).click();
  await expect(reflection).toContainText("2025-12-29 〜 2026-01-04");
  await page.getByText("3ヶ月", { exact: true }).click();
  await expect(reflection).toContainText("2025-10-05 〜 2026-01-04");
  await expect(reflection).toContainText("0 XP / 0件");
  await expect(
    page.getByText("この期間に獲得したXPはありません。"),
  ).toBeVisible();
  await page.getByText("日別の数値を見る").click();
  await expect(page.getByRole("row", { name: "2026-01-04 0 0" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "履歴", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "削除", exact: true }).first().click();
  await expect(page.locator(".list-item")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "記録する", exact: true })
    .click();
  await expect(page.locator(".hero")).toContainText("これまでの努力 0 XP");
  await page.reload();
  await expect(page.getByRole("heading", { name: "今日の記録" })).toBeVisible();
  await page.getByRole("button", { name: "行動ルール", exact: true }).click();
  await page.getByRole("button", { name: "追加する", exact: true }).click();
  await capture("rules");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(
    page.getByRole("button", { name: "ログイン", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
