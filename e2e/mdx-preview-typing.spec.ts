import { test, expect, type Page } from "@playwright/test";

const CAMPAIGN_DOCUMENT_ID = "355d559e-7794-4282-b1cf-db6dbacd391c";
const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "demo@mdcms.local";
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Demo12345!";

async function loginAndOpenCampaign(page: Page): Promise<void> {
  const campaignPath = `/admin/content/campaign/${CAMPAIGN_DOCUMENT_ID}`;
  const loginPath = `/admin/login?returnTo=${encodeURIComponent(campaignPath)}`;

  await page.goto(loginPath);
  await page.getByRole("textbox", { name: "Email" }).fill(LOGIN_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.endsWith(campaignPath));
  // The Studio bundle is ~13MB and only streams on first request; allow plenty
  // of time for initial boot.
  await expect(page.locator(".ProseMirror").first()).toBeVisible({
    timeout: 60_000,
  });
}

async function ensureChartPresent(page: Page): Promise<void> {
  const chartFrame = page.locator('[data-mdcms-mdx-component-frame="Chart"]');

  if ((await chartFrame.count()) > 0) {
    return;
  }

  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/Chart");
  // The slash picker surfaces as a portal near the caret. Pick the Chart entry.
  const chartOption = page
    .locator('[data-mdcms-mdx-picker-source="slash"]')
    .getByText("Chart", { exact: true });
  await chartOption.first().click();
  await expect(chartFrame.first()).toBeVisible();
}

async function countChartFrames(page: Page): Promise<number> {
  return page.locator('[data-mdcms-mdx-component-frame="Chart"]').count();
}

test.describe("MDX component survives accidental typing / select-all replacement", () => {
  test("Cmd/Ctrl+A in the editor and typing must preserve the embedded Chart component", async ({
    page,
  }) => {
    await loginAndOpenCampaign(page);
    await ensureChartPresent(page);

    const chartsBefore = await countChartFrames(page);
    expect(chartsBefore).toBeGreaterThan(0);

    const editor = page.locator(".ProseMirror").first();
    await editor.click();

    const selectAllKey = process.platform === "darwin" ? "Meta+a" : "Control+a";
    await page.keyboard.press(selectAllKey);
    await page.keyboard.type("WIPED", { delay: 30 });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "test-results/mdx-select-all-after.png",
      fullPage: false,
    });

    const chartsAfter = await countChartFrames(page);
    expect(chartsAfter).toBe(chartsBefore);

    // And the editor did not silently swallow the user's typing into the doc
    // — it just refused to destroy the MDX block. The typed characters may or
    // may not have landed somewhere safe; the critical thing is the chart is
    // still there.
  });

  test("clicking on the chart's rendered heading text and typing must not mutate the chart DOM", async ({
    page,
  }) => {
    await loginAndOpenCampaign(page);
    await ensureChartPresent(page);

    const chart = page
      .locator('[data-mdcms-mdx-component-frame="Chart"]')
      .first();
    const heading = chart.getByRole("heading", { name: /momentum/i }).first();

    const headingTextBefore = (await heading.textContent()) ?? "";

    // Single click right in the middle of the heading — mimics the user
    // clicking their caret inside the rendered chart title.
    await heading.click();
    await page.keyboard.type("a", { delay: 30 });
    await page.waitForTimeout(300);

    const headingTextAfter = (await heading.textContent()) ?? "";
    expect(headingTextAfter).toBe(headingTextBefore);
  });

  test("rapid double-clicking on the chart and typing must not fill the chart with text", async ({
    page,
  }) => {
    await loginAndOpenCampaign(page);
    await ensureChartPresent(page);

    const chartFrame = page
      .locator('[data-mdcms-mdx-component-frame="Chart"]')
      .first();
    const box = await chartFrame.boundingBox();
    if (!box) throw new Error("chart frame missing bounding box");

    // Rapid double-clicks on the chart frame's body.
    const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.dblclick(target.x, target.y);
    await page.mouse.dblclick(target.x, target.y);

    await page.keyboard.type("ds", { delay: 30 });
    await page.waitForTimeout(300);

    // The chart frame is still here and holds zero typed text.
    await expect(chartFrame).toBeVisible();
    await expect(chartFrame).not.toContainText("ds");
  });

  test("Shift+click that spans the chart boundary and typing must preserve the chart", async ({
    page,
  }) => {
    await loginAndOpenCampaign(page);
    await ensureChartPresent(page);

    const chartsBefore = await countChartFrames(page);
    expect(chartsBefore).toBeGreaterThan(0);

    const editor = page.locator(".ProseMirror").first();
    const chart = page
      .locator('[data-mdcms-mdx-component-frame="Chart"]')
      .first();

    // Click at the very top-left of the editor...
    const editorBox = await editor.boundingBox();
    const chartBox = await chart.boundingBox();
    if (!editorBox || !chartBox) {
      throw new Error("Expected the editor and chart to have bounding boxes");
    }

    await page.mouse.click(editorBox.x + 6, editorBox.y + 6);
    // ...and shift-click well below the chart, forcing a TextSelection that
    // spans the MDX block.
    await page.keyboard.down("Shift");
    await page.mouse.click(
      editorBox.x + editorBox.width / 2,
      chartBox.y + chartBox.height + 40,
    );
    await page.keyboard.up("Shift");

    await page.keyboard.type("OVERWRITE", { delay: 30 });
    await page.waitForTimeout(400);

    const chartsAfter = await countChartFrames(page);
    expect(chartsAfter).toBe(chartsBefore);
  });
});
