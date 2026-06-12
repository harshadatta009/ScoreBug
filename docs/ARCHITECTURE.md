# Scorebug — Architecture

> Last updated: 2026-06-12

---

## Table of Contents

1. [Overview](#1-overview)
2. [The 15 Deliverables](#2-the-15-deliverables)
3. [DDD Layering](#3-ddd-layering)
4. [Event-Sourced Scoring Model](#4-event-sourced-scoring-model)
5. [Folder Structure](#5-folder-structure)
6. [Data Model](#6-data-model)
7. [RLS / Security Model](#7-rls--security-model)
8. [Realtime Architecture](#8-realtime-architecture)
9. [Offline-First Sync & Conflict Resolution](#9-offline-first-sync--conflict-resolution)
10. [PWA Strategy (Serwist)](#10-pwa-strategy-serwist)
11. [State Management](#11-state-management)
12. [Testing Strategy](#12-testing-strategy)
13. [CI/CD](#13-cicd)
14. [How to Run Locally](#14-how-to-run-locally)
15. [Roadmap / Not Yet Implemented](#15-roadmap--not-yet-implemented)

---

## 1. Overview

Scorebug is a **production-grade Progressive Web App** for live cricket scoring and tournament management. It targets club-level and amateur competitive cricket where:

- A scorer (or captain) records each delivery on a phone in real-time.
- Scorecards, player statistics, and live feeds are available instantly to spectators.
- Network connectivity is unreliable (grounds, parks, indoor facilities).

**Core design choices driven by these constraints:**

| Constraint | Decision |
|---|---|
| Unreliable connectivity | Offline-first; all scoring writes queue to IndexedDB and sync when online |
| Mobile-first scorers | PWA install + full touch scoring UI at 375 px |
| Many concurrent spectator viewers | Supabase Realtime subscriptions (Postgres changes via WebSocket) |
| Auditability of edits | Event-sourced scoring; every ball is immutable; edits append a new event |
| Multi-platform | Next.js 15 App Router deployed to Vercel; no native app shipping overhead |

**Stack summary:**

```
Next.js 15 (App Router)  ·  React 19  ·  TypeScript (strict)
Supabase (Postgres + Auth + Realtime + Storage)
TanStack Query v5  ·  Zustand v5  ·  react-hook-form + zod
Tailwind v3.4 + Shadcn (new-york)  ·  framer-motion
Serwist (Workbox wrapper) PWA  ·  idb (IndexedDB)
Vitest + Playwright
```

---

## 2. The 15 Deliverables

Each deliverable maps to one sub-agent that owns a set of paths in the codebase. The numbers are fixed reference points — they do not imply a strict build order (most can be developed in parallel).

| # | Deliverable | Key Paths |
|---|---|---|
| 1 | **Domain contracts** | `src/domain/` |
| 2 | **Database schema & migrations** | `supabase/migrations/` |
| 3 | **Supabase client & auth** | `src/lib/supabase/` |
| 4 | **Scoring engine** | `src/lib/scoring/` |
| 5 | **Match & innings management** | `src/features/match/` |
| 6 | **Live scoring UI** | `src/features/scoring/` |
| 7 | **Scorecard & statistics views** | `src/features/scorecard/` |
| 8 | **Player & team management** | `src/features/players/`, `src/features/teams/` |
| 9 | **Tournament management** | `src/features/tournaments/` |
| 10 | **Offline sync layer** | `src/lib/sync/`, `src/lib/db/` |
| 11 | **Realtime feed** | `src/lib/realtime/`, `src/features/feed/` |
| 12 | **Push notifications** | `src/lib/push/` |
| 13 | **Authentication flows** | `src/features/auth/`, `src/app/(auth)/` |
| 14 | **PWA shell & service worker** | `src/app/sw.ts`, `src/app/manifest.ts` |
| 15 | **Testing harness, CI/CD, docs** | `vitest.config.ts`, `.github/workflows/`, `docs/` |

---

## 3. DDD Layering

The codebase is organised in four concentric layers. **Dependencies only point inward** — outer layers import from inner layers, never the reverse.

```
┌─────────────────────────────────────────────────────────┐
│  app/           Next.js App Router pages, layouts, API  │
│  (orchestration layer — wires features into routes)     │
├─────────────────────────────────────────────────────────┤
│  features/      Vertical feature slices                  │
│  (UI components, hooks, server actions per feature)     │
├─────────────────────────────────────────────────────────┤
│  lib/           Shared infrastructure & utilities        │
│  (supabase, scoring engine, sync, push, realtime, …)   │
├─────────────────────────────────────────────────────────┤
│  domain/        Pure TypeScript — zero runtime deps      │
│  (types, enums, interfaces, branded IDs)                │
└─────────────────────────────────────────────────────────┘
```

**Rules enforced by convention (and lint):**

- `domain/` imports nothing from the project. No `next`, no `react`, no Supabase SDK.
- `lib/` may import `domain/` and external packages, but not `features/` or `app/`.
- `features/` may import `domain/`, `lib/`, and shared UI components from `src/components/`.
- `app/` (Next.js routes) may import anything but is kept thin — route files delegate to `features/` as quickly as possible.

### React Server Components

Next.js 15 defaults all components to Server Components. The rule is:

- **RSC by default** — fetch data at the server, pass down as props.
- Add `"use client"` only when the component needs browser APIs, event handlers, React state, or Zustand.
- Server Actions (in `actions.ts` files co-located with features) handle mutations; they are the only permitted write path from the UI.

---

## 4. Event-Sourced Scoring Model

### Why event sourcing?

Cricket scoring has two unique characteristics that make a traditional CRUD model painful:

1. **Edit / undo is common.** Scorers make mistakes. In a conventional model, editing a past ball requires complex denormalized-score surgery. With event sourcing, an edit replaces the ball event and the scorecard is re-derived.

2. **Offline-first conflict resolution.** Two devices (scorer + backup) may both record balls while disconnected. The monotonic `sequence` field is the canonical ordering key. Conflicts are resolved by last-write-wins on the `sequence` number, with audit trail preserved.

### How it works

```
Scorer action
     │
     ▼
RecordBallInput (validated by zod)
     │
     ▼ scoring engine (src/lib/scoring/)
BallEvent  ──── persisted to public.balls (Supabase) ────► Realtime broadcast
     │
     ▼ pure fold / reduce
InningsScore  ◄── derived on every render from the ordered ball sequence
```

Every delivery is **one immutable row** in `public.balls`. The entire `InningsScore` (scorecard, batting cards, bowling cards, partnerships, fall-of-wickets, required run-rate) is a **pure function** of `BallEvent[]` ordered by `sequence`.

**Consequences:**

- No denormalized score columns in the `innings` table that can drift out of sync.
- Full replay: load all balls → replay → any historical scorecard is reconstructable.
- Time-travel debugging: insert a new ball event between two existing sequences to retroactively fix a missed delivery.
- `player_statistics` and `team_statistics` are **derived aggregates** refreshed from balls, not the source of truth.

### The scoring engine contract

```typescript
// src/lib/scoring/engine.ts (deliverable 4)
function computeInningsScore(
  config: InningsConfig,
  rules: MatchRules,
  balls: BallEvent[],
): InningsScore;
```

This function is pure (no side effects, no I/O). It is the most heavily unit-tested part of the codebase.

---

## 5. Folder Structure

```
cricScore/
├── .github/
│   └── workflows/
│       ├── ci.yml               # install → typecheck → lint → unit → build → e2e
│       └── codeql.yml           # weekly + PR security scan
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── docs/
│   └── ARCHITECTURE.md          ← you are here
├── public/
│   ├── icons/                   # PWA icons (192, 512 px)
│   └── sw.js                    # generated by Serwist (git-ignored)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # login, register, reset-password routes
│   │   ├── (dashboard)/         # protected app routes
│   │   ├── api/                 # Route Handlers (webhooks, push, etc.)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── manifest.ts          # next-manifest (deliverable 14)
│   │   ├── page.tsx             # home / landing
│   │   └── sw.ts                # Serwist service worker source
│   ├── components/
│   │   └── ui/                  # Shadcn primitives (generated)
│   ├── domain/
│   │   ├── cricket/
│   │   │   ├── ball.ts          # BallEvent, RecordBallInput
│   │   │   ├── enums.ts         # BatRuns, ExtraType, DismissalType, …
│   │   │   ├── match.ts         # MatchConfig, MatchRules, InningsConfig
│   │   │   └── scorecard.ts     # InningsScore, BattingCard, BowlingCard, …
│   │   └── shared/
│   │       └── ids.ts           # Branded ID types
│   ├── features/
│   │   ├── auth/                # login form, session hook
│   │   ├── feed/                # live delivery feed component
│   │   ├── match/               # match creation, toss, innings setup
│   │   ├── players/             # player CRUD
│   │   ├── scorecard/           # innings scorecard view
│   │   ├── scoring/             # live scoring UI (touch-optimised)
│   │   ├── teams/               # team CRUD + XI selection
│   │   └── tournaments/         # tournament bracket + standings
│   └── lib/
│       ├── db/                  # idb schema + helpers (IndexedDB)
│       ├── push/                # Web Push subscription + send helpers
│       ├── realtime/            # Supabase Realtime channel factory
│       ├── scoring/             # Pure scoring engine (computeInningsScore)
│       ├── supabase/            # Client factory, server/browser helpers
│       └── sync/                # Offline queue + sync coordinator
├── supabase/
│   └── migrations/
│       └── 20260101000000_initial_schema.sql
├── tests/
│   └── e2e/
│       ├── smoke.spec.ts        # app loads, manifest, no console errors
│       └── scoring.spec.ts      # happy-path (describe.skip until UI is done)
├── .editorconfig
├── .prettierignore
├── .prettierrc.json
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.mjs
├── playwright.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── vitest.setup.ts
```

---

## 6. Data Model

### Entity relationship summary

```
auth.users (Supabase managed)
    │ 1:1
    ▼
public.users ──────── user_roles (RBAC)
    │ 1:N
    ├──► teams (owner_id)
    │       │ N:M via team_members
    │       │ N:M via tournament_teams
    │
    ├──► players (user_id nullable — supports guest players)
    │
    ├──► tournaments (organizer_id)
    │
    └──► venues (created_by)

matches
    ├── team_a_id, team_b_id → teams
    ├── venue_id → venues
    ├── tournament_id → tournaments
    └── innings (1..N)
           └── overs (derived aggregate per over)
                  └── balls  ◄── the event log (source of truth)

player_statistics  ← refreshed aggregate from balls
team_statistics    ← refreshed aggregate from balls

notifications → users
push_subscriptions → users
follows → (users → teams | players | tournaments)
audit_logs → (actor: users, entity: any table)
```

### Key design decisions

**Balls table is the source of truth.** `innings.is_complete`, `overs.runs`, `overs.wickets`, `matches.result_summary` are denormalized copies for fast listing. They should always be derivable from balls. If they drift, balls win.

**Players vs Users.** A `player` row exists per participant in a match context; it can have a `user_id` (registered account) or be null (guest/unregistered player). This lets club administrators enter a guest's name without them creating an account.

**Rules snapshot.** `matches.rules` stores the `MatchRules` JSON at the time the match is created. This means historical matches are not affected if the app's default rules change later.

**JSONB for config.** `tournaments.config` and `matches.playing_xi` use JSONB for flexibility. The TypeScript types (`MatchConfig`, `InningsConfig`) enforce shape at the application layer.

---

## 7. RLS / Security Model

### Authentication

Supabase Auth handles JWTs. The app uses `@supabase/ssr` with cookie-based sessions (not localStorage) so SSR routes and Server Actions have access to the authenticated user.

### Row Level Security

Every table has RLS enabled. Policies are defined in a subsequent migration (after the initial schema). The intent is:

| Table | Read | Write |
|---|---|---|
| users | own row + public display fields | own row only |
| teams | public (is_public=true) or member | team_admin / owner |
| matches | public OR tournament member | scorer / team_admin |
| balls | same as match | scorer of that match only |
| player_statistics | public | service role (aggregate refresh) |
| notifications | own rows only | service role / Edge Functions |
| audit_logs | super_admin only | append-only via service role |

### RBAC

`app_role` (defined in `src/domain/cricket/enums.ts`) maps to scoped capabilities:

- `player` — read-only on their own statistics.
- `captain` — can manage their team's playing XI.
- `scorer` — can record balls for a match they are assigned to.
- `umpire` — can validate/override scoring decisions.
- `team_admin` — full CRUD on their team and members.
- `tournament_admin` — CRUD on tournaments they organize.
- `super_admin` — platform-wide access; restricted to server-side service role operations.

Roles are checked in Server Actions (not in client components) and enforced by RLS as a second line of defence.

---

## 8. Realtime Architecture

```
Scorer device
    │ Server Action writes ball → Supabase
    ▼
public.balls INSERT
    │ Postgres logical replication
    ▼
Supabase Realtime (postgres_changes subscription)
    │ WebSocket broadcast to subscribed clients
    ▼
spectator browser / scorer backup
    │ TanStack Query invalidation on received event
    ▼
fresh scorecard rendered
```

**Channel naming:** One channel per match — `match:{matchId}`. Clients subscribe to `schema: 'public', table: 'balls', filter: 'innings_id=eq.{inningsId}'` to receive only balls for the innings they are viewing.

**Back-pressure:** Spectator clients are read-only subscribers. Only the scorer device writes. If a spectator misses events (e.g. brief network drop), they refetch the full innings on reconnect via TanStack Query. Realtime events are an optimistic update path, not the sole source of truth.

**Security:** Realtime inherits RLS. A subscription to a match the user cannot read via SELECT will receive no events.

---

## 9. Offline-First Sync & Conflict Resolution

### Why offline-first?

Cricket grounds often have poor cellular coverage. The scoring app must work without network access from ball 1; syncing when connectivity is restored.

### Architecture

```
User action (record ball)
    │
    ▼
Zustand scoring store (in-memory, instant feedback)
    │
    ▼
idb (IndexedDB) — append to outbox queue   ← persisted locally, survives refresh
    │
    ▼  [when navigator.onLine]
Sync coordinator (src/lib/sync/)
    │  processes outbox FIFO
    ▼
Supabase upsert (idempotent: uses BallEvent.id as primary key)
    │
    ▼  on success: remove from outbox
```

**Outbox pattern:** Every write is first committed to IndexedDB, then the sync coordinator picks it up. This guarantees no data loss even if the tab is closed mid-match.

**Idempotency:** `BallEvent.id` (a UUID generated on the client) is the primary key in `public.balls`. Upsert with `onConflict: 'id'` means re-sending the same ball never creates duplicates.

### Conflict resolution

The primary conflict scenario is: scorer A and scorer B are both offline and both record ball 5.

Resolution strategy:
1. `sequence` numbers within an innings are assigned by the first device to sync.
2. If two devices send the same `sequence` number with different content, the server enforces `unique(innings_id, sequence)`. The second write fails.
3. The failing device receives a 409-equivalent error and enters a **conflict resolution flow**: the scorer reviews the conflicting balls and picks one. The rejected ball is soft-deleted (marked `superseded = true`).
4. `audit_logs` records both versions for later dispute resolution.

For the MVP the conflict UI is a simple "two balls conflict — choose one" modal. Post-MVP: CRDT-style automatic merge for non-contentious conflicts (e.g. different extras, same runs).

---

## 10. PWA Strategy (Serwist)

**Serwist** is the Next.js-first wrapper around Workbox. Configuration lives in `next.config.mjs`.

### Caching strategy

| Route / asset | Strategy | Rationale |
|---|---|---|
| App shell (JS, CSS, fonts) | StaleWhileRevalidate | Fast initial paint; background update |
| Static images / icons | CacheFirst (30 days) | Rarely change |
| API routes / Server Actions | NetworkFirst | Data freshness matters; fall back to cache for reads |
| Supabase REST calls | NetworkFirst with timeout | Same as above |
| Offline fallback | `/offline` page | Graceful degradation |

### Install prompt

The app registers a `beforeinstallprompt` handler in the PWA shell (`src/features/pwa/`). An install banner appears contextually — after the user has recorded at least one delivery — rather than immediately, to improve install conversion.

### Update lifecycle

When a new service worker is waiting, a toast notification informs the user: "A new version is available — tap to update." This prevents a scorer from being silently mid-match on a stale version.

---

## 11. State Management

Scorebug draws a hard line between two categories of state:

### Server state — TanStack Query

All data that lives in Supabase is managed by TanStack Query:

- **Queries** — fetch match details, innings, scorecard, player stats, tournament standings.
- **Invalidation** — Realtime events trigger `queryClient.invalidateQueries(['innings', inningsId])` so components re-render with fresh data.
- **Optimistic updates** — Ball recording uses `useMutation` with `onMutate` to apply the new ball instantly, then confirms or rolls back on server response.
- **Background sync** — `refetchOnWindowFocus` keeps open scorecard views fresh when the scorer returns to the tab.

### Client / scoring state — Zustand

The live scoring UI has ephemeral UI state that should never hit the server:

- Which batter is on strike.
- The current partial-over state (balls in the over before it is committed).
- The "pending extra" selection (user tapped wide, now choosing how many extra runs).
- Dialog open/close state.

This state lives in `useScoringStore` (Zustand). It is **not persisted** to IndexedDB (the balls table is the persistent record). If the scorer refreshes, the store is rebuilt by replaying the balls from IndexedDB / Supabase.

**Rule:** If the state influences the scorecard, it is a `BallEvent` persisted in the outbox. If it is UI-only (which button is highlighted), it is Zustand.

---

## 12. Testing Strategy

### Unit tests (Vitest)

The scoring engine (`src/lib/scoring/`) is the highest-value test target. Every rule of cricket scoring is captured as a unit test:

- Legal ball increments `legalBalls`, updates `over` and `ballInOver`.
- Wide increments team score by `widePenalty`, does NOT increment `legalBalls`.
- No-ball sets `isFreeHitNext = true` on the next delivery.
- Wicket decrements remaining batting order; innings ends when 10 wickets fall.
- Over boundary: `ballInOver` resets to 1, `over` increments, `strikerId` and `nonStrikerId` swap.
- Target chasing: `runsRequired`, `ballsRemaining`, `requiredRunRate` calculated correctly.
- Maiden over: identified when all balls in an over are dot balls with zero extras.

React components are tested with React Testing Library for interaction patterns (e.g. selecting a dismissal type in the wicket dialog submits the correct `RecordBallInput`).

### E2E tests (Playwright)

- `smoke.spec.ts` — app loads, PWA manifest valid, no console errors.
- `scoring.spec.ts` — full happy-path: create match → toss → score an innings → view scorecard. **Currently `describe.skip`** until the scoring UI components have `data-testid` attributes; the spec is fully documented so any developer can un-skip and fill in selectors.

### Coverage targets

| Metric | Target |
|---|---|
| Lines | ≥ 60% |
| Functions | ≥ 60% |
| Branches | ≥ 55% |
| Statements | ≥ 60% |

The scoring engine alone should reach 95%+. The lower overall thresholds account for Next.js boilerplate and Supabase integration code that is impractical to unit-test without a live DB.

---

## 13. CI/CD

### GitHub Actions pipeline

```
push / PR
    │
    ├── install (cache npm ci)
    │       │
    │       ├── typecheck (tsc --noEmit)
    │       ├── lint      (next lint / eslint flat config)
    │       └── unit-tests (vitest --coverage)
    │               │
    │               └── build (next build)
    │                       │
    │                       └── e2e (playwright — PR only)
    │
    └── codeql (security scan — push to main + weekly)
```

**Concurrency:** Each branch/PR cancels the previous run to save minutes.

**Artifacts retained:**
- `coverage-report` — 14 days.
- `playwright-report` — 14 days.
- `.next` build — 1 day (used by the e2e job).

### Deployment (not in CI config — Vercel)

Vercel is the target deployment platform. The CI/CD workflow does not push to Vercel directly; Vercel's GitHub integration handles that:

- `main` branch → production deployment.
- PR branches → preview deployments with unique URLs.

Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) are set in the Vercel project dashboard, not committed to the repo.

---

## 14. How to Run Locally

### Prerequisites

- **Node.js** ≥ 20 (`node -v`)
- **npm** ≥ 10 (`npm -v`)
- **Docker Desktop** (required by Supabase CLI for the local Postgres instance)
- **Supabase CLI** — `npm install -g supabase` or via Homebrew

### Environment setup

```bash
# 1. Clone the repository
git clone https://github.com/<org>/cricScore.git
cd cricScore

# 2. Install dependencies
npm ci

# 3. Copy the environment template
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
VAPID_PUBLIC_KEY=<generate with web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<generate with web-push generate-vapid-keys>
```

### Start the database

```bash
# Start local Supabase (Postgres, Auth, Storage, Realtime)
supabase start

# Apply migrations
npm run db:reset          # drops + recreates schema from migrations/

# (Optional) Generate TypeScript types from the live schema
npm run db:types
```

### Run the development server

```bash
npm run dev
# Open http://localhost:3000
```

The service worker is **disabled in development** (see `next.config.mjs`) to avoid caching stale assets.

### Run tests

```bash
# Unit tests (watch mode)
npm run test:watch

# Unit tests with coverage report
npm run test:coverage

# E2E smoke tests (starts the dev server automatically)
npm run test:e2e
```

### Production build locally

```bash
npm run build
npm run start
```

---

## 15. Roadmap / Not Yet Implemented

This section is intentionally honest. The architecture is designed to accommodate these features without structural changes.

### Intentionally excluded from MVP

| Feature | Status | Notes |
|---|---|---|
| **Payments / subscriptions** | Architecture-ready | Stripe integration points are stubbed. `tournaments.config` has a `isPremium` field. No payment UI or webhook handlers exist yet. |
| **DLS / VJD target adjustment** | Architecture-ready | `ChaseTarget.revisedOvers` and `parScore` fields exist. The engine accepts a pre-computed target adjustment; the calculation UI is not built. |
| **Video highlights** | Architecture-ready | Supabase Storage is configured. No video upload or clipping UI. |
| **SMS / email notifications** | Architecture-ready | `notifications` table exists; only Web Push is implemented. |

### Planned but not started

| Feature | Notes |
|---|---|
| **Admin dashboard** | Tournament bracket management UI, statistics dashboards. |
| **Multi-format support** | Test cricket (no overs limit, follow-on, declarations) needs additional engine rules. T10 and The Hundred are configuration only. |
| **Umpire app** | Separate view for the on-field umpire to signal decisions; feeds into the scoring store. |
| **Player ratings / rankings** | Compute Elo-like ratings from match results and individual performances. |
| **Social features** | Follow teams/players, activity feed, reactions on deliveries. Schema exists (`follows`, `notifications`). |
| **iOS PWA home screen prompt** | Safari does not support `beforeinstallprompt`. A separate prompt flow for iOS users is needed. |
| **Conflict resolution UI** | The sync architecture handles conflicts; the UI for the scorer to review and resolve them is not built. |
| **Internationalization (i18n)** | App is English-only. `next-intl` or similar would be added to the App Router layout. |
