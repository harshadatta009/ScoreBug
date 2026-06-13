# CLAUDE.md — Scorebug Engineering Handbook

This is the **primary engineering handbook and coding standard** for Scorebug, for
every human developer and AI coding agent. It is **prescriptive**: when generating
or reviewing code, follow it exactly. Where this document and a generic best-practice
disagree, **this document wins** — it describes the conventions this codebase actually
uses, not an idealized template.

Scorebug is a production-grade, offline-capable **PWA for live cricket scoring and
tournament management**.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Supabase
(Postgres + Auth + RLS + Realtime) · Tailwind CSS · TanStack Query · Zustand
(scoped) · Zod · Serwist (service worker) · Vitest + Playwright · deployed on Vercel.

---

## 1. Core Engineering Principles

These are non-negotiable. Every change is judged against them.

- **SOLID** — single-responsibility modules; depend on abstractions (the repository
  layer), not on the Supabase client directly from UI.
- **DRY** — one source of truth. Domain rules live in `src/domain`, data access in
  `src/lib/repositories`, validation schemas beside their server action. Never copy a
  query or a Zod schema; import it.
- **KISS** — the simplest thing that satisfies the requirement and the principles
  below. No speculative configurability.
- **YAGNI** — do not add abstractions, options, or layers for hypothetical futures.
  Add them when a second real caller appears.
- **Clean Architecture / Separation of Concerns** — dependencies point inward:
  `app` → `server/actions` → `lib/repositories` → `lib/supabase` → Postgres. The
  pure `domain` layer depends on **nothing** framework-specific.
- **Domain-driven organization** — group by feature/vertical (matches, teams,
  tournaments, players, stats), not by technical type.
- **Type Safety First** — strict TypeScript, branded IDs, generated DB types, Zod at
  every trust boundary. No `any`.
- **Security by Default** — RLS on every table, `requireUser()` + ownership re-checks
  in actions, least privilege. A new table or endpoint is insecure until proven
  otherwise.
- **Performance by Default** — Server Components and server-side data fetching first;
  ship the smallest possible client bundle.

---

## 2. Project Architecture

### 2.1 Actual directory layout (this is the source of truth)

```text
src/
├── app/                      # App Router. THIN pages/layouts only — no business logic.
│   ├── (app)/                # Authenticated app shell (BottomNav). Gated by middleware.
│   ├── auth/callback/        # OAuth / magic-link route handler.
│   ├── match/[matchId]/score # Full-screen live scorer (outside the (app) shell).
│   ├── login, signup, offline
│   ├── layout.tsx, manifest.ts, sw.ts
├── components/
│   ├── ui/                   # Primitive, presentational, framework-agnostic (shadcn-style).
│   ├── shared/               # Cross-feature composite UI (Logo, BottomNav, headers).
│   ├── scoring/, auth/, providers/
├── features/                 # Feature verticals. Client-side glue:
│   └── <feature>/
│       ├── queries.ts        #   TanStack Query keys + hooks wrapping server actions.
│       └── components/        #   Feature-specific (often client) components.
├── domain/                   # PURE, framework-agnostic business logic. Heavily unit-tested.
│   ├── cricket/engine/       #   Ball-by-ball scoring engine (reducer, rules).
│   ├── stats/                #   Aggregation, rankings, NRR.
│   └── shared/ids.ts         #   Branded ID types + `asId<T>()`.
├── server/
│   └── actions/              # "use server" entry points. Validate → authorize → repo → revalidate.
├── lib/
│   ├── supabase/             # Typed clients: server.ts, client.ts, admin.ts, middleware.ts + database.types.ts
│   ├── repositories/         # Typed data-access layer. The ONLY place that builds Supabase queries.
│   ├── auth/session.ts       # getUser / getUserId / getUserRoles / requireUser (request-cached).
│   ├── offline/, push/, query/
├── hooks/                    # Reusable client hooks.
├── stores/                   # Zustand stores (scoped — see §8).
└── middleware.ts             # Root middleware → updateSession (auth gate + token refresh).
```

### 2.2 Mapping to the canonical template

The brief references `services/`, `types/`, `schemas/`, `constants/`, `middleware/`.
This codebase implements those concerns under **existing** names — use these, do not
recreate the brief's folders:

