import Phaser from 'phaser';
import { Boss } from '../entities/Boss';
import { BossBulletPool } from './BossBulletPool';
import { Spawner } from './Spawner';
import {
  BOSS_DIFFICULTY_JUMP_SEC,
  BOSS_FIRE_INTERVAL_MS,
  BOSS_MAX_HEALTH_BASE,
  BOSS_MAX_HEALTH_GROWTH,
  BOSS_SPAWN_INTERVAL_MS,
  BOSS_SPAWN_JITTER_MS
} from '../config/constants';

/** Owns the "next boss due" timer, the boss instance, and its attack pattern. */
export class BossManager {
  boss: Boss;
  bulletPool: BossBulletPool;
  active = false;
  onBossStart: (() => void) | null = null;
  onBossEnd: (() => void) | null = null;

  private scene: Phaser.Scene;
  private spawner: Spawner;
  /** Null until the first real update() tick — see that method for why. */
  private nextBossAt: number | null = null;
  private nextFireAt = 0;
  private encounterCount = 0;

  /** Player-count difficulty multiplier (1.0 in solo). Scales boss HP and per-volley bullet count — fight frequency is left unscaled so pacing stays predictable regardless of squad size. */
  constructor(scene: Phaser.Scene, spawner: Spawner, private multiplier: number = 1) {
    this.scene = scene;
    this.spawner = spawner;
    this.boss = new Boss(scene);
    this.bulletPool = new BossBulletPool(scene);
  }

  private randomBossDelay(): number {
    return BOSS_SPAWN_INTERVAL_MS + Phaser.Math.Between(-BOSS_SPAWN_JITTER_MS, BOSS_SPAWN_JITTER_MS);
  }

  reset(): void {
    this.boss.despawn();
    this.bulletPool.reset();
    this.active = false;
    this.encounterCount = 0;
    this.nextBossAt = this.scene.time.now + this.randomBossDelay();
    this.spawner.setPaused(false);
    this.onBossEnd?.();
  }

  update(playerX: number, playerY: number): void {
    const now = this.scene.time.now;
    this.bulletPool.update();

    if (this.nextBossAt === null) {
      // Anchored to the first real gameplay tick rather than construction time (which runs
      // during GameScene.create(), before the player has even dismissed the intro panel) —
      // otherwise time spent sitting on that screen (or, worse, waiting in a multiplayer
      // lobby for a friend to join) counts toward the boss's countdown, and a slow start
      // can make the boss already "due" the instant play actually begins.
      this.nextBossAt = now + this.randomBossDelay();
    }

    if (!this.active) {
      if (now >= this.nextBossAt) {
        this.active = true;
        const maxHealth = (BOSS_MAX_HEALTH_BASE + this.encounterCount * BOSS_MAX_HEALTH_GROWTH) * this.multiplier;
        this.encounterCount++;
        this.boss.spawn(maxHealth);
        this.spawner.setPaused(true);
        this.nextFireAt = now + BOSS_FIRE_INTERVAL_MS;
        this.onBossStart?.();
      }
      return;
    }

    this.boss.update();

    if (now >= this.nextFireAt) {
      this.nextFireAt = now + BOSS_FIRE_INTERVAL_MS;
      const count = Math.round(Phaser.Math.Between(1, 3) * this.multiplier);
      this.bulletPool.fire(this.boss.x, this.boss.y, playerX, playerY, count);
    }
  }

  /** Call once when GameScene detects the boss's health has hit zero. */
  defeatBoss(): void {
    this.boss.despawn();
    this.bulletPool.reset();
    this.active = false;
    this.spawner.setPaused(false);
    this.spawner.advanceDifficulty(BOSS_DIFFICULTY_JUMP_SEC);
    this.nextBossAt = this.scene.time.now + this.randomBossDelay();
    this.onBossEnd?.();
  }
}
