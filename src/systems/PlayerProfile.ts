import {
  ACTIVE_PROFILE_NAME_STORAGE_KEY,
  MAX_BOSS_KILLS_STORAGE_KEY,
  PROFILE_CODE_VERSION,
  PROFILE_STORAGE_PREFIX
} from '../config/constants';

export interface PlayerProfile {
  /** Stable random id — survives renames, used as the future leaderboard doc key. */
  id: string;
  name: string;
  maxBossKills: number;
  bestScore: number;
  /** Score from the most recently finished run; carried by the resume code so it round-trips. */
  lastScore: number;
  updatedAt: number;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  let id = '';
  for (let i = 0; i < 12; i++) id += Math.floor(Math.random() * 36).toString(36);
  return id;
}

function storageKeyForName(name: string): string {
  return PROFILE_STORAGE_PREFIX + name.trim().toLowerCase();
}

function readProfile(storageKey: string): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id !== 'string' || typeof parsed?.name !== 'string') return null;
    return {
      id: parsed.id,
      name: parsed.name,
      maxBossKills: Number(parsed.maxBossKills) || 0,
      bestScore: Number(parsed.bestScore) || 0,
      lastScore: Number(parsed.lastScore) || 0,
      updatedAt: Number(parsed.updatedAt) || 0
    };
  } catch {
    return null;
  }
}

function writeProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(storageKeyForName(profile.name), JSON.stringify(profile));
  } catch {
    // ignore storage failures (private browsing etc.)
  }
}

export function getProfileByName(name: string): PlayerProfile | null {
  return readProfile(storageKeyForName(name));
}

export function createProfile(name: string): PlayerProfile {
  return {
    id: randomId(),
    name: name.trim(),
    maxBossKills: 0,
    bestScore: 0,
    lastScore: 0,
    updatedAt: Date.now()
  };
}

export function saveProfile(profile: PlayerProfile): void {
  writeProfile(profile);
  try {
    localStorage.setItem(ACTIVE_PROFILE_NAME_STORAGE_KEY, profile.name);
  } catch {
    // ignore storage failures (private browsing etc.)
  }
}

/** Saves the profile and marks it as the one currently in play. */
export function setActiveProfile(profile: PlayerProfile): void {
  saveProfile(profile);
}

export function getActiveProfile(): PlayerProfile | null {
  try {
    const activeName = localStorage.getItem(ACTIVE_PROFILE_NAME_STORAGE_KEY);
    if (!activeName) return null;
    return getProfileByName(activeName);
  } catch {
    return null;
  }
}

/** Call once at boot: carries the old single-value boss-kill counter into a "Guest" profile so returning players don't lose unlock progress after this update. No-ops once any profile exists. */
export function migrateLegacyProgress(): void {
  try {
    if (getActiveProfile()) return;
    const legacy = localStorage.getItem(MAX_BOSS_KILLS_STORAGE_KEY);
    const n = legacy ? parseInt(legacy, 10) : 0;
    if (!Number.isFinite(n) || n <= 0) return;
    const profile = createProfile('Guest');
    profile.maxBossKills = n;
    setActiveProfile(profile);
  } catch {
    // ignore storage failures (private browsing etc.)
  }
}

/** Call when a run ends: updates the active profile's last/best score. */
export function recordRunScore(score: number): void {
  const profile = getActiveProfile();
  if (!profile) return;
  profile.lastScore = score;
  if (score > profile.bestScore) profile.bestScore = score;
  profile.updatedAt = Date.now();
  saveProfile(profile);
}

/** Call whenever the run's boss-kill count might have grown; only ever ratchets upward. */
export function recordBossKills(currentRunKills: number): void {
  const profile = getActiveProfile();
  if (!profile) return;
  if (currentRunKills > profile.maxBossKills) {
    profile.maxBossKills = currentRunKills;
    profile.updatedAt = Date.now();
    saveProfile(profile);
  }
}

function toBase64Url(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

/** Not cryptographic — just enough to catch a mistyped/truncated code before it silently loads garbage. */
function checksum(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
}

export function encodeProfileCode(profile: PlayerProfile): string {
  const payload = {
    v: PROFILE_CODE_VERSION,
    id: profile.id,
    n: profile.name,
    mb: profile.maxBossKills,
    bs: profile.bestScore,
    ls: profile.lastScore,
    t: profile.updatedAt
  };
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${checksum(body)}`;
}

/** Returns null for any malformed, truncated, or checksum-mismatched code — callers should show a "代碼無效" message rather than silently proceeding with partial data. */
export function decodeProfileCode(code: string): PlayerProfile | null {
  const trimmed = code.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot === -1) return null;

  const body = trimmed.slice(0, dot);
  const check = trimmed.slice(dot + 1);
  if (checksum(body) !== check.toUpperCase()) return null;

  try {
    const payload = JSON.parse(fromBase64Url(body));
    if (payload.v !== PROFILE_CODE_VERSION || typeof payload.id !== 'string' || typeof payload.n !== 'string') {
      return null;
    }
    return {
      id: payload.id,
      name: payload.n,
      maxBossKills: Number(payload.mb) || 0,
      bestScore: Number(payload.bs) || 0,
      lastScore: Number(payload.ls) || 0,
      updatedAt: Number(payload.t) || Date.now()
    };
  } catch {
    return null;
  }
}
