import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HOMING_SEEK_RADIUS, HOMING_SPEED, HOMING_TURN_RATE_DEG } from '../config/constants';

const POOL_SIZE = 30;
const SPRITE_UP_OFFSET = Math.PI / 2;

// Missiles launch fanned out front/back/up/down (and diagonals) instead of all straight
// ahead, then steer onto their locked target — real heat-seeker behavior, and matches the
// "front/back/up/down" firing the plane was designed to show off.
const LAUNCH_DIRECTIONS_DEG = [0, -90, 90, 180, -45, 45, -135, 135];

type Lockable = Phaser.Physics.Arcade.Sprite;

/** Homing weapon: fans out in multiple directions at launch, each missile prefers a distinct nearby target (no cone restriction), and steers toward it in flight. */
export class HomingPool {
  group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      maxSize: POOL_SIZE,
      runChildUpdate: false
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const missile = this.group.create(0, 0, 'nuke') as Phaser.Physics.Arcade.Sprite;
      missile.setTint(0xb388ff);
      missile.setScale(0.8);
      missile.setActive(false);
      missile.setVisible(false);
      missile.body!.enable = false;
    }
  }

  fireSpread(count: number, x: number, y: number, targets: Phaser.Physics.Arcade.Group, extra: Lockable | null): void {
    const used = new Set<Lockable>();

    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.DegToRad(LAUNCH_DIRECTIONS_DEG[i % LAUNCH_DIRECTIONS_DEG.length]);
      const spawnX = x + Math.cos(angle) * 14;
      const spawnY = y + Math.sin(angle) * 14;
      const target = this.findNearest(spawnX, spawnY, targets, extra, used);
      if (target) used.add(target);
      this.spawnOne(spawnX, spawnY, target, angle);
    }
  }

  /** Prefers a target not already claimed by an earlier missile in this volley; falls back to reusing the nearest claimed one if every target in range is taken. */
  private findNearest(x: number, y: number, targets: Phaser.Physics.Arcade.Group, extra: Lockable | null, exclude: Set<Lockable>): Lockable | null {
    let best: Lockable | null = null;
    let bestDist = HOMING_SEEK_RADIUS;
    let fallback: Lockable | null = null;
    let fallbackDist = HOMING_SEEK_RADIUS;

    targets.getChildren().forEach((obj) => {
      const t = obj as Lockable;
      if (!t.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, t.x, t.y);
      if (exclude.has(t)) {
        if (dist < fallbackDist) {
          fallbackDist = dist;
          fallback = t;
        }
        return;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    });

    if (extra && extra.active) {
      const dist = Phaser.Math.Distance.Between(x, y, extra.x, extra.y);
      if (exclude.has(extra)) {
        if (dist < fallbackDist) {
          fallbackDist = dist;
          fallback = extra;
        }
      } else if (dist < bestDist) {
        best = extra;
      }
    }

    return best ?? fallback;
  }

  private spawnOne(x: number, y: number, target: Lockable | null, launchAngle: number): void {
    const missile = this.group.getFirstDead(false) as Phaser.Physics.Arcade.Sprite | null;
    if (!missile) return;

    missile.setPosition(x, y);
    missile.setActive(true);
    missile.setVisible(true);
    missile.body!.enable = true;
    missile.setData('target', target);

    missile.setRotation(launchAngle + SPRITE_UP_OFFSET);
    (missile.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(launchAngle) * HOMING_SPEED, Math.sin(launchAngle) * HOMING_SPEED);
  }

  update(deltaMs: number): void {
    const maxTurn = Phaser.Math.DegToRad(HOMING_TURN_RATE_DEG) * (deltaMs / 1000);

    this.group.getChildren().forEach((obj) => {
      const missile = obj as Phaser.Physics.Arcade.Sprite;
      if (!missile.active) return;

      const target = missile.getData('target') as Lockable | undefined;
      const body = missile.body as Phaser.Physics.Arcade.Body;

      if (target && target.active) {
        const desiredAngle = Math.atan2(target.y - missile.y, target.x - missile.x);
        const currentAngle = Math.atan2(body.velocity.y, body.velocity.x);
        const newAngle = Phaser.Math.Angle.RotateTo(currentAngle, desiredAngle, maxTurn);
        body.setVelocity(Math.cos(newAngle) * HOMING_SPEED, Math.sin(newAngle) * HOMING_SPEED);
        missile.setRotation(newAngle + SPRITE_UP_OFFSET);
      }

      if (missile.x > GAME_WIDTH + 40 || missile.x < -40 || missile.y < -40 || missile.y > GAME_HEIGHT + 40) {
        this.deactivate(missile);
      }
    });
  }

  deactivate(missile: Phaser.Physics.Arcade.Sprite): void {
    missile.setActive(false);
    missile.setVisible(false);
    missile.body!.enable = false;
    missile.setData('target', null);
  }

  reset(): void {
    this.group.getChildren().forEach((obj) => this.deactivate(obj as Phaser.Physics.Arcade.Sprite));
  }
}
