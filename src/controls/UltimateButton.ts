import Phaser from 'phaser';
import { ULTIMATE_BUTTON_RADIUS } from '../config/constants';
import { EVENTS, GameEvents } from '../systems/GameEvents';

const READY_COLOR = 0xffe066;
const CHARGING_COLOR = 0x55586b;

/** Discrete tap button (not a hold-to-fire control) for the full-screen ultimate. Shows a countdown while charging and pulses when ready. */
export class UltimateButton {
  private circle: Phaser.GameObjects.Arc;
  private label: Phaser.GameObjects.Text;
  private ready = false;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.circle = scene.add.circle(x, y, ULTIMATE_BUTTON_RADIUS, CHARGING_COLOR, 0.55);
    this.circle.setStrokeStyle(2, READY_COLOR, 0.6);
    this.circle.setScrollFactor(0);
    this.circle.setDepth(20);
    this.circle.setInteractive({ useHandCursor: true });

    this.label = scene.add.text(x, y, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      align: 'center'
    });
    this.label.setOrigin(0.5);
    this.label.setScrollFactor(0);
    this.label.setDepth(21);

    this.circle.on('pointerdown', () => {
      if (!this.ready) return;
      GameEvents.emit(EVENTS.ULTIMATE_REQUESTED);
    });

    this.setState(0);
  }

  /** `readyInSec` <= 0 means the ultimate is available now. */
  setState(readyInSec: number): void {
    const ready = readyInSec <= 0;
    if (ready !== this.ready) {
      this.ready = ready;
      this.circle.setFillStyle(ready ? READY_COLOR : CHARGING_COLOR, ready ? 0.85 : 0.55);
      if (ready) {
        this.pulseTween = this.scene.tweens.add({
          targets: this.circle,
          scale: { from: 1, to: 1.12 },
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut'
        });
      } else {
        this.pulseTween?.remove();
        this.pulseTween = null;
        this.circle.setScale(1);
      }
    }
    this.label.setText(ready ? '💥\n必殺' : `${Math.ceil(readyInSec)}s`);
  }
}
