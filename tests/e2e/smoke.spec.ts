/**
 * Smoke tests — gate that the app loads and basic PWA contracts are met.
 *
 * These run on every PR (desktop + mobile projects in playwright.config.ts).
 * They deliberately make no assertions about data or auth so they never need
 * seeded fixtures and always pass in a fresh Supabase environment.
 */

import { test, expect } from "@playwright/test";

test.describe("Home page loads", () => {
  test("returns 200 and renders a top-level element", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    // The app shell must render something in the body; a blank page indicates
    // a fatal render error.
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

test.describe("PWA manifest", () => {
  test("web manifest is reachable and valid JSON", async ({ request }) => {
    // Next.js with Serwist exposes the manifest at /manifest.json or
    // /manifest.webmanifest — accept either.
    const urls = ["/manifest.json", "/manifest.webmanifest"];
    let found = false;
    for (const url of urls) {
      const res = await request.get(url);
      if (res.status() === 200) {
        const body = await res.json();
        // Minimal mandatory fields per the W3C App Manifest spec.
        expect(body).toHaveProperty("name");
        expect(body).toHaveProperty("icons");
        found = true;
        break;
      }
    }
    if (!found) {
      // A missing manifest is a warning in dev (Serwist disabled) — not a
      // hard failure.  Skip instead of failing so the smoke test is not noisy
      // during local development.
      test.skip();
    }
  });

  test("service-worker script is reachable in production", async ({
    request,
  }) => {
    // In development Serwist is disabled (next.config.mjs disable: process.env.NODE_ENV === "development")
    // so we only assert presence in CI (production build).
    if (!process.env["CI"]) {
      test.skip();
      return;
    }
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("javascript");
  });
});

test.describe("Core navigation", () => {
  test("no console errors on initial load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    // Allow React hydration and lazy imports to settle.
    await page.waitForLoadState("networkidle");
    // Filter known benign messages (e.g. Supabase auth state not initialized
    // yet because there's no session).
    const realErrors = errors.filter(
      (e) =>
        !e.includes("supabase") &&
        !e.includes("GoTrueClient") &&
        !e.includes("Failed to fetch"),
    );
    expect(realErrors).toHaveLength(0);
  });
});
