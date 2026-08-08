import Phaser from 'phaser';
import { GAME_WIDTH, TIER2_BODY_SIZE, TIER2_SPEED, WEAPON_SPREAD_SPACING } from '../config/constants';

const POOL_SIZE = 44;
const SPRITE_UP_OFFSET = Math.PI / 2;

/** Laser weapon: thicker beam that pierces through multiple targets in one shot. */
export class LaserPool {
  group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const laser = this.group.create(0, 0, 'laser2') as Phaser.Physics.Arcade.Sprite;
      laser.setScale(1.7);
      (laser.body as Phaser.Physics.Arcade.Body).setSize(TIER2_BODY_SIZE, TIER2_BODY_SIZE * 2.2, true);
      laser.setActive(false);
      laser.setVisible(false);
      laser.body!.enable = false;
    }
  }

  /** Fires `count` parallel piercing beams from (x, y) toward (targetX, targetY), or straight right if no target. */
  fireSpread(count: number, x: number, y: number, targetX: number | null, targetY: number | null): void {
    let angle = 0;
    if (targetX !== null && targetY !== null) {
      angle = Math.atan2(targetY - y, targetX - x);
    }
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * WEAPON_SPREAD_SPACING;
      this.spawnOne(x + perpX * offset, y + perpY * offset, angle);
    }
  }

  private spawnOne(x: number, y: number, angle: number): void {
    const laser = this.group.getFirstDead(false) as Phaser.Physics.Arcade.Sprite | null;
    if (!laser) return;

    laser.setPosition(x, y);
    laser.setActive(true);
    laser.setVisible(true);
    laser.body!.enable = true;

    laser.setRotation(angle + SPRITE_UP_OFFSET);
    (laser.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * TIER2_SPEED,
      Math.sin(angle) * TIER2_SPEED
    );
  }

  update(): void {
    this.group.getChildren().forEach((obj) => {
      const laser = obj as Phaser.Physics.Arcade.Sprite;
      if (laser.active && (laser.x > GAME_WIDTH + 40 || laser.x < -40 || laser.y < -40 || laser.y > 10000)) {
        this.deactivate(laser);
      }
    });
  }

  deactivate(laser: Phaser.Physics.Arcade.Sprite): void {
    laser.setActive(false);
    laser.setVisible(false);
    laser.body!.enable = false;
  }

  reset(): void {
    this.group.getChildren().forEach((obj) => this.deactivate(obj as Phaser.Physics.Arcade.Sprite));
  }
}
