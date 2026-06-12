/**
 * Stats feature — public surface for the leaderboards hub.
 */

export { StatTabs, type StatTabsData } from "./components/StatTabs";
export { Leaderboard } from "./components/Leaderboard";
export { LeaderboardRow } from "./components/LeaderboardRow";
export { statsKeys, useRecomputeMatchStats } from "./queries";
export { loadLeaderboards } from "./loader";
export type { LeaderboardKind, LeaderboardRowVM } from "./types";
