// Wire schemas for WebShooter API v4.1.9 (webshooter.se). Executable spec:
// docs/specs/webshooter-core-spec.md §2.1. Field sets and envelope nesting
// were confirmed by reading ~/.cache/webshooter/ (wscli's response cache) —
// SHAPES only, never copied values (see spec §0's real-data rule). Every
// object schema is `z.object` (never `z.strictObject`): the real API returns
// far more fields than we read, and a strict schema would fail on the next
// unrelated field WebShooter adds upstream.
import { z } from 'zod';

export const weaponClassSchema = z.object({
  id: z.number(),
  weapongroups_id: z.number(),
  classname: z.string(),
  // Absent from the weaponclass embedded in a patrol's signups, present in
  // the one embedded in results. Nothing here reads it, so requiring it
  // only ever cost us: it is the single field that made every My Starts
  // fetch fail (2026-09-11).
  championship: z.number().optional(),
  classname_general: z.string(),
});
export type WeaponClass = z.infer<typeof weaponClassSchema>;

export const stationResultSchema = z.object({
  id: z.number(),
  signups_id: z.number(),
  finals: z.union([z.literal(0), z.literal(1)]),
  distinguish: z.union([z.literal(0), z.literal(1)]),
  stations_id: z.number(),
  // Null on a station that was not shot — 40 of wscli's 256 captured results
  // responses carry a null `points`, 23 a null `hits`. Required here meant
  // half the real corpus failed to parse.
  figure_hits: z.number().nullable(),
  hits: z.number().nullable(),
  points: z.number().nullable(),
  // Live data mixes numbers and numeric strings in this array (competition
  // 349, 2026-09-11). Nothing reads it — accepting both beats requiring a
  // shape we never look at and losing the screen over it.
  station_figure_hits: z.array(z.union([z.number(), z.string()])),
  deleted_at: z.string().nullable(),
});
export type StationResult = z.infer<typeof stationResultSchema>;

export const clubSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type Club = z.infer<typeof clubSchema>;

// Identity + same-club fields only (§A.10's personal-data boundary) — never
// the full WebShooter user profile, even though the real payload has more.
// Require what we read, and no more. `clubs_id` and `clubs` are absent for
// some shooters in live results (competition 349, 2026-09-11) and nothing
// here has ever read them — a required field we never use can only ever
// cost us a working screen.
export const userSchema = z.object({
  fullname: z.string(),
  shooting_card_number: z.string().nullable(),
  clubs_id: z.number().optional(),
  clubs: z.array(clubSchema).optional(),
});
export type WebShooterUser = z.infer<typeof userSchema>;

export const signupSchema = z.object({
  id: z.number(),
  competitions_id: z.number(),
  patrols_id: z.number(),
  lane: z.number(),
  weaponclasses_id: z.number(),
  // Null until a patrol is scheduled — by far the commonest null in the
  // corpus (144 responses), and it is the normal state of an open signup.
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  weaponclass: weaponClassSchema.optional(),
  user: userSchema.optional(),
  club: clubSchema.optional(),
});
export type Signup = z.infer<typeof signupSchema>;

export const resultRowSchema = z.object({
  id: z.number(),
  competitions_id: z.number(),
  signups_id: z.number(),
  placement: z.number(),
  figure_hits: z.number().nullable(),
  hits: z.number().nullable(),
  points: z.number().nullable(),
  weaponclasses_id: z.number(),
  std_medal: z.enum(['B', 'S']).nullable(),
  // A result row whose signup has been removed keeps the row: two captures
  // have one.
  signup: signupSchema.nullable(),
  weaponclass: weaponClassSchema,
  results: z.array(stationResultSchema),
  results_finals: z.array(stationResultSchema),
  results_distinguish: z.array(stationResultSchema),
});
export type ResultRow = z.infer<typeof resultRowSchema>;

export const resultsResponseSchema = z.object({
  results: z.array(resultRowSchema),
});
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;

export const competitionResultsTypeSchema = z
  .enum(['precision', 'field', 'military', 'pointfield'])
  .nullable();
export type CompetitionResultsType = z.infer<typeof competitionResultsTypeSchema>;

export const competitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  date: z.string(),
  results_type: competitionResultsTypeSchema,
  contact_city: z.string(),
  contact_venue: z.string(),
  status: z.string(),
});
export type Competition = z.infer<typeof competitionSchema>;

// GET /competitions/{id}: singular wrap, confirmed against competition_<id>.json.
export const competitionDetailResponseSchema = z.object({
  competitions: competitionSchema,
});
export type CompetitionDetailResponse = z.infer<typeof competitionDetailResponseSchema>;

// GET /competitions: paginated wrap under the SAME key name, confirmed
// against competitions.json — two different envelope shapes, both modeled
// explicitly rather than assumed identical (spec §2.1).
export const competitionsResponseSchema = z.object({
  competitions: z.object({
    data: z.array(competitionSchema),
    current_page: z.number(),
    last_page: z.number(),
    total: z.number(),
  }),
});
export type CompetitionsResponse = z.infer<typeof competitionsResponseSchema>;

export const patrolSchema = z.object({
  id: z.number(),
  competitions_id: z.number(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  patrol_size: z.number(),
  signups: z.array(signupSchema),
});
export type Patrol = z.infer<typeof patrolSchema>;

export const patrolsResponseSchema = z.object({
  patrols: z.array(patrolSchema),
});
export type PatrolsResponse = z.infer<typeof patrolsResponseSchema>;

export const signupsResponseSchema = z.object({
  signups: z.object({
    data: z.array(signupSchema),
    current_page: z.number(),
    last_page: z.number(),
  }),
});
export type SignupsResponse = z.infer<typeof signupsResponseSchema>;

// GET authenticate/user — VERIFY (spec §2.1): not in the cache (a per-session
// call, never persisted by wscli). Assumes the same user-object field names
// embedded elsewhere in the API.
export const authUserSchema = z.object({
  shooting_card_number: z.string().nullable(),
  fullname: z.string().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * `authenticate/user` wraps the user; it does not return it bare.
 *
 * Confirmed against the wscli reference client, which reads
 * `data["user"]["shooting_card_number"]`. Parsing the envelope as the user
 * itself is how connecting an account ended with a stored token, a screen
 * that said "connected", and no card number anywhere.
 */
export const authUserResponseSchema = z.object({
  user: authUserSchema,
});
