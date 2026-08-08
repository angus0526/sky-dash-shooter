import Phaser from 'phaser';

export class Target extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'target');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.4);
    const r = this.width * 0.42;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);

    this.setActive(false);
    this.setVisible(false);
  }

  spawnAt(x: number, y: number, vx: number): void {
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.body!.enable = true;
    this.setVelocity(vx, 0);
    this.setAngularVelocity(Phaser.Math.Between(-25, 25));
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body!.enable = false;
    this.setAngularVelocity(0);
  }
}
