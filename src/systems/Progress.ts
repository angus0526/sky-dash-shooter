import { MAX_BOSS_KILLS_STORAGE_KEY } from '../config/constants';

/** Persists the best-ever single-run boss kill count so plane unlocks never re-lock. */
export function getMaxBossKills(): number {
  try {
    const raw = localStorage.getItem(MAX_BOSS_KILLS_STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Call with the current run's boss-kill count; only ever ratchets upward. */
export function recordBossKills(currentRunKills: number): void {
  try {
    if (currentRunKills > getMaxBossKills()) {
      localStorage.setItem(MAX_BOSS_KILLS_STORAGE_KEY, String(currentRunKills));
    }
  } catch {
    // ignore storage failures (private browsing etc.)
  }
}
