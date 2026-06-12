/**
 * Scoring happy-path E2E tests.
 *
 * Skipped (describe.skip) because the selectors depend on UI components that
 * will be built in later deliverables. The structure and intent are captured
 * here as living documentation and TODO markers for the UI subsystem author.
 *
 * To un-skip: remove `describe.skip`, replace TODO selectors with real
 * data-testid attributes, and provide a seeded database fixture.
 */

import { test, expect } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-unused-vars */

test.describe.skip("Scoring — happy path", () => {
  // ---------------------------------------------------------------------------
  // Shared fixture: a T20 match with two teams and a toss result.
  // TODO: replace with a real Playwright fixture that seeds the database via
  //       Supabase service-role key, then logs in as a scorer.
  // ---------------------------------------------------------------------------

  test.beforeEach(async ({ page }) => {
    // TODO: seed fixture; navigate to scoring page
    // e.g. await page.goto("/match/<seeded-match-id>/score");
  });

  test("displays the correct initial state after toss", async ({ page }) => {
    // TODO: assert batting team name is visible
    // await expect(page.getByTestId("batting-team-name")).toHaveText("Team A");

    // TODO: assert scoreboard shows 0/0
    // await expect(page.getByTestId("score-display")).toContainText("0/0");

    // TODO: assert over counter shows 0.0
    // await expect(page.getByTestId("over-display")).toContainText("0.0");

    expect(true).toBe(true); // placeholder so test body isn't empty
  });

  test("records a dot ball correctly", async ({ page }) => {
    // TODO: click the dot-ball button
    // await page.getByTestId("btn-dot-ball").click();

    // TODO: assert score did not change, legal-ball counter incremented
    // await expect(page.getByTestId("score-display")).toContainText("0/0");
    // await expect(page.getByTestId("over-display")).toContainText("0.1");

    expect(true).toBe(true);
  });

  test("records a boundary 4 correctly", async ({ page }) => {
    // TODO: click the four button
    // await page.getByTestId("btn-runs-4").click();

    // TODO: assert score shows 4/0
    // await expect(page.getByTestId("score-display")).toContainText("4/0");

    expect(true).toBe(true);
  });

  test("records a six correctly", async ({ page }) => {
    // TODO: click the six button
    // await page.getByTestId("btn-runs-6").click();

    // TODO: assert score shows 6/0
    // await expect(page.getByTestId("score-display")).toContainText("6/0");

    expect(true).toBe(true);
  });

  test("records a wide correctly — score increments, ball count does not", async ({
    page,
  }) => {
    // TODO: click wide
    // await page.getByTestId("btn-wide").click();

    // TODO: assert score shows 1/0 (penalty run) but over shows 0.0 (illegal)
    // await expect(page.getByTestId("score-display")).toContainText("1/0");
    // await expect(page.getByTestId("over-display")).toContainText("0.0");

    expect(true).toBe(true);
  });

  test("records a wicket — bowling dialog opens and score updates", async ({
    page,
  }) => {
    // TODO: click wicket button
    // await page.getByTestId("btn-wicket").click();

    // TODO: select dismissal type "bowled" from the dialog
    // await page.getByTestId("dismissal-type-select").selectOption("bowled");
    // await page.getByTestId("confirm-wicket").click();

    // TODO: assert score shows 0/1
    // await expect(page.getByTestId("score-display")).toContainText("0/1");

    expect(true).toBe(true);
  });

  test("completes an over — bowler changes, strike rotates if odd-ball count", async ({
    page,
  }) => {
    // TODO: record 6 legal deliveries
    // for (let i = 0; i < 6; i++) {
    //   await page.getByTestId("btn-dot-ball").click();
    // }
    // TODO: assert over counter shows 1.0 and bowler-change dialog appears

    expect(true).toBe(true);
  });

  test("second innings — target is displayed and required run-rate shown", async ({
    page,
  }) => {
    // TODO: navigate to the second innings of the seeded match
    // TODO: assert target banner is visible
    // await expect(page.getByTestId("target-banner")).toBeVisible();
    // TODO: assert required run rate is a reasonable number
    // await expect(page.getByTestId("required-run-rate")).toBeVisible();

    expect(true).toBe(true);
  });
});
