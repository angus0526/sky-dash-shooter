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

// Weapon levels are uncapped now, so a sustained high-level burst needs a lot more headroom
// than the old fixed-10 cap ever required.
const POOL_SIZE = 140;
const SPRITE_UP_OFFSET = Math.PI / 2;
const EDGE_MARGIN = 4;

/** Ricochet weapon: a thick beam that pierces every Target it passes through and bounces off the top/bottom AND right screen edges up to a bounce limit. */
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
      this.spawnOne(x + perpX * offset, y + perpY * offset, angle, count);
    }
  }

  private spawnOne(x: number, y: number, angle: number, level: number): void {
    const bullet = this.group.getFirstDead(false) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;

    // A pooled bullet reused mid-impact-pulse from its previous life would otherwise carry a
    // stale tween that fights this new shot's scale.
    this.scene.tweens.killTweensOf(bullet);
    bullet.setPosition(x, y);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body!.enable = true;
    bullet.setData('bounces', 0);
    bullet.setData('bornAt', this.scene.time.now);
    bullet.setData('level', level);
    bullet.setScale(1.6);

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

      const body = bullet.body as Phaser.Physics.Arcade.Body;
      let bounced = false;

      // Top/bottom edges bounce. A near-horizontal aim (the common case — most targets sit
      // roughly in front of the player) drifts toward these so shallowly that the beam used
      // to reach the right edge and despawn long before ever getting here, so in practice most
      // shots never bounced at all.
      if (bullet.y <= EDGE_MARGIN || bullet.y >= GAME_HEIGHT - EDGE_MARGIN) {
        body.setVelocityY(-body.velocity.y);
        bullet.y = Phaser.Math.Clamp(bullet.y, EDGE_MARGIN, GAME_HEIGHT - EDGE_MARGIN);
        bounced = true;
      }

      // The right edge bounces too (instead of despawning), so every single shot — regardless
      // of aim angle — visibly bounces at least once, well inside the camera view, instead of
      // the bounce being a rare event only steep-angle shots ever triggered.
      if (bullet.x >= GAME_WIDTH - EDGE_MARGIN) {
        body.setVelocityX(-Math.abs(body.velocity.x));
        bullet.x = GAME_WIDTH - EDGE_MARGIN;
        bounced = true;
      }

      if (bounced) {
        const bounces = (bullet.getData('bounces') as number) ?? 0;
        if (bounces >= RICOCHET_MAX_BOUNCES) {
          this.deactivate(bullet);
          return;
        }
        bullet.setRotation(Math.atan2(body.velocity.y, body.velocity.x) + SPRITE_UP_OFFSET);
        bullet.setData('bounces', bounces + 1);
        this.pulseImpact(bullet);
        return;
      }

      if (bullet.x < -40) this.deactivate(bullet);
    });
  }

  /** A quick scale/alpha pop on each bounce so the direction change actually reads as an impact, not just a beam quietly turning around. */
  private pulseImpact(bullet: Phaser.Physics.Arcade.Sprite): void {
    bullet.setScale(2.2);
    this.scene.tweens.add({
      targets: bullet,
      scale: 1.6,
      duration: 160,
      ease: 'Cubic.Out'
    });
  }

  deactivate(bullet: Phaser.Physics.Arcade.Sprite): void {
    this.scene.tweens.killTweensOf(bullet);
    bullet.setActive(false);
    bullet.setVisible(false);
    bullet.body!.enable = false;
  }

  reset(): void {
    this.group.getChildren().forEach((obj) => this.deactivate(obj as Phaser.Physics.Arcade.Sprite));
  }
}
