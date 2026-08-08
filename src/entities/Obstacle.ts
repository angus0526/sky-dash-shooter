import Phaser from 'phaser';

export class Obstacle extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'obstacle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false);
    this.setVisible(false);
  }

  spawnAt(x: number, y: number, vx: number, big: boolean): void {
    this.setTexture(big ? 'obstacle_big' : 'obstacle');
    this.setScale(big ? 0.55 : 0.85);

    const r = this.width * 0.4;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);

    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    body.enable = true;
    this.setVelocity(vx, 0);
    this.setAngularVelocity(Phaser.Math.Between(-40, 40));
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body!.enable = false;
    this.setAngularVelocity(0);
  }
}
