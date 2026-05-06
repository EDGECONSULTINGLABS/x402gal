import { test, expect } from "@playwright/test";

test("dashboard renders and demo round-trip works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await expect(page.getByText("Meraxis", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Water-offset rails for AI agents")).toBeVisible();
  await expect(page.locator("text=Liters restored").first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: "e2e/screenshots/01-loaded.png", fullPage: true });

  // Trigger a demo round-trip.
  await page.getByRole("button", { name: /Send 402-paid query/i }).click();
  await expect(page.getByText("Wire UTL route")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Inference response")).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: "e2e/screenshots/02-after-pay.png", fullPage: true });

  // Switch agent, send another.
  await page.getByRole("button", { name: /Solace/i }).click();
  await page.getByRole("button", { name: /Send 402-paid query/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "e2e/screenshots/03-second-agent.png", fullPage: true });

  expect(errors, errors.join("\n")).toEqual([]);
});
