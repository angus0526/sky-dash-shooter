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
  private nextBossAt: number;
  private nextFireAt = 0;
  private encounterCount = 0;

  constructor(scene: Phaser.Scene, spawner: Spawner) {
    this.scene = scene;
    this.spawner = spawner;
    this.boss = new Boss(scene);
    this.bulletPool = new BossBulletPool(scene);
    this.nextBossAt = scene.time.now + this.randomBossDelay();
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

    if (!this.active) {
      if (now >= this.nextBossAt) {
        this.active = true;
        const maxHealth = BOSS_MAX_HEALTH_BASE + this.encounterCount * BOSS_MAX_HEALTH_GROWTH;
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
      const count = Phaser.Math.Between(1, 3);
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
