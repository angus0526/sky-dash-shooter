export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const PLAYER_SPEED = 320;
export const PLAYER_START_X = 140;
export const PLAYER_START_Y = GAME_HEIGHT / 2;
export const PLAYER_MAX_HEALTH = 5;
export const PLAYER_INVULN_MS = 1000;

export const SCROLL_SPEED_START = 220;
export const SCROLL_SPEED_MAX = 480;
export const SCROLL_SPEED_RAMP_PER_SEC = 2.5;

export const SPAWN_INTERVAL_START_MS = 1400;
export const SPAWN_INTERVAL_MIN_MS = 550;
export const SPAWN_INTERVAL_RAMP_PER_SEC = 6;

export const TARGET_RATIO = 0.55;

export const LOCK_RADIUS = 360;
export const LOCK_CONE_DEG = 55;

export const JOYSTICK_RADIUS = 60;
export const JOYSTICK_DEAD_ZONE = 6;
export const SHOOT_BUTTON_RADIUS = 46;
export const JOYSTICK_REPOSITION_HOLD_MS = 5000;
// A real finger resting on a phone (held in the hand, not flat on a table) drifts several
// px over a full 5-second hold from natural micro-tremor alone — 14 was tight enough that
// ordinary hand shake silently cancelled the reposition timer before it ever fired, on every
// real-device attempt, even though the touch itself was never released.
export const JOYSTICK_REPOSITION_MOVE_TOLERANCE = 40;
export const JOYSTICK_POSITION_STORAGE_KEY = 'skydash_joystick_pos';

// Weapon levels — bullet/laser/nuke each level independently, 0-10.
export const WEAPON_LEVEL_MAX = 10;
export const WEAPON_SPREAD_SPACING = 16;

export const TIER1_FIRE_COOLDOWN_MS = 260;
export const TIER1_SPEED = 700;

export const TIER2_FIRE_COOLDOWN_MS = 150;
export const TIER2_SPEED = 760;
export const TIER2_BODY_SIZE = 22;

export const TIER3_FIRE_COOLDOWN_MS = 950;
export const TIER3_SPEED = 380;
export const NUKE_EXPLOSION_RADIUS = 190;

// Shield
export const SHIELD_MAX_CHARGES = 3;

// Pickups
export const PICKUP_INTERVAL_MS = 15000;
export const PICKUP_INTERVAL_JITTER_MS = 4000;
export const PICKUP_SPEED_FACTOR = 0.7;
export const PICKUP_MAXED_BONUS_SCORE = 25;

// Difficulty stages (obstacle variety ramps up over time)
export const DIFFICULTY_STAGE_SEC = 20;
export const BIG_OBSTACLE_CHANCE_PER_STAGE = 0.08;
export const BIG_OBSTACLE_CHANCE_MAX = 0.35;

// Boss
export const BOSS_SPAWN_INTERVAL_MS = 80000;
export const BOSS_SPAWN_JITTER_MS = 8000;
// Raised from 220 base / 120 growth: with the ricochet and homing weapons now hitting far
// harder (piercing bounce laser, splash-damage missiles), the old HP made fights over in
// a couple of seconds. 1000 base keeps a real fight going even at max weapon level.
export const BOSS_MAX_HEALTH_BASE = 1000;
export const BOSS_MAX_HEALTH_GROWTH = 550;
export const BOSS_ENTRY_X_RATIO = 0.78;
// Charge attack: on top of the existing vertical bob, the boss periodically lunges toward
// the player and back — front/back movement that adds a second axis to dodge.
export const BOSS_CHARGE_INTERVAL_MS = 5000;
export const BOSS_CHARGE_DISTANCE = 170;
export const BOSS_CHARGE_OUT_MS = 450;
export const BOSS_CHARGE_HOLD_MS = 200;
export const BOSS_FIRE_INTERVAL_MS = 1400;
export const BOSS_BULLET_SPEED = 320;
export const BOSS_DIFFICULTY_JUMP_SEC = 25;
export const BOSS_DEFEAT_SCORE = 200;

// Ricochet weapon (plane 2) — upgraded to a piercing "bounce laser": it now pierces every
// Target it passes through (like the default plane's Tier2 laser) instead of dying on the
// first hit, and bounces more times, so a single shot can chain several kills.
export const RICOCHET_FIRE_COOLDOWN_MS = 300;
export const RICOCHET_SPEED = 700;
export const RICOCHET_MAX_BOUNCES = 6;
export const RICOCHET_BODY_SIZE = 20;
export const RICOCHET_DAMAGE_TO_BOSS = 20;
// Piercing beams no longer die on their first target hit, so a steep-angle shot can loiter
// on screen far longer than the old "dies on first hit" bullet ever did. Without a hard cap,
// a sustained level-10 burst (10 shots every 300ms) could hold far more beams alive at once
// than the pool has room for, silently dropping later shots in the volley.
export const RICOCHET_MAX_LIFETIME_MS = 2200;

// Homing weapon (plane 3) — missiles now launch in a front/back/up/down fan (steering onto
// their target after launch, like real heat-seekers) instead of all firing straight ahead,
// each one prefers a distinct target, and they detonate in a small blast radius on impact.
export const HOMING_FIRE_COOLDOWN_MS = 380;
export const HOMING_SPEED = 520;
export const HOMING_TURN_RATE_DEG = 300;
export const HOMING_SEEK_RADIUS = 500;
export const HOMING_DAMAGE_TO_BOSS = 16;
export const HOMING_SPLASH_DAMAGE_TO_BOSS = 10;
export const HOMING_EXPLOSION_RADIUS = 90;

// Colorful nuke (planes 2 & 3) — a shared secondary weapon unlocked by nuke pickups, using
// the same AoE-detonate logic as the default plane's Tier3 nuke (so it destroys obstacles
// too), just rendered in a cycling rainbow tint so it reads as a distinct weapon.
export const SPECIAL_NUKE_FIRE_COOLDOWN_MS = 1100;
export const SPECIAL_NUKE_TINTS = [0xff5470, 0xfff275, 0x4fd1ff, 0x39ff6a, 0xb388ff];

// Ultimate — full-screen nuke, available to every plane regardless of loadout. Charges
// automatically on a fixed cooldown rather than needing pickups, so it's always usable as a
// panic button / boss-burst instead of something that can be built up and hoarded.
export const ULTIMATE_BUTTON_RADIUS = 42;
export const ULTIMATE_COOLDOWN_MS = 25000;
export const ULTIMATE_BOSS_DAMAGE = 180;

// Progress / unlocks
export const MAX_BOSS_KILLS_STORAGE_KEY = 'skydash_max_boss_kills';

// Audio
export const MUTE_STORAGE_KEY = 'skydash_muted';
