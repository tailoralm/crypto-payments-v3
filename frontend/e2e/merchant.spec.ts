import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("unique merchant charge publishes explicitly, discloses increment and revokes anonymous access", async ({
  page,
  context,
  baseURL,
}) => {
  const auth = await page.request.post("/api/auth/login", {
    data: {
      email: "browser@example.com",
      password: "Browser-test-password-123",
    },
  });
  // The existing workspace fixture creates the owner; this test also supports a fresh isolated stack.
  let login = await auth.json();
  if (!auth.ok()) {
    const setup = await page.request.get("/api/auth/setup");
    if ((await setup.json()).setup_required) {
      const r = await page.request.post("/api/auth/register", {
        headers: {
          "X-Setup-Token":
            process.env.E2E_SETUP_TOKEN ||
            "browser-validation-setup-token-2026-isolated-instance",
        },
        data: {
          email: "browser@example.com",
          password: "Browser-test-password-123",
        },
      });
      expect(r.ok()).toBeTruthy();
      login = await r.json();
    } else throw new Error("Isolated browser fixture owner is unavailable.");
  }
  const headers = { Authorization: "Bearer " + login.access_token };
  expect(
    (
      await page.request.patch("/api/configs", {
        headers,
        data: {
          public_base_url: baseURL,
          etherscan_key: "fixture",
          chains: { ethereum: true, bsc: false, solana: false },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const w = await page.request.post("/api/wallets", {
    headers,
    data: {
      chain: "ethereum",
      address: "0x" + Date.now().toString(16).padStart(40, "0"),
      description: "Merchant fixture",
    },
  });
  expect(w.ok()).toBeTruthy();
  const payload = {
    wallet_id: (await w.json()).id,
    description: "Merchant unique order",
    value: "25",
    amount_mode: "unique",
    external_order_id: "fixture-order",
  };
  const created = await page.request.post("/api/payments", {
    headers: { ...headers, "Idempotency-Key": "merchant-" + Date.now() },
    data: payload,
  });
  expect(created.ok()).toBeTruthy();
  const p = await created.json();
  expect(p.value).toBe("25.000001");
  expect(p.public_url).toBeNull();
  await page.goto(`/payments/${p.id}`);
  await expect(
    page.getByRole("heading", { name: payload.description }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate public page" }).click();
  const url = await page
    .getByRole("link", { name: "Open public billing page" })
    .getAttribute("href");
  expect(url).toBeTruthy();
  const anonymous = await context
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 } });
  const bill = await anonymous.newPage();
  await bill.goto(url!);
  await expect(bill.getByText(/Requested 25 USDT/)).toBeVisible();
  await expect(bill.getByRole("button", { name: "Copy amount" })).toBeVisible();
  await expect(
    bill.getByRole("link", { name: "Open compatible wallet" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page: bill })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await bill.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await bill.screenshot({
    path: "../artifacts/merchant-bill-mobile.png",
    fullPage: true,
  });
  await bill.setViewportSize({ width: 1440, height: 1000 });
  await bill.screenshot({
    path: "../artifacts/merchant-bill-desktop.png",
    fullPage: true,
  });
  await bill.clock.install();
  await bill.clock.fastForward(25 * 3600000);
  await expect(
    bill.getByRole("link", { name: "Open compatible wallet" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke public page" }).click();
  await expect(
    page.getByRole("button", { name: "Generate public page" }),
  ).toBeVisible();
  await bill.reload();
  await expect(bill.getByRole("alert")).toContainText(
    "Billing request not found",
  );
  await expect(
    bill.getByAltText("Scan to prepare this token payment"),
  ).toHaveCount(0);
  await anonymous.close();
});

test("overview refresh pauses when hidden, announces successes and recovers without losing data", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/login", {
    data: {
      email: "browser@example.com",
      password: "Browser-test-password-123",
    },
  });
  expect(login.ok()).toBeTruthy();
  let items: any[] = [],
    polls = 0;
  await page.route("**/api/notifications**", async (route) => {
    if (route.request().method() === "POST") {
      items = items.map((n) => ({ ...n, read_at: new Date().toISOString() }));
      await route.fulfill({ json: { read: true } });
      return;
    }
    polls++;
    await route.fulfill({
      json: {
        items,
        unread: items.filter((n) => !n.read_at).length,
        total: items.length,
        page: 1,
        page_size: 25,
      },
    });
  });
  await page.clock.install();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Payment alerts · 0 unread/ }),
  ).toBeVisible();
  const initial = polls;
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    }),
  );
  await page.clock.runFor(60000);
  expect(polls).toBe(initial);
  items = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      payment_id: "22222222-2222-4222-8222-222222222222",
      message: "Payment CP-FIXTURE received.",
      read_at: null,
    },
  ];
  await page.getByRole("link", { name: "Overview", exact: true }).focus();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("status").filter({ hasText: "New payment received" }),
  ).toContainText("1 unread");
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Payment alerts · 0 unread/ }),
  ).toBeVisible();
  await page.clock.runFor(30000);
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toHaveCount(0);
  await page.route("**/api/reports/dashboard", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Fixture network outage" } },
    }),
  );
  await page.clock.runFor(30000);
  await expect(page.getByRole("alert")).toContainText("Fixture network outage");
  await expect(
    page.getByText("Received today", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/api/reports/dashboard");
  await page.clock.runFor(30000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Payment alerts · 0 unread/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const stopped = polls;
  await page.clock.runFor(60000);
  expect(polls).toBe(stopped);
});
