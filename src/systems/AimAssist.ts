import Phaser from 'phaser';
import { LOCK_CONE_DEG, LOCK_RADIUS } from '../config/constants';

type Lockable = Phaser.Physics.Arcade.Sprite;

export class AimAssist {
  private lockRing: Phaser.GameObjects.Image;
  current: Lockable | null = null;

  constructor(scene: Phaser.Scene) {
    this.lockRing = scene.add.image(0, 0, 'lockring');
    this.lockRing.setVisible(false);
    this.lockRing.setDepth(10);
    this.lockRing.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Finds the nearest active target within LOCK_RADIUS and a forward-facing cone. `extra` lets a boss be considered too. */
  findLock(originX: number, originY: number, targets: Phaser.Physics.Arcade.Group, extra: Lockable | null = null): Lockable | null {
    let best: Lockable | null = null;
    let bestDist = LOCK_RADIUS;

    const consider = (t: Lockable) => {
      if (!t.active) return;

      const dx = t.x - originX;
      const dy = t.y - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > LOCK_RADIUS) return;

      const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
      if (Math.abs(angle) > LOCK_CONE_DEG) return;

      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    };

    targets.getChildren().forEach((obj) => consider(obj as Lockable));
    if (extra) consider(extra);

    this.current = best;
    return best;
  }

  updateIndicator(): void {
    if (this.current && this.current.active) {
      this.lockRing.setPosition(this.current.x, this.current.y);
      this.lockRing.setVisible(true);
      this.lockRing.setScale(0.9 + Math.sin(performance.now() / 120) * 0.06);
    } else {
      this.lockRing.setVisible(false);
    }
  }

  destroy(): void {
    this.lockRing.destroy();
  }
}
