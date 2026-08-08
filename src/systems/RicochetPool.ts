import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  RICOCHET_BODY_SIZE,
  RICOCHET_MAX_BOUNCES,
  RICOCHET_MAX_LIFETIME_MS,
  RICOCHET_SPEED,
  WEAPON_SPREAD_SPACING
} from '../config/constants';

// Piercing beams can loiter far longer than the old "dies on first hit" bullet did, so a
// sustained level-10 burst needs a lot more headroom than 30 to avoid silently dropping shots.
const POOL_SIZE = 64;
const SPRITE_UP_OFFSET = Math.PI / 2;
const EDGE_MARGIN = 4;

/** Ricochet weapon: a thick beam that pierces every Target it passes through and bounces off the top/bottom screen edges up to a bounce limit. */
export class RicochetPool {
  group: Phaser.Physics.Arcade.Group;

  constructor(private scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = this.group.create(0, 0, 'laser2') as Phaser.Physics.Arcade.Sprite;
      bullet.setTint(0xffb703);
      bullet.setScale(1.6);
      (bullet.body as Phaser.Physics.Arcade.Body).setSize(RICOCHET_BODY_SIZE, RICOCHET_BODY_SIZE * 2.2, true);
      bullet.setActive(false);
      bullet.setVisible(false);
      bullet.body!.enable = false;
    }
  }

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
    bullet.setData('bounces', 0);
    bullet.setData('bornAt', this.scene.time.now);

    bullet.setRotation(angle + SPRITE_UP_OFFSET);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * RICOCHET_SPEED,
      Math.sin(angle) * RICOCHET_SPEED
    );
  }

  update(): void {
    const now = this.scene.time.now;

    this.group.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return;

      const bornAt = (bullet.getData('bornAt') as number) ?? now;
      if (now - bornAt > RICOCHET_MAX_LIFETIME_MS) {
        this.deactivate(bullet);
        return;
      }

      if (bullet.y <= EDGE_MARGIN || bullet.y >= GAME_HEIGHT - EDGE_MARGIN) {
        const bounces = (bullet.getData('bounces') as number) ?? 0;
        if (bounces >= RICOCHET_MAX_BOUNCES) {
          this.deactivate(bullet);
          return;
        }
        const body = bullet.body as Phaser.Physics.Arcade.Body;
        body.setVelocityY(-body.velocity.y);
        bullet.setRotation(Math.atan2(body.velocity.y, body.velocity.x) + SPRITE_UP_OFFSET);
        bullet.setData('bounces', bounces + 1);
        bullet.y = Phaser.Math.Clamp(bullet.y, EDGE_MARGIN, GAME_HEIGHT - EDGE_MARGIN);
        return;
      }

      if (bullet.x > GAME_WIDTH + 40 || bullet.x < -40) this.deactivate(bullet);
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
