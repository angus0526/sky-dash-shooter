import Phaser from 'phaser';

/** Shared visual effect for target kills (small) and nuke detonations (big + shockwave + shake). */
export class Explosion {
  private scene: Phaser.Scene;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.emitter = scene.add.particles(0, 0, 'explosion_particle', {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.65, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 250, max: 500 },
      tint: [0xffb703, 0xff5470, 0xfff275],
      emitting: false
    });
    this.emitter.setDepth(15);
  }

  playSmall(x: number, y: number): void {
    this.emitter.explode(10, x, y);
  }

  playBig(x: number, y: number, radius: number): void {
    this.emitter.explode(30, x, y);
    this.drawShockwave(x, y, radius);
    this.scene.cameras.main.shake(220, 0.008);
  }

  private drawShockwave(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, 8, 0xffffff, 0);
    ring.setStrokeStyle(4, 0xfff275, 0.9);
    ring.setDepth(16);

    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });
  }
}
