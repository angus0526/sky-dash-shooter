import Phaser from 'phaser';

/**
 * GameScene registers WASD/arrow-key/space captures via addKey()/createCursorKeys(), and
 * Phaser's preventDefault() on those keys blocks the browser from typing them into ANY
 * focused page input (not just the canvas) — silently eating "w/a/s/d"/space/arrow
 * characters and arrow-key caret movement while an HTML overlay is up asking for text.
 * GameScene.create() runs asynchronously (assets are still loading in BootScene when an
 * overlay first shows) and re-flips `preventDefault` back to true the moment it runs, so a
 * one-off assignment loses the race — reassert every frame instead. Returns a release
 * function to call once the overlay needing text input closes.
 */
export function suppressGameKeyCapture(game: Phaser.Game): () => void {
  const keyboardManager = game.input.keyboard;
  const reassert = () => {
    if (keyboardManager) keyboardManager.preventDefault = false;
  };
  reassert();
  game.events.on(Phaser.Core.Events.STEP, reassert);

  return () => {
    game.events.off(Phaser.Core.Events.STEP, reassert);
    if (keyboardManager) keyboardManager.preventDefault = true;
  };
}
