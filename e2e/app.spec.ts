import { readFileSync } from "node:fs";
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
  await page.getByRole("button", { name: "Drivers" }).click();
  await expect(page.locator(".limit")).toContainText("RDR-01");
  await page.getByLabel("Return RDR-02 to service").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByTestId("verdict")).toContainText("Clear gain", { timeout: 20_000 });
  await expect(page.locator(".limit")).toContainText("IMG-01");
  expect(errors).toEqual([]);
});

const paintedPixels = (testId: string) => (page: import("@playwright/test").Page) =>
  page.getByTestId(testId).locator("canvas").nth(1).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
    let painted = 0;
    for (let index = 3; index < data.length; index += 4) if ((data[index] as number) > 0) painted += 1;
    return painted;
  });

test("charts draw as the run plays and survive seeking and tab switches", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/console#simulate");
  await expect(page.getByTestId("chart-completion")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("chart-completion").getByRole("img")).toHaveAttribute("aria-label", /Plates finished/);

  const painted = paintedPixels("chart-completion");
  const early = await painted(page);
  await page.waitForTimeout(4000);
  const later = await painted(page);
  expect(later).toBeGreaterThan(early);

  const plot = page.getByTestId("chart-completion").locator(".chart-plot");
  const box = await plot.boundingBox();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.8, (box?.y ?? 0) + 40);
  await page.waitForTimeout(400);
  const ahead = await painted(page);
  expect(ahead).toBeGreaterThan(later);
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.3, (box?.y ?? 0) + 40);
  await page.waitForTimeout(400);
  expect(await painted(page)).toBeLessThan(ahead);

  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByTestId("plate-table").locator("tbody tr")).toHaveCount(80);
  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByTestId("chart-cycle")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the crosshair stops at the playhead", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("chart-completion")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  const plot = page.getByTestId("chart-completion").locator(".chart-plot");
  const box = await plot.boundingBox();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) - 20, (box?.y ?? 0) + 30);
  const tip = page.getByTestId("chart-completion").locator(".chart-tip");
  await expect(tip).toBeVisible();
  const shown = await tip.locator("span").first().textContent();
  const clock = await page.locator(".readout").textContent();
  expect(shown).toBe(clock);
});

test("plate results export as CSV", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Tables" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/plates\.csv$/);
  const path = await download.path();
  const lines = readFileSync(path, "utf8").trim().split("\n");
  expect(lines[0]).toBe("plate,workflow,started_min,finished_min,cycle_min,queued_min,failures");
  expect(lines).toHaveLength(81);
});

test("the optimiser finds a plan and opens it in Simulate", async ({ page }) => {
  await page.goto("/console#decide");
  await expect(page.getByTestId("decide")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Find the cheapest plan" }).click();
  await expect(page.getByTestId("optimiser-result")).toContainText("Return RDR-02 to service", { timeout: 30_000 });
  await page.getByRole("button", { name: "Open in Simulate" }).click();
  await expect(page.getByTestId("verdict")).toContainText("Clear gain", { timeout: 20_000 });
  await page.getByRole("button", { name: "Cost", exact: true }).click();
  await expect(page.getByTestId("payback")).not.toHaveText("Never");
});

test("schedules can be set, run and compared", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  const before = await page.getByTestId("kpis").textContent();
  await page.getByLabel("Staffing").selectOption("day-stop");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByTestId("kpis")).not.toHaveText(before ?? "", { timeout: 20_000 });
  await page.getByRole("button", { name: "Decide" }).click();
  await page.getByRole("button", { name: "Compare schedules" }).click();
  await expect(page.getByTestId("schedule-table").locator("tbody tr")).toHaveCount(12, { timeout: 30_000 });
});

test("the assay view labels its data and follows the run", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Assay" }).click();
  await expect(page.getByTestId("assay")).toContainText("Simulated data");
  await page.getByRole("button", { name: "Worst plate" }).click();
  await expect(page.locator(".heatmap rect")).toHaveCount(384);
});

test("saved runs persist and compare", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Name this run").fill("Today");
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByLabel("Return RDR-02 to service").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Name this run").fill("Repaired");
  await page.getByRole("button", { name: "Save run" }).click();
  await page.goto("/console#decide");
  await page.reload();
  await expect(page.getByTestId("saved-compare")).toContainText("Repaired", { timeout: 20_000 });
  await expect(page.getByTestId("saved-compare").locator("tbody tr")).toHaveCount(2);
});

test("asking about the run answers with its figures", async ({ page }) => {
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Ask about this run").fill("why did the queue build up at hour 3?");
  await page.getByRole("button", { name: "Ask", exact: true }).last().click();
  await expect(page.getByTestId("ask")).toContainText(/plates? (was|were) waiting for RDR-01/);
});

test("layout edits report reach and change the result", async ({ page }) => {
  await page.goto("/console#twin");
  await page.getByRole("button", { name: "Edit layout" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /RDR-01/ }).first().click();
  const panel = page.getByTestId("layout-panel");
  await expect(panel).toContainText("Layout checks pass");
  await panel.getByLabel("Y (m)").fill("7.2");
  await expect(page.getByTestId("layout-result")).toContainText("out of ARM-01's reach");
  await expect(page.getByTestId("layout-result")).toContainText("against the mapped layout", { timeout: 10_000 });
  await panel.getByRole("button", { name: "Reset" }).click();
  await expect(panel).toContainText("Layout checks pass");
});

test("dragging an instrument in 3D moves it", async ({ page }) => {
  await page.goto("/console#twin");
  await page.getByRole("button", { name: "Edit layout" }).click({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  const tag = page.locator(".scene-tag", { hasText: "RDR-01" });
  const box = await tag.boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2 - 20;
  const y = (box?.y ?? 0) + 20;
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(x + 20, y + 3, { steps: 3 });
  await page.mouse.move(x + 45, y + 6, { steps: 3 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  const field = page.getByTestId("layout-panel").getByLabel("X (m)");
  await expect(field).toBeVisible({ timeout: 5000 });
  await expect(field).not.toHaveValue("6.2", { timeout: 5000 });
});

test("a share link reproduces the scenario and the report prints", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/console#simulate");
  await expect(page.getByTestId("kpis")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Return RDR-02 to service").check();
  await page.getByRole("button", { name: "Run simulation" }).click();
  const verdict = await page.getByTestId("verdict").textContent({ timeout: 20_000 });
  await page.getByRole("button", { name: "Report" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const other = await context.newPage();
  await other.goto(link);
  await other.getByRole("button", { name: "Simulate" }).click();
  await expect(other.getByTestId("verdict")).toHaveText(verdict ?? "", { timeout: 20_000 });

  await page.getByTestId("rank-table").locator("tbody tr").first().waitFor({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeEnabled();
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(20_000);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});

test("a broken share link is ignored", async ({ page }) => {
  await page.goto("/console#report?s=garbage");
  await expect(page.getByTestId("report")).toBeVisible({ timeout: 20_000 });
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
  await expect(page.locator(".rank tbody tr").first()).toContainText(/RDR|Plate Reader/, { timeout: 30_000 });
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
