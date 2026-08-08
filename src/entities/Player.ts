import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_INVULN_MS,
  PLAYER_MAX_HEALTH,
  PLAYER_SPEED,
  PLAYER_START_X,
  PLAYER_START_Y,
  SHIELD_MAX_CHARGES
} from '../config/constants';

// The ship art points "up" (nose at the top); the game faces right, so every
// displayed angle is offset by 90deg from the raw movement/tilt math below.
const FACING_OFFSET_DEG = 90;

const SHIELD_TEXTURE_BY_CHARGE: Record<number, string> = {
  1: 'shield_ring1',
  2: 'shield_ring2',
  3: 'shield_ring3'
};

export type DamageResult = 'shield' | 'health' | 'none';

export class Player extends Phaser.Physics.Arcade.Sprite {
  health = PLAYER_MAX_HEALTH;
  shieldCharges = 0;
  private invulnUntil = 0;
  private shieldVisual: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene, PLAYER_START_X, PLAYER_START_Y, 'ship');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.45);
    this.setAngle(FACING_OFFSET_DEG);
    this.setCollideWorldBounds(true);
    this.setDamping(false);
    (this.body as Phaser.Physics.Arcade.Body).setSize(this.width * 0.6, this.height * 0.55, true);

    this.shieldVisual = scene.add.image(this.x, this.y, 'shield_ring1');
    this.shieldVisual.setVisible(false);
    // `this.depth - 1` (both default to 0) put the ring at depth -1 — behind the opaque
    // full-screen background rectangle (depth 0), so it never actually rendered.
    this.shieldVisual.setDepth(2);
    this.shieldVisual.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Swaps the ship sprite (used when switching planes from the pause menu) and recomputes its hitbox. */
  setPlane(shipTexture: string): void {
    this.setTexture(shipTexture);
    (this.body as Phaser.Physics.Arcade.Body).setSize(this.width * 0.6, this.height * 0.55, true);
  }

  setMoveVector(dx: number, dy: number): void {
    this.setVelocity(dx * PLAYER_SPEED, dy * PLAYER_SPEED);

    const tilt = Phaser.Math.Clamp(dy * 22, -24, 24);
    const targetAngle = FACING_OFFSET_DEG + tilt;
    this.setAngle(Phaser.Math.Linear(this.angle, targetAngle, 0.2));
  }

  clampToBounds(): void {
    const halfW = this.displayWidth / 2;
    const halfH = this.displayHeight / 2;
    this.x = Phaser.Math.Clamp(this.x, halfW, GAME_WIDTH - halfW);
    this.y = Phaser.Math.Clamp(this.y, halfH, GAME_HEIGHT - halfH);
  }

  /** Keeps the shield ring glued to the ship; call once per frame. */
  syncShieldVisual(): void {
    this.shieldVisual.setPosition(this.x, this.y);
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }

  addShield(): boolean {
    if (this.shieldCharges >= SHIELD_MAX_CHARGES) return false;
    this.shieldCharges++;
    this.refreshShieldVisual();
    return true;
  }

  heal(): boolean {
    if (this.health >= PLAYER_MAX_HEALTH) return false;
    this.health++;
    return true;
  }

  takeDamage(): DamageResult {
    if (this.isInvulnerable) return 'none';

    this.invulnUntil = this.scene.time.now + PLAYER_INVULN_MS;

    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 80,
      yoyo: true,
      repeat: Math.floor(PLAYER_INVULN_MS / 160)
    });

    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.pulseShieldHit();
      this.refreshShieldVisual();
      return 'shield';
    }

    this.health -= 1;
    return 'health';
  }

  private refreshShieldVisual(): void {
    if (this.shieldCharges <= 0) {
      this.shieldVisual.setVisible(false);
      return;
    }
    this.shieldVisual.setTexture(SHIELD_TEXTURE_BY_CHARGE[this.shieldCharges] ?? 'shield_ring3');
    this.shieldVisual.setVisible(true);
  }

  private pulseShieldHit(): void {
    this.scene.tweens.add({
      targets: this.shieldVisual,
      scale: { from: 1.4, to: 1 },
      alpha: { from: 1, to: 0.7 },
      duration: 220,
      ease: 'Cubic.Out'
    });
  }

  reset(): void {
    this.health = PLAYER_MAX_HEALTH;
    this.shieldCharges = 0;
    this.invulnUntil = 0;
    this.alpha = 1;
    this.angle = FACING_OFFSET_DEG;
    this.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.setVelocity(0, 0);
    this.refreshShieldVisual();
  }
}