| Canonical concept | Where it lives here |
|---|---|
| `services/` (business + data access) | `src/domain` (pure logic) + `src/lib/repositories` (data access) + `src/server/actions` (entry points) |
| `types/` | `src/domain/shared/ids.ts` (branded IDs), `src/lib/supabase/database.types.ts` (generated), and inline domain types beside their module |
| `schemas/` | Zod schemas defined **in the server action file** that owns them (co-located with use) |
| `constants/` | Co-located with the feature/domain module that owns them; promote to a shared module only on real reuse |
| `middleware/` | `src/middleware.ts` + `src/lib/supabase/middleware.ts` |

### 2.3 Layering rules (enforced)

1. **Pages/layouts are thin.** A page composes components and triggers data fetching.
   It contains no scoring math, no Supabase query, no Zod schema.
2. **Business logic never lives in UI components.** Cricket/stats rules go in
   `src/domain`; data access goes in `src/lib/repositories`.
3. **Only repositories build Supabase queries.** Server actions and Server Components
   call repository functions, not `supabase.from(...)` directly. The exceptions are
   `lib/auth/session.ts` and `lib/supabase/middleware.ts` (auth plumbing).
4. **`src/domain` imports nothing from `app`, `lib/supabase`, or React.** It is pure
   and unit-testable in isolation.
5. **Cross-feature imports go through `shared`/`domain`/`lib`,** never feature → feature.

---

## 3. Next.js Standards

### 3.1 Server Components first

Default to **React Server Components**. A file is a Server Component unless it has a
real reason to be a Client Component. Reach for `"use client"` **only** when the
component needs:

- Browser APIs (`localStorage`, `navigator`, service worker, IndexedDB),
- React local state / refs / effects, or
- DOM event handlers / interactivity.

When you do need interactivity, **push `"use client"` to the leaf**. Keep data
fetching and composition in the Server Component parent and pass plain props down.
The live scorer (`app/match/[matchId]/score/page.tsx`) is a legitimate large client
component because it is a real-time interactive surface; most screens are not.

### 3.2 Data fetching priority

1. **Server Components** — `await` a repository function directly for reads.
2. **Server Actions** (`src/server/actions/*`) — for all writes/mutations.
3. **Route Handlers** — only for webhooks, OAuth callbacks, and non-UI HTTP endpoints.
4. **TanStack Query** (client) — for interactive reads/mutations that must live in a
   client component; hooks live in `features/<feature>/queries.ts` and wrap server
   actions. Do **not** call `fetch('/api/...')` from components for first-class data.

Avoid: client-side fetching of data a Server Component could load; request waterfalls
(fetch in parallel with `Promise.all`); duplicate fetches of the same resource.

### 3.3 Caching & revalidation

