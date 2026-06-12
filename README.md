# Scorebug

A production-grade Progressive Web App for real-time cricket scoring and tournament management.

Built with Next.js 15 (App Router), Supabase, TypeScript, and Serwist PWA. Designed mobile-first for scorers in the field, with offline support and live scorecard broadcasting.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Docker Desktop | latest (for local Supabase) |
| Supabase CLI | latest (`npm i -g supabase`) |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/<org>/cricScore.git
cd cricScore

# 2. Install
npm ci

# 3. Environment
cp .env.local.example .env.local
# → fill in SUPABASE_URL, SUPABASE_ANON_KEY (see below)

# 4. Start local Supabase (requires Docker)
supabase start           # prints local keys + Studio URL
npm run db:reset         # applies migrations

# 5. Dev server
npm run dev              # http://localhost:3000
```

After `supabase start`, copy the printed `anon key` and `API URL` into `.env.local`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only, never expose to client) |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |

Generate VAPID keys: `npx web-push generate-vapid-keys`

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint (flat config, next/core-web-vitals) |
| `npm run format` | Prettier format all files |
| `npm test` | Vitest unit tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with V8 coverage report |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:e2e:ui` | Playwright interactive UI mode |
| `npm run db:reset` | Drop and recreate local Supabase schema |
| `npm run db:push` | Push migrations to remote Supabase project |
| `npm run db:types` | Generate TypeScript types from local schema |

---

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for:

- DDD layering (domain / lib / features / app)
- Event-sourced scoring model — every delivery is immutable; scorecards derived
- Offline-first sync and conflict resolution strategy
- Realtime feed via Supabase Postgres changes
- PWA / Serwist service worker caching strategy
- State management (TanStack Query for server state, Zustand for scoring UI)
- Testing strategy and CI/CD pipeline
- Full folder structure and data model overview
- Roadmap and what is intentionally not yet built

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict, noUncheckedIndexedAccess) |
| Database | Supabase (Postgres + Auth + Realtime + Storage) |
| Styling | Tailwind CSS v3.4 + Shadcn (new-york) |
| Animations | framer-motion |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Forms | react-hook-form + zod |
| PWA | Serwist (Workbox) |
| Offline storage | idb (IndexedDB) |
| Unit tests | Vitest + React Testing Library |
| E2E tests | Playwright |
| CI/CD | GitHub Actions + Vercel |

---

## Contributing

1. Run `npm ci` and `supabase start` before coding.
2. The scoring engine (`src/lib/scoring/`) must have unit tests for every rule change.
3. Domain contracts (`src/domain/`) are shared across subsystems — changes require coordinating with affected subsystems.
4. All PRs pass typecheck, lint, and unit tests before merge. E2E tests run automatically on PR.

---

## License

Private — all rights reserved.
