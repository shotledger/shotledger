import { sessionInnerTenCount } from '@shotledger/shared';

/**
 * A session's inner-ten figure. A stored counter wins where there are no shot
 * flags to count: a ShotLog import is one total with no `shots` rows, so
 * counting would always answer 0 and silently contradict the number ShotLog
 * gave. Everywhere else it is null and the flags are the truth (schema.ts).
 */
export function sessionInnerTens(
  storedInnerTenCount: number | null | undefined,
  seriesList: Parameters<typeof sessionInnerTenCount>[0],
): number {
  return storedInnerTenCount ?? sessionInnerTenCount(seriesList);
}
