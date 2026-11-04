import { expect, test, type Page } from "@playwright/test";

const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/];

const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !IGNORED.some((pattern) => pattern.test(message.text()))) errors.push(message.text());
  });
  return errors;
};

const openMapped = async (page: Page, view: string) => {
  await page.goto(`/console#${view}`);
  await expect(page.locator(".tab.is-active")).toContainText(new RegExp(view, "i"));
};

test("landing states figures computed from the twin", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("compiled");
  await expect(page.locator(".readout-strip")).toContainText("33");
  await expect(page.locator(".verdicts")).toContainText("Return RDR-02 to service");
  await expect(page.locator(".verdicts")).toContainText("Within noise");
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("replay streams entities into the twin and can be skipped", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/console");
  const counts = page.getByTestId("counts");
  await expect(page.getByText("Scripted replay")).toBeVisible();
  await expect.poll(async () => Number(await counts.getAttribute("data-entities")), { timeout: 40_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Skip to twin" }).click();
  await expect(counts).toHaveAttribute("data-entities", "33");
  await expect(page.getByText("7/7 read")).toBeVisible();
  await page.getByRole("button", { name: "Replay example" }).click();
  await expect(page.getByRole("button", { name: "Skip to twin" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every value walks back to the line it came from", async ({ page }) => {
  const errors = watchErrors(page);
  await openMapped(page, "twin");
  await page.getByRole("button", { name: /INC-01/ }).first().click();
  await expect(page.getByTestId("inspector")).toContainText("22 plates");
  await page.locator(".cite").first().click();
  await expect(page.locator("dialog[open] .is-hit")).toContainText("plate_capacity");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Plan" }).click();
  await expect(page.locator(".plan-kit")).toHaveCount(14);
  expect(errors).toEqual([]);
});

test("restoring the reader is a clear gain and moves the bottleneck", async ({ page }) => {
  const errors = watchErrors(page);
  await openMapped(page, "simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".limit")).toContainText("RDR-01");
  await page.getByLabel("Return RDR-02 to service").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByTestId("verdict")).toContainText("Clear gain", { timeout: 20_000 });
  await expect(page.locator(".limit")).toContainText("IMG-01");
  expect(errors).toEqual([]);
});

test("losing the only reader reports a usable error", async ({ page }) => {
  await openMapped(page, "simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Lose RDR-01").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".panel-right").getByRole("alert")).toContainText("read");
});

test("report ranks interventions and exports the twin", async ({ page }) => {
  const errors = watchErrors(page);
  await openMapped(page, "report");
  await expect(page.locator(".rank tbody tr").first()).toContainText(/RDR/, { timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export twin JSON" }).click();
  expect((await download).suggestedFilename()).toBe("aldermoor-bay-4.twin.json");
  expect(errors).toEqual([]);
});

test("live mode explains what it needs when no key is set", async ({ page, request }) => {
  const status = await request.get("/api/agent");
  expect((await status.json()).data.available).toBe(false);
  const refused = await request.post("/api/agent", { data: { docs: [] } });
  expect(refused.status()).toBe(503);

  await page.goto("/console");
  await page.getByRole("button", { name: "Skip to twin" }).click();
  await page.getByRole("button", { name: "Map your lab" }).click();
  await expect(page.getByRole("status")).toContainText("ANTHROPIC_API_KEY");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of ["/", "/console", "/console#twin", "/console#simulate", "/console#report"]) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
