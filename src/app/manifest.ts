import type { MetadataRoute } from "next";

/**
 * Web App Manifest for Scorebug PWA.
 *
 * Shortcuts give scorers one-tap access to the two highest-frequency flows.
 * Screenshots satisfy Chrome's enhanced install criteria (richer install UI).
 * The maskable icon uses a safe-zone of ~80% so the subject is never clipped
 * by platform-shaped masks (circle, squircle, etc.).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scorebug – Cricket Scoring & Live Updates",
    short_name: "Scorebug",
    description:
      "Score cricket matches offline, sync live, and follow tournaments in real time.",
    start_url: "/",
    display: "standalone",
    // Keep in lockstep with the light-mode `viewport.themeColor` in
    // src/app/layout.tsx (and the light `--primary` token) so the installed-PWA
    // chrome matches the in-browser address-bar color. Dark mode is handled by
    // the media-query variant in the layout's viewport export.
    background_color: "#0f172a",
    theme_color: "#166534",
    orientation: "portrait-primary",
    categories: ["sports", "utilities"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // standard — displayed as-is; no safe-zone constraint
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        // maskable — platform may apply any mask shape; subject sits within 80% safe zone
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New Match",
        short_name: "New Match",
        description: "Start scoring a new cricket match",
        url: "/matches/new",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Live Matches",
        short_name: "Live",
        description: "Watch live match scores",
        url: "/live",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    screenshots: [
      {
        src: "/screenshots/scoring-mobile.png",
        sizes: "390x844",
        type: "image/png",
        // `form_factor` is valid per the Web App Manifest spec; Next.js types will
        // catch up in a future release. Cast through unknown to satisfy tsc.
        ...(({ form_factor: "narrow", label: "Live scoring interface on mobile" }) as unknown as object),
      },
      {
        src: "/screenshots/scorecard-mobile.png",
        sizes: "390x844",
        type: "image/png",
        ...(({ form_factor: "narrow", label: "Full scorecard on mobile" }) as unknown as object),
      },
    ],
  };
}
