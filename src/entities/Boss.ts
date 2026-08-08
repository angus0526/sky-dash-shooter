import Phaser from 'phaser';
import {
  BOSS_CHARGE_DISTANCE,
  BOSS_CHARGE_HOLD_MS,
  BOSS_CHARGE_INTERVAL_MS,
  BOSS_CHARGE_OUT_MS,
  BOSS_ENTRY_X_RATIO,
  BOSS_MAX_HEALTH_BASE,
  GAME_HEIGHT,
  GAME_WIDTH
} from '../config/constants';

const BAR_WIDTH = 140;
const BAR_HEIGHT = 10;

export class Boss extends Phaser.Physics.Arcade.Sprite {
  maxHealth = BOSS_MAX_HEALTH_BASE;
  health = BOSS_MAX_HEALTH_BASE;

  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private entryTween: Phaser.Tweens.Tween | null = null;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private chargeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, GAME_WIDTH + 140, GAME_HEIGHT / 2, 'boss');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(2.2);
    // Purple stands apart from the red/pink used everywhere else for danger (boss bullets,
    // damage flash, hearts) — a light-pink tint here made the boss blend into that same
    // color family and read as "just more bullets" during fast play.
    this.setTint(0x9b5cff);
    this.setDepth(5);
    const r = this.width * 0.32;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);

    this.hpBarBg = scene.add.rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(6);
    this.hpBarFill = scene.add.rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT, 0xff5470, 1).setOrigin(0, 0.5).setDepth(7);

    this.setActive(false);
    this.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
  }

  spawn(maxHealth: number): void {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.setPosition(GAME_WIDTH + 140, GAME_HEIGHT / 2);
    this.setActive(true);
    this.setVisible(true);
    this.body!.enable = true;
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.updateHealthBar();

    this.entryTween?.remove();
    this.bobTween?.remove();
    this.chargeTween?.remove();

    const entryX = GAME_WIDTH * BOSS_ENTRY_X_RATIO;
    this.entryTween = this.scene.tweens.add({
      targets: this,
      x: entryX,
      duration: 1500,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.startBobbing();
        this.startCharging(entryX);
      }
    });
  }

  private startBobbing(): void {
    const baseY = this.y;
    this.bobTween = this.scene.tweens.add({
      targets: this,
      y: { from: baseY - 60, to: baseY + 60 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  /** Periodically lunges toward the player and back, on top of the vertical bob, so the boss attacks along a second axis. */
  private startCharging(baseX: number): void {
    const repeatDelay = Math.max(0, BOSS_CHARGE_INTERVAL_MS - (BOSS_CHARGE_OUT_MS * 2 + BOSS_CHARGE_HOLD_MS));
    this.chargeTween = this.scene.tweens.add({
      targets: this,
      x: baseX - BOSS_CHARGE_DISTANCE,
      duration: BOSS_CHARGE_OUT_MS,
      ease: 'Quad.easeIn',
      yoyo: true,
      hold: BOSS_CHARGE_HOLD_MS,
      repeatDelay,
      repeat: -1
    });
  }

  update(): void {
    if (!this.active) return;
    const barY = this.y - this.displayHeight / 2 - 18;
    const leftX = this.x - BAR_WIDTH / 2;
    this.hpBarBg.setPosition(leftX, barY);
    this.hpBarFill.setPosition(leftX, barY);
  }

  private updateHealthBar(): void {
    this.hpBarFill.scaleX = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1);
  }

  /** Returns true if this hit defeated the boss. */
  takeDamage(amount: number): boolean {
    if (!this.active) return false;
    this.health = Math.max(0, this.health - amount);
    this.updateHealthBar();
    return this.health <= 0;
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body!.enable = false;
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.entryTween?.remove();
    this.bobTween?.remove();
    this.chargeTween?.remove();
    this.entryTween = null;
    this.bobTween = null;
    this.chargeTween = null;
  }
}
