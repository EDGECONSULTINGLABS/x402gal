import { test, expect } from "@playwright/test";

test.setTimeout(90_000);
test("dashboard renders and demo round-trip works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await expect(page.getByText("402GAL", { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Water-offset rails for AI agents")).toBeVisible();
  await expect(page.locator("text=Water restored").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Pending batch")).toBeVisible();
  await expect(page.getByText(/Footprint methodology/)).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/01-loaded.png", fullPage: true });

  // Single 402-paid query — should appear in pending batch (no XRPL flush yet).
  await page.getByRole("button", { name: /Send 1 paid query/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "e2e/screenshots/02-after-single.png", fullPage: true });

  // Burst 100 calls — must trigger an XRPL settlement (batch flush).
  await page.getByRole("button", { name: /Burst 100/i }).first().click();
  await expect(page.getByText("XRPL settlement")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Aggregated calls")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/03-after-flush.png", fullPage: true });

  expect(errors, errors.join("\n")).toEqual([]);
});
