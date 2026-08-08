import Phaser from 'phaser';

/** Manages the single active background music track, swapping between normal/boss/game-over cues. */
export class Music {
  private scene: Phaser.Scene;
  private current: Phaser.Sound.BaseSound | null = null;
  private currentKey: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  play(key: string, loop = true, volume = 0.35): void {
    if (this.currentKey === key && this.current?.isPlaying) return;

    this.current?.stop();
    this.current = this.scene.sound.add(key, { loop, volume });
    this.current.play();
    this.currentKey = key;
  }

  stop(): void {
    this.current?.stop();
    this.currentKey = null;
  }
}
