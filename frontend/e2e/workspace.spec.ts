import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("owner setup, settings, wallets, requests, public billing, cancellation and responsive reporting", async ({
  page,
  context,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  const setup = await page.request.get("/api/auth/setup");
  if ((await setup.json()).setup_required) {
    await expect(
      page.getByRole("heading", { name: "Set up your workspace" }),
    ).toBeVisible();
    await page.getByLabel("Email address").fill("browser@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser-test-password-123");
    await page
      .getByLabel("Installation setup token")
      .fill(
        process.env.E2E_SETUP_TOKEN ||
          "browser-validation-setup-token-2026-isolated-instance",
      );
    await page.getByRole("button", { name: "Create workspace" }).click();
  } else {
    await page.getByLabel("Email address").fill("browser@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser-test-password-123");
    await page.getByRole("button", { name: "Sign in", exact: false }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar nav svg").first()).toHaveCSS(
    "width",
    "20px",
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Etherscan API key")
    .fill("fixture-key-no-live-network");
  await page.getByLabel("Ethereum mainnet", { exact: true }).check();
  await page.getByLabel("Public base URL").fill(baseURL!);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Wallets", exact: true }).click();
  const suffix = Date.now().toString(16).padStart(40, "0");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Business receiving wallet");
  await page.getByLabel("Public receiving address").fill("0x" + suffix);
  await page.getByLabel("Use as default").check();
  await page.getByRole("button", { name: "Register wallet" }).click();
  await expect(page.getByRole("status")).toContainText("Wallet saved");
  await page
    .getByRole("link", { name: "Payment requests", exact: true })
    .click();
  await page.getByRole("link", { name: "Create payment request" }).click();
  const description = "Website design " + Date.now();
  await page.getByLabel("What is this payment for?").fill(description);
  await page.getByLabel("Exact amount").fill("145.123456");
  await page.getByRole("button", { name: "Create payment request" }).click();
  await expect(page.getByRole("heading", { name: description })).toBeVisible();
  await expect(page.getByAltText("Wallet payment QR code")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download billing PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^CP-.*\.pdf$/);
  await page.getByRole("button", { name: "Generate public page" }).click();
  const publicHref = await page
    .getByRole("link", { name: "Open public billing page" })
    .getAttribute("href");
  const publicContext = await context.browser()!.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(publicHref!);
  await expect(
    publicPage.getByRole("heading", { name: description }),
  ).toBeVisible();
  await expect(
    publicPage.getByAltText("Scan to prepare this token payment"),
  ).toBeVisible();
  expect(
    await publicPage
      .getByRole("button", { name: "Cancel payment request" })
      .count(),
  ).toBe(0);
  expect(
    (
      await new AxeBuilder({ page: publicPage })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await publicContext.close();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel payment request" }).click();
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Wallet payment QR code")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Payment requests", exact: true })
    .click();
  await page.getByLabel("Status", { exact: true }).selectOption("CANCELED");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: description })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment activity" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "../artifacts/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../artifacts/overview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
