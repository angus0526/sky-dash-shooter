import Phaser from 'phaser';

// Relative, not root-absolute — these are hand-built strings Vite's asset pipeline never
// sees, so the `base: './'` config doesn't touch them. A leading "/" resolves against HTTP
// origin root just fine, but under Electron's file:// loading it resolves against the
// filesystem drive root instead (e.g. "file:///C:/assets/..."), so every single image and
// audio file 404'd and the loading screen hung wherever the loader got stuck.
const IMG = './assets/images/';
const AUD = './assets/audio/';

function drawHeart(gfx: Phaser.GameObjects.Graphics): void {
  gfx.clear();
  gfx.fillStyle(0xff5470, 1);
  gfx.beginPath();
  gfx.moveTo(16, 28);
  gfx.lineTo(3, 15);
  gfx.arc(9, 10, 6, Phaser.Math.DegToRad(150), Phaser.Math.DegToRad(-30), false);
  gfx.arc(23, 10, 6, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(30), false);
  gfx.lineTo(16, 28);
  gfx.closePath();
  gfx.fillPath();
}

const STAR_TILE_SIZE = 480;

/** Scatters `count` soft dots of varying size/brightness across a tileable square, for a parallax starfield layer. */
function drawStars(gfx: Phaser.GameObjects.Graphics, count: number, minR: number, maxR: number, minAlpha: number, maxAlpha: number): void {
  gfx.clear();
  for (let i = 0; i < count; i++) {
    const x = Phaser.Math.Between(0, STAR_TILE_SIZE);
    const y = Phaser.Math.Between(0, STAR_TILE_SIZE);
    const r = Phaser.Math.FloatBetween(minR, maxR);
    const a = Phaser.Math.FloatBetween(minAlpha, maxAlpha);
    gfx.fillStyle(0xffffff, a);
    gfx.fillCircle(x, y, r);
  }
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '載入中...', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#8892b0'
      })
      .setOrigin(0.5);
    this.load.on('progress', (p: number) => label.setText(`載入中... ${Math.round(p * 100)}%`));

    this.load.image('ship', `${IMG}ship.png`);
    this.load.image('ship_ricochet', `${IMG}ship_ricochet.png`);
    this.load.image('ship_homing', `${IMG}ship_homing.png`);
    this.load.image('target', `${IMG}target.png`);
    this.load.image('obstacle', `${IMG}obstacle.png`);
    this.load.image('obstacle_big', `${IMG}obstacle_big.png`);
    this.load.image('pickup_bullet', `${IMG}pickup.png`);
    this.load.image('pickup_laser', `${IMG}pickup_laser.png`);
    this.load.image('pickup_nuke', `${IMG}pickup_nuke.png`);
    this.load.image('pickup_shield', `${IMG}pickup_shield.png`);
    this.load.image('laser1', `${IMG}laser1.png`);
    this.load.image('laser2', `${IMG}laser2.png`);
    this.load.image('nuke', `${IMG}nuke.png`);
    this.load.image('explosion_particle', `${IMG}explosion_particle.png`);
    this.load.image('shield_ring1', `${IMG}shield_ring1.png`);
    this.load.image('shield_ring2', `${IMG}shield_ring2.png`);
    this.load.image('shield_ring3', `${IMG}shield_ring3.png`);
    this.load.image('boss', `${IMG}boss.png`);

    this.load.audio('sfx_shoot', `${AUD}sfx_shoot.ogg`);
    this.load.audio('sfx_laser2', `${AUD}sfx_laser2.ogg`);
    this.load.audio('sfx_nuke', `${AUD}sfx_nuke.ogg`);
    this.load.audio('sfx_hit', `${AUD}sfx_hit.ogg`);
    this.load.audio('sfx_damage', `${AUD}sfx_damage.ogg`);
    this.load.audio('sfx_pickup', `${AUD}sfx_pickup.ogg`);
    this.load.audio('sfx_gameover', `${AUD}sfx_gameover.ogg`);

    this.load.audio('music_normal', `${AUD}music_normal.ogg`);
    this.load.audio('music_boss', `${AUD}music_boss.ogg`);
    this.load.audio('music_gameover', `${AUD}music_gameover.ogg`);
  }

  create(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 });

    gfx.fillStyle(0x4fd1ff, 1);
    gfx.fillCircle(20, 20, 20);
    gfx.generateTexture('lockring', 40, 40);

    drawHeart(gfx);
    gfx.generateTexture('pickup_heart', 32, 32);

    // Two tileable star layers for a parallax background: far = many small dim stars,
    // near = fewer, bigger, brighter ones. Scattered randomly, not a repeating dot grid.
    drawStars(gfx, 70, 0.4, 1.1, 0.2, 0.55);
    gfx.generateTexture('starfield_far', STAR_TILE_SIZE, STAR_TILE_SIZE);

    drawStars(gfx, 28, 0.9, 1.9, 0.5, 1);
    gfx.generateTexture('starfield_near', STAR_TILE_SIZE, STAR_TILE_SIZE);

    gfx.destroy();

    // UIScene must finish registering its GameEvents listeners before GameScene's
    // create() fires its initial state-sync emits, or the first sync gets dropped.
    this.scene.launch('UIScene');
    this.scene.start('GameScene');
  }
}
