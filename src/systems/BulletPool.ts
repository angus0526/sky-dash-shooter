import Phaser from 'phaser';
import { GAME_WIDTH, TIER1_SPEED, WEAPON_SPREAD_SPACING } from '../config/constants';

const POOL_SIZE = 44;

// The laser art points "up" by default, so a 90deg offset aligns it with travel direction.
const SPRITE_UP_OFFSET = Math.PI / 2;

export class BulletPool {
  group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = this.group.create(0, 0, 'laser1') as Phaser.Physics.Arcade.Sprite;
      bullet.setActive(false);
      bullet.setVisible(false);
      bullet.body!.enable = false;
    }
  }

  /** Fires `count` parallel bullets from (x, y) toward (targetX, targetY), or straight right if no target. */
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
    const bullet = this.group.getFirstDead(false) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;

    bullet.setPosition(x, y);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body!.enable = true;

    bullet.setRotation(angle + SPRITE_UP_OFFSET);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * TIER1_SPEED,
      Math.sin(angle) * TIER1_SPEED
    );
  }

  update(): void {
    this.group.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && (bullet.x > GAME_WIDTH + 40 || bullet.x < -40 || bullet.y < -40 || bullet.y > 10000)) {
        this.deactivate(bullet);
      }
    });
  }

  deactivate(bullet: Phaser.Physics.Arcade.Sprite): void {
    bullet.setActive(false);
    bullet.setVisible(false);
    bullet.body!.enable = false;
  }

  reset(): void {
    this.group.getChildren().forEach((obj) => this.deactivate(obj as Phaser.Physics.Arcade.Sprite));
  }
}
