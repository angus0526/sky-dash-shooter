import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { PlayerProfile } from './PlayerProfile';

export interface LeaderboardEntry {
  id: string;
  name: string;
  bestScore: number;
  maxBossKills: number;
}

const LEADERBOARD_COLLECTION = 'leaderboard';
const LEADERBOARD_TOP_N = 10;

/**
 * Fire-and-forget after a run ends. Keyed by the profile's stable id (not name) so renames
 * and same-name players never collide. The get-then-set here isn't atomic — a rare
 * concurrent overwrite is an acceptable tradeoff for a casual leaderboard — but Firestore
 * security rules independently enforce that a write can never lower a stored score.
 */
export async function submitScore(profile: PlayerProfile): Promise<void> {
  if (profile.bestScore <= 0) return;

  const ref = doc(firestore, LEADERBOARD_COLLECTION, profile.id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists() && (snap.data().bestScore ?? 0) >= profile.bestScore) return;

    await setDoc(ref, {
      name: profile.name,
      bestScore: profile.bestScore,
      maxBossKills: profile.maxBossKills,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.warn('[leaderboard] submit failed', err);
  }
}

export async function fetchTopScores(): Promise<LeaderboardEntry[]> {
  const q = query(collection(firestore, LEADERBOARD_COLLECTION), orderBy('bestScore', 'desc'), limit(LEADERBOARD_TOP_N));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? '???'),
      bestScore: Number(data.bestScore) || 0,
      maxBossKills: Number(data.maxBossKills) || 0
    };
  });
}
