/**
 * Branded ID types.
 *
 * Using nominal typing prevents accidentally passing a `MatchId` where a
 * `TeamId` is expected, which is a common and hard-to-spot class of bug in a
 * domain with many UUID-shaped identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type PlayerId = Brand<string, "PlayerId">;
export type TeamId = Brand<string, "TeamId">;
export type TournamentId = Brand<string, "TournamentId">;
export type MatchId = Brand<string, "MatchId">;
export type InningsId = Brand<string, "InningsId">;
export type OverId = Brand<string, "OverId">;
export type BallId = Brand<string, "BallId">;
export type VenueId = Brand<string, "VenueId">;

/** Cast a raw string to a branded id. Validate UUID shape at the boundary. */
export const asId = <B extends string>(raw: string): Brand<string, B> =>
  raw as Brand<string, B>;
