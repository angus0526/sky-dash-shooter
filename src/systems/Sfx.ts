import Phaser from 'phaser';

/** Centralizes sound playback so volumes can be tuned in one place. */
export class Sfx {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private play(key: string, volume: number): void {
    this.scene.sound.play(key, { volume });
  }

  shoot(): void {
    this.play('sfx_shoot', 0.35);
  }

  laser(): void {
    this.play('sfx_laser2', 0.3);
  }

  nuke(): void {
    this.play('sfx_nuke', 0.6);
  }

  hit(): void {
    this.play('sfx_hit', 0.3);
  }

  damage(): void {
    this.play('sfx_damage', 0.5);
  }

  pickup(): void {
    this.play('sfx_pickup', 0.5);
  }

  gameOver(): void {
    this.play('sfx_gameover', 0.6);
  }
}