After a mutating server action succeeds, call `revalidatePath(...)` for affected
routes (and/or invalidate the relevant TanStack Query keys in the calling hook). The
server is always authoritative — optimistic UI must reconcile against a server re-read
(see the scoring store's reconcile flow).

---

## 4. TypeScript Standards

`tsconfig.json` runs **strict** plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Keep it that way.

- **No `any`.** Use `unknown` + narrowing, generics, or a precise type. If `any` is
  truly unavoidable, isolate it behind a typed function and leave a one-line `// why:`
  comment.
- **No `@ts-ignore` / `@ts-expect-error`** without an adjacent justification comment
  explaining why and linking the upstream issue if external.
- **Branded IDs.** Never pass raw `string` as an entity id. Use the branded types in
  `domain/shared/ids.ts` (`MatchId`, `TeamId`, `PlayerId`, …) and `asId<"TeamId">(x)`
  to brand at the boundary.
- **Generated DB types.** Import row/enum types from
  `lib/supabase/database.types.ts` (regenerate with `npm run db:types`). Do not
  hand-redeclare table shapes.
- **Interfaces for public contracts** (props, action inputs, repository signatures);
  `type` for unions, mapped, and utility types. Prefer inference for obvious locals.
- **Zod for runtime validation** at every trust boundary (see §6).
- Respect `noUncheckedIndexedAccess`: array/record access yields `T | undefined` —
  handle it, don't assert it away.

---

## 5. Supabase & Data Standards

### 5.1 The data-access contract

```
Server Component / Server Action
        │  (typed args, branded ids)
        ▼
src/lib/repositories/<entity>Repository.ts   ← builds the Supabase query
        ▼
src/lib/supabase/{server,client,admin}.ts    ← typed createClient<Database>()
        ▼
Postgres + Row Level Security
```

- **Repositories are the only place Supabase queries are constructed.** Each returns
  typed, domain-shaped data (or throws). Pagination, ordering, and column selection
  live here.
- **Pick the right client:**
  - `lib/supabase/server.ts` — Server Components, server actions, route handlers (RLS as the user).
  - `lib/supabase/client.ts` — browser/client components.
  - `lib/supabase/admin.ts` — **service-role**; server-only, for trusted system tasks
    that must bypass RLS. Never import this into client code. Never expose its key.
  - `lib/supabase/middleware.ts` — session refresh + route gate only.

### 5.2 Queries

- **Never `select('*')`** in app code — select the explicit columns the caller needs.
- **Paginate** list reads (`.range()` / keyset); never return unbounded sets to the UI.
- Prefer narrow selects and targeted filters over wide joins; push aggregation into
  Postgres functions/views where it belongs (see `team_net_run_rate`, the rollup
  functions).
- Sensitive/privileged reads happen **server-side** only.

### 5.3 Database & migrations

- **RLS is enabled on every table**, with least-privilege policies (see
  `supabase/migrations/*_rls_policies.sql`). A new table ships with RLS + policies in
  the same migration.
- **Schema changes are migrations** in `supabase/migrations/` — never hand-edit the
  hosted schema as the source of truth. Migrations are committed to git.
- An **already-applied migration is immutable**: to change deployed schema, add a
  **new** forward migration. (Editing an old file only affects fresh `db reset`s.)
- **Views** that read RLS-protected tables must be `SECURITY INVOKER`
  (`with (security_invoker = true)`), so they honor the querying user's RLS — not the
  owner's. (This is what cleared the "Security Definer View" advisor.)
- **`SECURITY DEFINER` functions** are allowed only where they must bypass RLS by
  design (rollups, recursion-avoiding policy helpers) and **must pin**
  `set search_path = public, pg_temp`.
- Index frequently-queried / foreign-key columns. Model proper FK relationships.
- Regenerate types after schema changes: `npm run db:types`.

### 5.4 Authentication & authorization

- **Auth is Supabase Auth.** Server-side, read the user via `lib/auth/session.ts`:
  `getUser()` / `getUserId()` / `getUserRoles()` (request-cached, JWT-validated) and
  `requireUser()` (throws when unauthenticated) in actions/handlers.
- **Route protection is in middleware** (`src/middleware.ts` → `updateSession`). The
  app is **gated by default**: only an explicit allowlist is public (landing, login,
  signup, auth callback, `/offline`, and the no-account `/match/demo` scorer).
  Everything else redirects to `/login?redirectTo=…`. Add new public routes to the
  allowlist **deliberately**.
- **Defense in depth:** middleware gate → action-level `requireUser()` + ownership
  re-check → RLS as the final backstop. Never rely on only one.
- **RBAC** via `getUserRoles()` / DB policy helpers (`is_super_admin`, team-role
  checks). Authorize the *action*, not just the route.
- **Never** expose the service-role key, and never put any secret in client code.

---

## 6. Security Standards

- **Validate all input with Zod** at the boundary. Server actions parse their input
  with a co-located schema before doing anything else; reject on failure with a clear
  `ActionResult` error (never throw raw).
- **Authorize before access:** `requireUser()` then verify the caller owns/can mutate
  the specific resource (re-fetch server-side and check), as documented in each
  action file's `AUTHORIZATION CONTRACT` comment.
- **No open redirects:** only allow same-origin relative redirects (see the auth
  callback's `safeRedirect`).
- **Don't trust user-controlled values in security decisions.** Validate format /
  allowlist membership before a value gates a sensitive operation (e.g. OTP `type`
  against the `EmailOtpType` allowlist; tokens against a bounded pattern).
- **Service worker `message` handlers verify origin** before acting.
- **Environment variables**: only `NEXT_PUBLIC_*` may reach the client. Validate
  required env at startup; never log secrets or PII.
- **Secure sessions/cookies** are handled by `@supabase/ssr` in middleware — mirror
  cookie writes onto both request and response exactly as the existing code does; do
  not insert logic between client creation and `getUser()`.
- Rate-limit any new public endpoint.
- CodeQL `security-extended` runs in CI — treat new alerts as build-blocking.

---

## 7. Performance Standards

- Prefer Server Components, streaming, and `<Suspense>` boundaries with skeletons over
  client-side spinners.
- `next/dynamic` for heavy, below-the-fold, or rarely-used client components.
- `next/image` for all raster images; provide sizes.
- Fetch in parallel (`Promise.all`) — never serialize independent reads.
- Keep client bundles small: don't pull a server-only dependency into a client
  component; memoize only where a real re-render cost exists.
- Push aggregation to Postgres rather than fetching rows and reducing on the client.
- Watch Core Web Vitals, bundle size, and slow queries. No avoidable over-fetching.

---

## 8. State Management

Choose the **least powerful** tool that works, in this order:

1. **URL state** (search params, route segments) — shareable, server-readable filters.
2. **Server state** — Server Components + TanStack Query (`features/*/queries.ts`).
   The server is the source of truth; client caches reconcile against it.
3. **React local state** — `useState`/`useReducer` for component-local UI.
4. **Global client state (Zustand)** — only when justified.

**Zustand is sanctioned for the live scoring engine only** (`src/stores/scoringStore`):
it holds high-frequency, cross-component, optimistic ball-by-ball state that survives
tab interactions and reconciles with the server. Do **not** add new Zustand stores or
any other global-state library for ordinary screens without a documented reason of the
same caliber. Use React Context sparingly (see `components/providers`), only for truly
app-wide concerns (theme, query client).

---

## 9. API & Server Action Standards

### 9.1 The result contract

All server actions return the project's `ActionResult<T>` (never throw to the client):

```ts
export interface ActionResult<T = undefined> {
  ok: boolean;       // success flag — the project standard is `ok`, not `success`
  error?: string;    // human-readable message on failure
  data?: T;          // payload on success
}
```

Callers branch on `res.ok`. Keep this shape consistent across every action and every
TanStack mutation that wraps one.

### 9.2 Server action shape (follow this skeleton)

```ts
"use server";
// 1. Define a co-located Zod schema for the input.
// 2. const user = await requireUser();              // authenticate
// 3. const input = schema.parse(rawInput);          // validate (return {ok:false,error} on ZodError)
// 4. authorize: re-fetch the resource, verify ownership/role
// 5. call a repository function (the only DB access)
// 6. revalidatePath(...) / let the caller invalidate query keys
// 7. return { ok: true, data } | { ok: false, error }
```

Log unexpected failures server-side; return a safe message to the client (no stack
traces, no leaking of internal identifiers).

### 9.3 TanStack Query conventions

- Query **keys are defined per feature** in `features/<feature>/queries.ts` (e.g.
  `matchKeys`), not in a global factory, so each vertical owns its cache namespace.
- Mutation hooks wrap server actions and `invalidateQueries` the affected detail/list
  keys `onSuccess`.

---

## 10. UI Standards

- **Mobile-first, responsive.** This is a phone-first PWA; design for the small screen
  and enhance up.
- **Accessibility is required:** semantic HTML, labelled controls, keyboard
  navigation, visible focus states, `aria-*` where semantics aren't enough,
  `aria-current` for active nav. Respect safe-area insets.
- **Three states for every async surface:** loading (skeletons), error, and empty —
  never a bare spinner with no fallback.
- **Reuse `components/ui` primitives**; compose, don't fork. Use the Tailwind design
  tokens (theme colors like `--primary`, spacing scale) — no magic hex values or
  ad-hoc pixel spacing. Keep the PWA theme color in lockstep with the manifest.

---

## 11. Testing Standards

- **Unit tests (Vitest + RTL):** all **pure domain logic** in `src/domain` must be
  unit-tested. The Vitest coverage gate is **scoped to `src/domain`** (≥60% lines /
  statements / functions, ≥55% branches) — that is the surface unit tests own. New
  domain logic ships with tests that keep it above the gate.
- **E2E / integration (Playwright):** UI, pages, server actions, and critical user
  flows (sign in → create team → set up match → score) are covered by `tests/e2e`.
  UI is **not** expected to have Vitest unit coverage — that's why coverage is scoped.
- **Every new feature includes tests** at the appropriate layer: domain rule → Vitest;
  user flow → Playwright.
- Run before pushing: `npm run typecheck && npm run lint && npm run test && npm run build`.

---

## 12. Commands

```bash
npm run dev            # local dev server
npm run build          # production build (also bundles the service worker)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # ESLint (next lint)
npm run test           # Vitest (unit) — run once
npm run test:coverage  # Vitest with coverage gate (scoped to src/domain)
npm run test:e2e       # Playwright
npm run db:types       # regenerate Supabase types -> src/lib/supabase/database.types.ts
npm run db:push        # apply migrations to the linked Supabase project
npm run db:reset       # reset local DB from migrations + seed
```

Note: pushing to GitHub does **not** apply migrations or deploy. `supabase db push`
(or the SQL editor) applies schema to the database; Vercel deploys the app on push to
`main`.

---

## 13. CI / Deployment

- **CI (`.github/workflows/ci.yml`):** install → typecheck → lint → unit tests
  (coverage) → build → (PR only) Playwright E2E. All must pass.
- **Security (`.github/workflows/codeql.yml`):** CodeQL `security-extended` for JS/TS
  on push/PR to `main`/`develop` + weekly. New alerts block merge; fixes auto-close on
  the next scan of the fixed branch.
- **Deploy:** Vercel builds from `main`. Real env vars (Supabase URL/keys) come from
  Vercel project settings, not the repo. The PWA requires HTTPS (Vercel provides it).

---

## 14. Code Review Checklist

Before approving, verify:

- [ ] **Architecture** — logic in the right layer (domain/repo/action), pages thin, no
      Supabase queries outside repositories, no feature→feature imports.
- [ ] **SOLID / DRY / KISS / YAGNI** — no duplication, no speculative abstraction.
- [ ] **Type safety** — no `any`/unsuppressed `@ts-ignore`, branded IDs, generated DB
      types, `noUncheckedIndexedAccess` respected.
- [ ] **Security** — Zod-validated input, `requireUser()` + ownership/RBAC check, RLS
      present for new tables, no service-role/secret leakage, no open redirect.
- [ ] **Performance** — Server Component where possible, minimal `"use client"`, no
      waterfalls/over-fetch, paginated lists.
- [ ] **UI/A11y** — mobile-first, keyboard + semantics, loading/error/empty states,
      design tokens.
- [ ] **Tests** — domain logic unit-tested (gate green), critical flows in Playwright.
- [ ] **State** — least-powerful option; no new global store without justification.
- [ ] **Action contract** — returns `ActionResult<T>` (`ok`/`error`/`data`).
- [ ] **Docs** — this file / comments updated when conventions change.

---

## 15. AI Agent Operating Rules

Before generating code:

1. **Read the existing architecture and the relevant files** — match real patterns,
   not generic ones.
2. **Reuse** existing repositories, schemas, domain functions, UI primitives, and
   query-key factories. Prefer **modifying** existing code over duplicating it.
3. **Don't introduce new abstractions, dependencies, or folders** unless the task
   genuinely requires them (YAGNI). Use the structure in §2.
4. **Maintain backward compatibility** and the established contracts (`ActionResult`,
   branded IDs, repository boundary).
5. **Generate production-ready code** — handle errors, edge cases, and the
   loading/error/empty UI states.
6. **Include tests** at the correct layer (domain → Vitest; flow → Playwright).
7. **Consider security and performance** for every change (the §6/§7 lists).
8. **Follow project conventions exactly** — naming, file placement, the action
   skeleton, comment style.

Never:

- Generate placeholder/stub implementations or fake data paths.
- Leave a TODO without an explanation and a clear follow-up.
- Introduce dead code or unused exports (`noUnusedLocals` will fail anyway).
- Bypass Zod validation, `requireUser()`, or RLS.
- Suppress TypeScript or ESLint errors instead of fixing them.
- Put business logic in a UI component, or a Supabase query outside a repository.
- Expose secrets or the service-role client to the client bundle.

---

## 16. Definition of Done

A change is complete only when **all** hold:

- [ ] Functionality works as specified (verified, not assumed).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` (and the scoped coverage gate) passes; new logic is tested.
- [ ] Critical user flows still pass under Playwright when touched.
- [ ] Accessibility requirements met (semantics, keyboard, focus, states).
- [ ] Security checks done (validation, authorization, RLS, no secret/PII leakage).
- [ ] `npm run build` succeeds with no new warnings of substance.
- [ ] No critical performance regression (bundle / queries / Web Vitals).
- [ ] Migrations added for any schema change (and applied to the DB, not just pushed
      to git); `db:types` regenerated.
- [ ] Documentation/comments updated; review checklist (§14) satisfied.
