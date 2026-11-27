import { test, expect } from "@playwright/test";
import { STATUS_NAMES } from "../../src/domain";
test("ログイン・時間記録・訂正・振り返り・削除", async ({ page }, testInfo) => {
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
    else if (url.pathname === "/rest/v1/effort_entries") {
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
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
    animations: "disabled",
  });
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
  await expect(page.getByText(/あと 30 分で達成/)).toBeVisible();
  await page.getByLabel("分", { exact: true }).fill("30");
  await page
    .locator("form")
    .getByRole("button", { name: "記録する", exact: true })
    .click();
  await expect(page.locator(".hero")).toContainText("これまでの努力 1 XP");
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  await page.getByRole("button", { name: "訂正", exact: true }).first().click();
  await page.getByLabel("分", { exact: true }).fill("60");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByText("記録を更新しました。")).toBeVisible();
  await page.getByRole("button", { name: "振り返り", exact: true }).click();
  await expect(page.locator(".chart")).toContainText("1 XP / 2件");
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
  await page.screenshot({
    path: testInfo.outputPath("rules.png"),
    fullPage: true,
    animations: "disabled",
  });
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
