import Phaser from 'phaser';
import { GAME_WIDTH, TIER3_SPEED, WEAPON_SPREAD_SPACING } from '../config/constants';

const POOL_SIZE = 34;
const SPRITE_UP_OFFSET = Math.PI / 2;
const NUKE_SPREAD_SPACING = WEAPON_SPREAD_SPACING * 1.8;
const DEFAULT_TINT = 0xff5533;

/** Nuke weapon: slow projectiles that explode into an area-of-effect blast on impact or expiry. Shared by the default plane's Tier3 nuke and the ricochet/homing planes' colorful nuke — same pool, optional per-shot tint. */
export class NukePool {
  group: Phaser.Physics.Arcade.Group;
  onDetonate: ((x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const nuke = this.group.create(0, 0, 'nuke') as Phaser.Physics.Arcade.Sprite;
      nuke.setScale(1.3);
      nuke.setTint(DEFAULT_TINT);
      (nuke.body as Phaser.Physics.Arcade.Body).setCircle(nuke.width * 0.4);
      nuke.setActive(false);
      nuke.setVisible(false);
      nuke.body!.enable = false;
    }
  }

  /** Fires `count` parallel nuke projectiles from (x, y) toward (targetX, targetY), or straight right if no target. `tintPalette`, if given, cycles each shot through those colors instead of the default. */
  fireSpread(count: number, x: number, y: number, targetX: number | null, targetY: number | null, tintPalette?: number[]): void {
    let angle = 0;
    if (targetX !== null && targetY !== null) {
      angle = Math.atan2(targetY - y, targetX - x);
    }
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * NUKE_SPREAD_SPACING;
      const tint = tintPalette ? tintPalette[i % tintPalette.length] : DEFAULT_TINT;
      this.spawnOne(x + perpX * offset, y + perpY * offset, angle, tint);
    }
  }

  private spawnOne(x: number, y: number, angle: number, tint: number): void {
    const nuke = this.group.getFirstDead(false) as Phaser.Physics.Arcade.Sprite | null;
    if (!nuke) return;

    nuke.setPosition(x, y);
    nuke.setActive(true);
    nuke.setVisible(true);
    nuke.body!.enable = true;
    nuke.setTint(tint);

    nuke.setRotation(angle + SPRITE_UP_OFFSET);
    (nuke.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * TIER3_SPEED,
      Math.sin(angle) * TIER3_SPEED
    );
  }

  update(): void {
    this.group.getChildren().forEach((obj) => {
      const nuke = obj as Phaser.Physics.Arcade.Sprite;
      if (nuke.active && (nuke.x > GAME_WIDTH + 40 || nuke.x < -40 || nuke.y < -40 || nuke.y > 10000)) {
        this.detonate(nuke);
      }
    });
  }

  /** Triggers the AoE callback at the nuke's current position, then recycles it. */
  detonate(nuke: Phaser.Physics.Arcade.Sprite): void {
    this.onDetonate?.(nuke.x, nuke.y);
    this.deactivate(nuke);
  }

  deactivate(nuke: Phaser.Physics.Arcade.Sprite): void {
    nuke.setActive(false);
    nuke.setVisible(false);
    nuke.body!.enable = false;
  }

  reset(): void {
    this.group.getChildren().forEach((obj) => this.deactivate(obj as Phaser.Physics.Arcade.Sprite));
  }
}
