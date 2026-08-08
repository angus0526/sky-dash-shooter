import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  JOYSTICK_DEAD_ZONE,
  JOYSTICK_POSITION_STORAGE_KEY,
  JOYSTICK_RADIUS,
  JOYSTICK_REPOSITION_HOLD_MS,
  JOYSTICK_REPOSITION_MOVE_TOLERANCE
} from '../config/constants';
import { InputState } from './InputState';

function loadSavedPosition(fallbackX: number, fallbackY: number): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(JOYSTICK_POSITION_STORAGE_KEY);
    if (!raw) return { x: fallbackX, y: fallbackY };
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return { x: parsed.x, y: parsed.y };
  } catch {
    // ignore corrupt storage
  }
  return { x: fallbackX, y: fallbackY };
}

export class VirtualJoystick {
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private hitZone: Phaser.GameObjects.Zone;
  private originX: number;
  private originY: number;
  private pointerId: number | null = null;
  private downX = 0;
  private downY = 0;
  private repositioning = false;
  private repositionTimer: Phaser.Time.TimerEvent | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(private scene: Phaser.Scene, defaultX: number, defaultY: number) {
    const saved = loadSavedPosition(defaultX, defaultY);
    this.originX = saved.x;
    this.originY = saved.y;

    this.base = scene.add.circle(this.originX, this.originY, JOYSTICK_RADIUS, 0xffffff, 0.12);
    this.base.setStrokeStyle(2, 0xffffff, 0.35);
    this.base.setScrollFactor(0);
    this.base.setDepth(20);

    this.thumb = scene.add.circle(this.originX, this.originY, JOYSTICK_RADIUS * 0.5, 0xffffff, 0.35);
    this.thumb.setScrollFactor(0);
    this.thumb.setDepth(21);

    this.hitZone = scene.add.zone(this.originX, this.originY, JOYSTICK_RADIUS * 2.6, JOYSTICK_RADIUS * 2.6);
    this.hitZone.setScrollFactor(0);
    this.hitZone.setInteractive();

    this.hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerId = p.id;
      this.downX = p.x;
      this.downY = p.y;
      this.repositioning = false;
      this.repositionTimer = scene.time.delayedCall(JOYSTICK_REPOSITION_HOLD_MS, () => this.enterRepositionMode());
      this.updateFromPointer(p);
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;

      if (this.repositioning) {
        this.moveOriginTo(p.x, p.y);
        return;
      }

      const moved = Math.hypot(p.x - this.downX, p.y - this.downY);
      if (moved > JOYSTICK_REPOSITION_MOVE_TOLERANCE) this.cancelRepositionTimer();

      this.updateFromPointer(p);
    });

    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId) this.release();
    });
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId) this.release();
    });
  }

  private updateFromPointer(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.originX;
    const dy = p.y - this.originY;
    const dist = Math.min(JOYSTICK_RADIUS, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);

    const clampedX = Math.cos(angle) * dist;
    const clampedY = Math.sin(angle) * dist;
    this.thumb.setPosition(this.originX + clampedX, this.originY + clampedY);

    if (dist < JOYSTICK_DEAD_ZONE) {
      InputState.moveX = 0;
      InputState.moveY = 0;
    } else {
      InputState.moveX = clampedX / JOYSTICK_RADIUS;
      InputState.moveY = clampedY / JOYSTICK_RADIUS;
    }
  }

  private enterRepositionMode(): void {
    if (this.pointerId === null) return;
    this.repositioning = true;
    InputState.moveX = 0;
    InputState.moveY = 0;
    this.thumb.setPosition(this.originX, this.originY);

    this.pulseTween = this.scene.tweens.add({
      targets: [this.base, this.thumb],
      alpha: { from: 1, to: 0.4 },
      duration: 260,
      yoyo: true,
      repeat: -1
    });
  }

  private moveOriginTo(x: number, y: number): void {
    const margin = JOYSTICK_RADIUS + 10;
    this.originX = Phaser.Math.Clamp(x, margin, GAME_WIDTH - margin);
    this.originY = Phaser.Math.Clamp(y, margin, GAME_HEIGHT - margin);

    this.base.setPosition(this.originX, this.originY);
    this.thumb.setPosition(this.originX, this.originY);
    this.hitZone.setPosition(this.originX, this.originY);
  }

  private cancelRepositionTimer(): void {
    this.repositionTimer?.remove();
    this.repositionTimer = null;
  }

  private release(): void {
    this.cancelRepositionTimer();

    if (this.repositioning) {
      this.repositioning = false;
      this.pulseTween?.remove();
      this.pulseTween = null;
      this.base.setAlpha(1);
      this.thumb.setAlpha(1);
      try {
        localStorage.setItem(JOYSTICK_POSITION_STORAGE_KEY, JSON.stringify({ x: this.originX, y: this.originY }));
      } catch {
        // ignore storage failures (private browsing etc.)
      }
    }

    this.pointerId = null;
    this.thumb.setPosition(this.originX, this.originY);
    InputState.moveX = 0;
    InputState.moveY = 0;
  }
}
