import Phaser from 'phaser';

export type PickupType = 'bullet' | 'laser' | 'nuke' | 'shield' | 'heart';

const TEXTURE_BY_TYPE: Record<PickupType, string> = {
  bullet: 'pickup_bullet',
  laser: 'pickup_laser',
  nuke: 'pickup_nuke',
  shield: 'pickup_shield',
  heart: 'pickup_heart'
};

export class Pickup extends Phaser.Physics.Arcade.Sprite {
  pickupType: PickupType = 'bullet';

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, TEXTURE_BY_TYPE.bullet);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false);
    this.setVisible(false);
  }

  spawnAt(x: number, y: number, vx: number, type: PickupType): void {
    this.pickupType = type;
    this.setTexture(TEXTURE_BY_TYPE[type]);

    const r = this.width * 0.42;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);

    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.body!.enable = true;
    this.setVelocity(vx, 0);
    this.setAngularVelocity(90);

    this.scene.tweens.add({
      targets: this,
      scale: { from: 0.85, to: 1.1 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body!.enable = false;
    this.setAngularVelocity(0);
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
  }
}
