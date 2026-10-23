import { test as base, expect, type Page } from '@playwright/test';

// Every e2e page runs on Oct 20, 2026, 10:00 AM in the Philippines, the day the designs show. The bills of
// the sample data are due Oct 25, so Unpaid and Overdue stay the same whatever day the tests run.
export const TODAY = new Date('2026-10-20T10:00:00+08:00');

// Moves the page's Date to `when` and lets it keep ticking. Only Date changes: performance.now() and
// animation frames stay real, so motion animations run (Playwright's page.clock froze them).
export async function shiftClock(page: Page, when: Date) {
  await page.addInitScript((target: number) => {
    const RealDate = Date;
    const shift = target - RealDate.now();
    class ShiftedDate extends RealDate {
      constructor(...args: [] | ConstructorParameters<DateConstructor>) {
        if (args.length === 0) super(RealDate.now() + shift);
        else super(...(args as ConstructorParameters<DateConstructor>));
      }
      static now() {
        return RealDate.now() + shift;
      }
    }
    globalThis.Date = ShiftedDate as DateConstructor;
  }, when.getTime());
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await shiftClock(page, TODAY);
    await provide(page);
  },
});

export { expect };
