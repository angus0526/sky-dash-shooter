import Phaser from 'phaser';
import { SHOOT_BUTTON_RADIUS } from '../config/constants';
import { InputState } from './InputState';

export class ShootButton {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const circle = scene.add.circle(x, y, SHOOT_BUTTON_RADIUS, 0xff5470, 0.35);
    circle.setStrokeStyle(2, 0xff5470, 0.8);
    circle.setScrollFactor(0);
    circle.setDepth(20);
    circle.setInteractive();

    const label = scene.add.text(x, y, 'FIRE', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffffff'
    });
    label.setOrigin(0.5);
    label.setScrollFactor(0);
    label.setDepth(21);

    let pointerId: number | null = null;

    const release = () => {
      pointerId = null;
      InputState.firing = false;
      circle.setFillStyle(0xff5470, 0.35);
    };

    circle.on('pointerdown', (p: Phaser.Input.Pointer) => {
      pointerId = p.id;
      InputState.firing = true;
      circle.setFillStyle(0xff5470, 0.6);
    });

    // Listen globally (not just on the circle) so a touch that drifts off the
    // button before lifting still releases firing — relying only on the
    // circle's own pointerup/pointerout leaves InputState.firing stuck true.
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id === pointerId) release();
    });
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (p.id === pointerId) release();
    });
  }
}
