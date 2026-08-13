import { getActiveProfile, recordBossKills as recordBossKillsOnProfile } from './PlayerProfile';

/** Persists the best-ever single-run boss kill count (per active player profile) so plane unlocks never re-lock. */
export function getMaxBossKills(): number {
  return getActiveProfile()?.maxBossKills ?? 0;
}

/** Call with the current run's boss-kill count; only ever ratchets upward. */
export function recordBossKills(currentRunKills: number): void {
  recordBossKillsOnProfile(currentRunKills);
}
