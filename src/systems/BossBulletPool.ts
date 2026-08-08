import Phaser from 'phaser';
import { BOSS_BULLET_SPEED, GAME_WIDTH } from '../config/constants';

const POOL_SIZE = 24;
const SPRITE_UP_OFFSET = Math.PI / 2;
const SPREAD_DEG = 12;

/** Boss projectiles: aimed fan-shots at the player's current position. */
export class BossBulletPool {
  group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = this.group.create(0, 0, 'laser1') as Phaser.Physics.Arcade.Sprite;
      bullet.setTint(0xff4d4d);
      bullet.setScale(1.2);
      bullet.setActive(false);
      bullet.setVisible(false);
      bullet.body!.enable = false;
    }
  }

  fire(x: number, y: number, targetX: number, targetY: number, count: number): void {
    const baseAngle = Math.atan2(targetY - y, targetX - x);

    for (let i = 0; i < count; i++) {
      const angle = count > 1 ? baseAngle + Phaser.Math.DegToRad((i - (count - 1) / 2) * SPREAD_DEG) : baseAngle;
      this.spawnOne(x, y, angle);
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
      Math.cos(angle) * BOSS_BULLET_SPEED,
      Math.sin(angle) * BOSS_BULLET_SPEED
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
