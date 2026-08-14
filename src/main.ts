import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GAME_HEIGHT, GAME_WIDTH } from './config/constants';
import { migrateLegacyProgress } from './systems/PlayerProfile';
import { initProfileOverlay } from './ui/ProfileOverlay';
import { initRoomOverlay } from './ui/RoomOverlay';

// The default auto-injected SW registration (registerType: 'autoUpdate' with the plugin's
// own injectRegister) only ever calls navigator.serviceWorker.register() — a new version
// activates itself in the background, but an already-open page keeps running its old
// in-memory JS indefinitely; nothing reloads it. That's rarely noticed in a plain browser
// tab (people naturally reload/reopen those often), but installed/standalone launches —
// a Chrome "Install app" PWA, or an iOS Shortcuts.app home-screen icon — can sit open for
// days, silently drifting out of sync with whatever a freshly-loaded peer is running. Two
// multiplayer peers on different code versions is exactly the kind of protocol mismatch
// that can wedge the game the instant they try to sync state. registerSW() from
// virtual:pwa-register reloads the page itself once a new service worker takes over.
registerSW({ immediate: true });

// Shown on the profile screen (the very first thing rendered) so a stale cached/installed
// instance is visually obvious instead of silently running old code — see the registerSW
// comment above for why that's specifically bitten multiplayer testing in the past.
const buildInfoEl = document.getElementById('build-info');
if (buildInfoEl) {
  buildInfoEl.textContent = `build ${__BUILD_VERSION__} · ${__BUILD_TIME__}`;
}

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

// GameScene's create() fires its initial state-sync emits (score/health/weapon/...) the
// moment it runs, and UIScene only picks those up if it has already registered its
// GameEvents listeners by then. BootScene launches UIScene before emitting 'boot-ready',
// but launch() only queues UIScene's own create() for the SceneManager's next pass — it
// doesn't run synchronously. When BootScene alone gated the start (the old flow), UIScene
// and GameScene were queued back-to-back from the same call and happened to land in the
// same batch. Now that GameScene waits on the profile/room overlays (a human-timescale
// delay with no fixed relationship to Phaser's own step cadence), that incidental ordering
// can no longer be trusted — wait for UIScene to announce itself ready instead. This uses
// game.events (not the UIScene instance's own emitter) because game.scene.getScene() isn't
// guaranteed to return anything yet this early — only game.events is reliably available
// immediately after `new Phaser.Game(config)`.
const uiReady = new Promise<void>((resolve) => {
  game.events.once('ui-ready', resolve);
});

Promise.all([initProfileOverlay(game).then(() => initRoomOverlay(game)), bootReady, uiReady]).then(([session]) => {
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
