import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GAME_HEIGHT, GAME_WIDTH } from './config/constants';
import { migrateLegacyProgress } from './systems/PlayerProfile';
import { initProfileOverlay } from './ui/ProfileOverlay';
import { initRoomOverlay } from './ui/RoomOverlay';

migrateLegacyProgress();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0f1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  // Phaser only tracks 2 pointers by default (mouse + 1 touch). Without this, holding
  // the FIRE button consumes the only touch pointer and a second finger on the joystick
  // is silently ignored — direction becomes uncontrollable while firing.
  input: {
    activePointers: 3
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

const bootReady = new Promise<void>((resolve) => {
  game.events.once('boot-ready', resolve);
});

Promise.all([initProfileOverlay(game).then(() => initRoomOverlay(game)), bootReady]).then(([session]) => {
  game.scene.start('GameScene', { session });
});

const rotateOverlay = document.getElementById('rotate-overlay')!;

function checkOrientation(): void {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
  rotateOverlay.classList.toggle('visible', isPortrait && isSmallScreen);
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();
