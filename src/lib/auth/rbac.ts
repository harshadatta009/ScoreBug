import type { AppRole } from "@/domain/cricket/enums";

/**
 * Role-based access control.
 *
 * Pure, side-effect-free functions so they are trivially unit-testable and can
 * run on both the server (authoritative checks in actions/RLS mirroring) and
 * the client (to hide UI affordances — never as the only gate). The DB's RLS
 * policies remain the ultimate authority; this is a fast, consistent mirror.
 */

/**
 * Numeric privilege level per role. Higher = more privileged. Used for the
 * "at least this role" style checks. `scorer` and `umpire` sit at the same tier
 * (match officials) but grant different *actions* — see ROLE_ACTIONS.
 */
const ROLE_RANK: Record<AppRole, number> = {
  player: 1,
  captain: 2,
  scorer: 3,
  umpire: 3,
  team_admin: 4,
  tournament_admin: 5,
  super_admin: 6,
};

/** Discrete capabilities checked across the app. */
export type Action =
  | "match:create"
  | "match:edit"
  | "match:delete"
  | "ball:record"
  | "ball:edit"
  | "innings:manage"
  | "team:create"
  | "team:edit"
  | "team:manage_members"
  | "tournament:create"
  | "tournament:edit"
  | "tournament:manage_teams"
  | "user:manage_roles"
  | "stats:recompute";

/**
 * Explicit capability grants per role. A role implicitly inherits the
 * capabilities of every role it outranks via `ROLE_RANK` (see `can`), so we
 * only list the *additional* capability a tier unlocks. This keeps the matrix
 * readable and avoids the combinatorial explosion of a full grant table.
 */
const ROLE_ACTIONS: Record<AppRole, ReadonlySet<Action>> = {
  player: new Set<Action>([]),
  captain: new Set<Action>(["team:edit"]),
  scorer: new Set<Action>([
    "match:create",
    "match:edit",
    "ball:record",
    "ball:edit",
    "innings:manage",
  ]),
  // Umpires officiate but do not own the scorebook: they may record/correct
  // deliveries but not create matches.
  umpire: new Set<Action>(["ball:record", "ball:edit", "innings:manage"]),
  team_admin: new Set<Action>([
    "team:create",
    "team:edit",
    "team:manage_members",
  ]),
  tournament_admin: new Set<Action>([
    "tournament:create",
    "tournament:edit",
    "tournament:manage_teams",
    "match:create",
    "match:edit",
    "match:delete",
  ]),
  super_admin: new Set<Action>([
    "user:manage_roles",
    "stats:recompute",
    "match:delete",
  ]),
};

/** True when `role` outranks or equals `minimum` on the privilege ladder. */
export function hasAtLeast(role: AppRole, minimum: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** The most privileged role from a set of grants (a user may hold several). */
export function highestRole(roles: readonly AppRole[]): AppRole | null {
  let best: AppRole | null = null;
  for (const r of roles) {
    if (best === null || ROLE_RANK[r] > ROLE_RANK[best]) best = r;
  }
  return best;
}

/**
 * Whether a single role may perform `action`. A role is granted an action if it
 * is listed directly, OR if any role it outranks lists it (downward
 * inheritance). super_admin can do everything.
 */
export function roleCan(role: AppRole, action: Action): boolean {
  if (role === "super_admin") return true;
  const rank = ROLE_RANK[role];
  for (const candidate of Object.keys(ROLE_ACTIONS) as AppRole[]) {
    if (ROLE_RANK[candidate] <= rank && ROLE_ACTIONS[candidate].has(action)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a user — who may hold multiple roles — may perform `action`.
 * The grant is the union across all held roles.
 */
export function can(
  roles: AppRole | readonly AppRole[],
  action: Action,
): boolean {
  const list = Array.isArray(roles) ? roles : [roles as AppRole];
  return list.some((r) => roleCan(r, action));
}
