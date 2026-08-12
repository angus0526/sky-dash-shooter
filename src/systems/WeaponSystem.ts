import Phaser from 'phaser';
import { BulletPool } from './BulletPool';
import { LaserPool } from './LaserPool';
import { NukePool } from './NukePool';
import { Sfx } from './Sfx';
import { TIER1_FIRE_COOLDOWN_MS, TIER2_FIRE_COOLDOWN_MS, TIER3_FIRE_COOLDOWN_MS } from '../config/constants';

export type WeaponType = 'bullet' | 'laser' | 'nuke';

/** Owns three independent weapon levels, uncapped, that all fire simultaneously when held. */
export class WeaponSystem {
  bulletLevel = 1;
  laserLevel = 0;
  nukeLevel = 0;

  private nextBulletFireAt = 0;
  private nextLaserFireAt = 0;
  private nextNukeFireAt = 0;

  constructor(
    private scene: Phaser.Scene,
    private bullets: BulletPool,
    private lasers: LaserPool,
    private nukes: NukePool,
    private sfx: Sfx
  ) {}

  levelOf(type: WeaponType): number {
    if (type === 'bullet') return this.bulletLevel;
    if (type === 'laser') return this.laserLevel;
    return this.nukeLevel;
  }

  upgrade(type: WeaponType): void {
    if (type === 'bullet') this.bulletLevel++;
    else if (type === 'laser') this.laserLevel++;
    else this.nukeLevel++;
  }

  reset(): void {
    this.bulletLevel = 1;
    this.laserLevel = 0;
    this.nukeLevel = 0;
    this.nextBulletFireAt = 0;
    this.nextLaserFireAt = 0;
    this.nextNukeFireAt = 0;
  }

  tryFire(x: number, y: number, targetX: number | null, targetY: number | null): void {
    const now = this.scene.time.now;

    if (this.bulletLevel > 0 && now >= this.nextBulletFireAt) {
      this.bullets.fireSpread(this.bulletLevel, x, y, targetX, targetY);
      this.sfx.shoot();
      this.nextBulletFireAt = now + TIER1_FIRE_COOLDOWN_MS;
    }

    if (this.laserLevel > 0 && now >= this.nextLaserFireAt) {
      this.lasers.fireSpread(this.laserLevel, x, y, targetX, targetY);
      this.sfx.laser();
      this.nextLaserFireAt = now + TIER2_FIRE_COOLDOWN_MS;
    }

    if (this.nukeLevel > 0 && now >= this.nextNukeFireAt) {
      this.nukes.fireSpread(this.nukeLevel, x, y, targetX, targetY);
      this.nextNukeFireAt = now + TIER3_FIRE_COOLDOWN_MS;
    }
  }
}
