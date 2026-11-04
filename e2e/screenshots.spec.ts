import { expect, test } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "Run with SCREENSHOTS=1 to refresh README images.");
test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });

test("capture", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "docs/img/landing.jpg", quality: 82, type: "jpeg" });

  await page.goto("/console");
  await page.waitForTimeout(13000);
  await page.screenshot({ path: "docs/img/map.jpg", quality: 82, type: "jpeg" });

  await page.goto("/console#twin");
  await page.reload();
  await page.getByRole("button", { name: /RDR-02/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/img/twin.jpg", quality: 82, type: "jpeg" });

  await page.goto("/console#simulate");
  await page.reload();
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Return RDR-02 to service").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "docs/img/simulate.jpg", quality: 82, type: "jpeg" });

  await page.goto("/console#report");
  await page.reload();
  await expect(page.locator(".rank tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "docs/img/report.jpg", quality: 82, type: "jpeg" });
});
