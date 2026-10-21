import { expect, type Page, type TestInfo } from '@playwright/test';

// Saves a full-page screenshot to reports/screens/<module id>/<name>-<laptop|tablet|phone>.png
// for the reviewer to compare with the designs.
export async function screen(page: Page, info: TestInfo, moduleId: string, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `reports/screens/${moduleId}/${name}-${info.project.name}.png`, fullPage: true });
}

// No horizontal scroll at any width (docs/design.md).
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
