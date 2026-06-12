# Scorebug PWA Icons

Place PNG icon files in this directory. They are referenced by `src/app/manifest.ts`.

## Required files

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192×192 px | Standard icon (home screen, splash screen) |
| `icon-512.png` | 512×512 px | Standard icon (install dialog, task switcher) |
| `icon-maskable-512.png` | 512×512 px | Maskable icon — keeps subject within the **80% safe zone** (inner 409×409 px) so it is never clipped by platform mask shapes (circle, squircle, rounded square, etc.) |

## Screenshots (optional but recommended)

Chrome's enhanced install dialog requires at least one screenshot to render the richer install UI.

| File | Size | `form_factor` |
|------|------|---------------|
| `../screenshots/scoring-mobile.png` | 390×844 px | `narrow` |
| `../screenshots/scorecard-mobile.png` | 390×844 px | `narrow` |

Place screenshots in `public/screenshots/`.

## Generation

Use a tool such as [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) or [Maskable.app](https://maskable.app/) to produce these files from your source SVG/PNG:

```sh
npx pwa-asset-generator logo.svg public/icons --manifest src/app/manifest.ts --index public/index.html --maskable
```

> The manifest is defined at `src/app/manifest.ts` (Next.js `MetadataRoute.Manifest`).
