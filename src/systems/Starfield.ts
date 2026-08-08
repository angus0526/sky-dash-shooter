import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';

const FAR_SCROLL_FACTOR = 0.12;
const NEAR_SCROLL_FACTOR = 0.28;

/** Two-layer parallax starfield, scrolling proportionally to the current gameplay scroll speed. */
export class Starfield {
  private far: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene) {
    scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0f1a).setDepth(-3);

    this.far = scene.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'starfield_far');
    this.far.setDepth(-2);

    this.near = scene.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'starfield_near');
    this.near.setDepth(-1);
  }

  update(scrollSpeed: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.far.tilePositionX += scrollSpeed * FAR_SCROLL_FACTOR * dt;
    this.near.tilePositionX += scrollSpeed * NEAR_SCROLL_FACTOR * dt;
  }
}
