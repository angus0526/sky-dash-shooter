import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import { ShootButton } from '../controls/ShootButton';
import { UltimateButton } from '../controls/UltimateButton';
import { isTouchDevice } from '../controls/InputState';
import { EVENTS, GameEvents } from '../systems/GameEvents';
import { getMaxBossKills } from '../systems/Progress';
import { PLANES, PlaneId, PlaneConfig } from '../config/planes';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  JOYSTICK_RADIUS,
  MUTE_STORAGE_KEY,
  SHOOT_BUTTON_RADIUS,
  ULTIMATE_BUTTON_RADIUS
} from '../config/constants';

function loadMutedPreference(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const WEAPON_ICON: Record<string, string> = {
  bullet: '🔫',
  laser: '⚡',
  nuke: '💥',
  ricochet: '🎾',
  homing: '🎯'
};

interface PlaneCardRefs {
  id: PlaneId;
  bg: Phaser.GameObjects.Rectangle;
  lockOverlay: Phaser.GameObjects.Rectangle;
  lockText: Phaser.GameObjects.Text;
}

const ICON_BUTTON_RADIUS = 22;

export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private gameOverPanel!: Phaser.GameObjects.Container;
  private pausePanel!: Phaser.GameObjects.Container;
  private introPanel!: Phaser.GameObjects.Container;
  private pauseButton!: { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text };
  private muteButton!: { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text };
  private ultimateButton?: UltimateButton;
  private planeCards: PlaneCardRefs[] = [];
  private currentPlaneId: PlaneId = 'default';
  private paused = false;
  private muted = false;
  private ultimateReadyAt = 0;

  /** A round, generously-sized touch target (mobile buttons were too small to hit reliably) with a centered icon. */
  private createIconButton(x: number, y: number, icon: string, onTap: () => void): { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text } {
    const circle = this.add.circle(x, y, ICON_BUTTON_RADIUS, 0xffffff, 0.08);
    circle.setStrokeStyle(1, 0xffffff, 0.3);
    circle.setScrollFactor(0);
    circle.setDepth(30);
    circle.setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, icon, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#e6ecff'
    });
    label.setOrigin(0.5);
    label.setScrollFactor(0);
    label.setDepth(31);

    circle.on('pointerdown', onTap);
    return { circle, label };
  }

  constructor() {
    super('UIScene');
  }

  create(): void {
    // Icon buttons sit in their own row at the very top; everything else starts below them
    // so the score text (which grows wider as digits are added) can never overlap the pause
    // button — they used to share the same row and collide.
    const btnY = 40;
    this.pauseButton = this.createIconButton(28, btnY, '⏸', () => this.togglePause());

    this.muted = loadMutedPreference();
    this.sound.mute = this.muted;
    this.muteButton = this.createIconButton(78, btnY, this.muted ? '🔇' : '🔊', () => this.toggleMute());

    if (this.sys.game.device.fullscreen.available) {
      this.createIconButton(128, btnY, '⛶', () => this.toggleFullscreen());
    }

    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard?.on('keydown-Q', () => GameEvents.emit(EVENTS.ULTIMATE_REQUESTED));

    this.scoreText = this.add.text(16, 74, '分數 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#e6ecff'
    });
    this.scoreText.setScrollFactor(0);
    this.scoreText.setDepth(30);

    // Health is uncapped now (every heart pickup raises the ceiling), so a fixed row of heart
    // icons no longer makes sense — a single icon plus a "current/max" count scales to any value.
    this.healthText = this.add.text(16, 104, '❤ 0/0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ff5470'
    });
    this.healthText.setScrollFactor(0);
    this.healthText.setDepth(30);

    this.weaponText = this.add.text(16, 130, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#fff275'
    });
    this.weaponText.setScrollFactor(0);
    this.weaponText.setDepth(30);

    this.shieldText = this.add.text(16, 150, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#4fd1ff'
    });
    this.shieldText.setScrollFactor(0);
    this.shieldText.setDepth(30);

    if (isTouchDevice) {
      // Pulled in from the bare corners (24/30px margins) toward center — both easier to
      // hold comfortably and further from the screen-edge zones iOS/Android reserve for
      // their own system gestures (back-swipe, home indicator).
      new VirtualJoystick(this, JOYSTICK_RADIUS + 60, GAME_HEIGHT - JOYSTICK_RADIUS - 60);
      const fireX = GAME_WIDTH - SHOOT_BUTTON_RADIUS - 60;
      const fireY = GAME_HEIGHT - SHOOT_BUTTON_RADIUS - 60;
      new ShootButton(this, fireX, fireY);
      this.ultimateButton = new UltimateButton(this, fireX, fireY - SHOOT_BUTTON_RADIUS - ULTIMATE_BUTTON_RADIUS - 24);
    } else {
      const hint = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 20,
        '方向鍵/WASD 移動　空白鍵 射擊（自動輔助瞄準）　Q 全螢幕核爆絕招　Esc 暫停',
        { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#8892b0' }
      );
      hint.setOrigin(0.5, 1);
      hint.setScrollFactor(0);
      hint.setDepth(30);
    }

    this.gameOverPanel = this.buildGameOverPanel();
    this.gameOverPanel.setVisible(false);

    this.pausePanel = this.buildPausePanel();
    this.pausePanel.setVisible(false);

    this.introPanel = this.buildIntroPanel();
    this.pauseButton.circle.setVisible(false);
    this.pauseButton.label.setVisible(false);

    GameEvents.on(EVENTS.SCORE_CHANGED, this.onScoreChanged, this);
    GameEvents.on(EVENTS.HEALTH_CHANGED, this.onHealthChanged, this);
    GameEvents.on(EVENTS.WEAPON_CHANGED, this.onWeaponChanged, this);
    GameEvents.on(EVENTS.SHIELD_CHANGED, this.onShieldChanged, this);
    GameEvents.on(EVENTS.PLANE_CHANGED, this.onPlaneChanged, this);
    GameEvents.on(EVENTS.GAME_OVER, this.onGameOver, this);
    GameEvents.on(EVENTS.ULTIMATE_STATE_CHANGED, this.onUltimateStateChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      GameEvents.off(EVENTS.SCORE_CHANGED, this.onScoreChanged, this);
      GameEvents.off(EVENTS.HEALTH_CHANGED, this.onHealthChanged, this);
      GameEvents.off(EVENTS.WEAPON_CHANGED, this.onWeaponChanged, this);
      GameEvents.off(EVENTS.SHIELD_CHANGED, this.onShieldChanged, this);
      GameEvents.off(EVENTS.PLANE_CHANGED, this.onPlaneChanged, this);
      GameEvents.off(EVENTS.GAME_OVER, this.onGameOver, this);
      GameEvents.off(EVENTS.ULTIMATE_STATE_CHANGED, this.onUltimateStateChanged, this);
    });
  }

  update(): void {
    if (this.ultimateButton) {
      const readyInSec = Math.max(0, (this.ultimateReadyAt - this.time.now) / 1000);
      this.ultimateButton.setState(readyInSec);
    }
  }

  private buildGameOverPanel(): Phaser.GameObjects.Container {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const bg = this.add.rectangle(0, 0, 340, 220, 0x0b0f1a, 0.92);
    bg.setStrokeStyle(2, 0xff5470, 0.8);

    const title = this.add.text(0, -70, '遊戲結束', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: '#ffffff'
    });
    title.setOrigin(0.5);

    const finalScore = this.add.text(0, -20, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#e6ecff'
    });
    finalScore.setOrigin(0.5);
    finalScore.setName('finalScore');

    const button = this.add.rectangle(0, 50, 180, 52, 0x4fd1ff, 0.9);
    button.setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(0, 50, '再玩一次', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#0b0f1a'
    });
    buttonText.setOrigin(0.5);

    button.on('pointerdown', () => {
      this.gameOverPanel.setVisible(false);
      this.pauseButton.circle.setVisible(true);
      this.pauseButton.label.setVisible(true);
      GameEvents.emit(EVENTS.RESTART_REQUESTED);
    });

    const container = this.add.container(cx, cy, [bg, title, finalScore, button, buttonText]);
    container.setDepth(40);
    return container;
  }

  private buildIntroPanel(): Phaser.GameObjects.Container {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const bg = this.add.rectangle(0, 0, 620, 380, 0x0b0f1a, 0.96);
    bg.setStrokeStyle(2, 0xfff275, 0.85);

    const title = this.add.text(0, -160, '歡迎來到 Sky Dash Shooter', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#ffffff'
    });
    title.setOrigin(0.5);

    const bodyLines = isTouchDevice
      ? [
          '🕹️ 左下搖桿移動（按住 5 秒可拖曳調整搖桿位置）',
          '🔫 右下 FIRE 鍵射擊，自動輔助瞄準最近目標',
          '💥 黃色按鈕是全螢幕核爆絕招，冷卻後可再次使用',
          '🛡️ 撿道具升級武器／護盾／血量',
          '👾 魔王會定期來襲，擊敗可永久解鎖新飛機',
          '⏸ 暫停鍵可切換已解鎖的飛機'
        ]
      : [
          '⌨️ 方向鍵／WASD 移動，空白鍵射擊（自動輔助瞄準）',
          '💥 按 Q 鍵發動全螢幕核爆絕招，冷卻後可再次使用',
          '🛡️ 撿道具升級武器／護盾／血量',
          '👾 魔王會定期來襲，擊敗可永久解鎖新飛機',
          '⏸ Esc 暫停，暫停時可切換已解鎖的飛機'
        ];

    const body = this.add.text(0, -60, bodyLines.join('\n'), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#c3cbe0',
      align: 'left',
      lineSpacing: 10
    });
    body.setOrigin(0.5, 0);

    const button = this.add.rectangle(0, 155, 200, 52, 0xfff275, 0.9);
    button.setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(0, 155, '開始遊戲', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#0b0f1a'
    });
    buttonText.setOrigin(0.5);

    button.on('pointerdown', () => {
      this.introPanel.setVisible(false);
      this.pauseButton.circle.setVisible(true);
      this.pauseButton.label.setVisible(true);
      this.scene.resume('GameScene');
    });

    const container = this.add.container(cx, cy, [bg, title, body, button, buttonText]);
    container.setDepth(60);
    return container;
  }

  private buildPausePanel(): Phaser.GameObjects.Container {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const bg = this.add.rectangle(0, 0, 560, 300, 0x0b0f1a, 0.94);
    bg.setStrokeStyle(2, 0x4fd1ff, 0.8);

    const title = this.add.text(0, -125, '已暫停', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      color: '#ffffff'
    });
    title.setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [bg, title];
    PLANES.forEach((plane, i) => {
      const cardX = (i - 1) * 175;
      const { card, refs } = this.buildPlaneCard(plane, cardX, -10);
      this.planeCards.push(refs);
      children.push(card);
    });

    const resumeButton = this.add.rectangle(0, 110, 180, 48, 0x4fd1ff, 0.9);
    resumeButton.setInteractive({ useHandCursor: true });
    const resumeText = this.add.text(0, 110, '繼續遊戲', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#0b0f1a'
    });
    resumeText.setOrigin(0.5);
    resumeButton.on('pointerdown', () => this.resumeGame());
    children.push(resumeButton, resumeText);

    const container = this.add.container(cx, cy, children);
    container.setDepth(50);
    return container;
  }

  private buildPlaneCard(plane: PlaneConfig, x: number, y: number): { card: Phaser.GameObjects.Container; refs: PlaneCardRefs } {
    const bg = this.add.rectangle(0, 0, 150, 170, 0xffffff, 0.06);
    bg.setStrokeStyle(2, 0xffffff, 0.25);
    bg.setInteractive({ useHandCursor: true });

    const ship = this.add.image(0, -45, plane.shipTexture);
    ship.setScale(0.5);

    const name = this.add.text(0, 10, plane.name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#e6ecff'
    });
    name.setOrigin(0.5);

    const weapon = this.add.text(0, 32, plane.weaponLabel, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#8892b0'
    });
    weapon.setOrigin(0.5);
    weapon.setWordWrapWidth(130, true);

    const lockOverlay = this.add.rectangle(0, 0, 150, 170, 0x0b0f1a, 0.75);
    const lockText = this.add.text(0, -10, `🔒 擊敗 ${plane.unlockBossKills} 隻魔王解鎖`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#ff5470',
      align: 'center'
    });
    lockText.setOrigin(0.5);
    lockText.setWordWrapWidth(130, true);

    bg.on('pointerdown', () => {
      if (lockOverlay.visible) return;
      GameEvents.emit(EVENTS.PLANE_SELECT_REQUESTED, plane.id);
    });

    const card = this.add.container(x, y, [bg, ship, name, weapon, lockOverlay, lockText]);
    return { card, refs: { id: plane.id, bg, lockOverlay, lockText } };
  }

  private refreshPlaneCards(): void {
    const maxKills = getMaxBossKills();
    this.planeCards.forEach((refs) => {
      const plane = PLANES.find((p) => p.id === refs.id)!;
      const unlocked = maxKills >= plane.unlockBossKills;
      refs.lockOverlay.setVisible(!unlocked);
      refs.lockText.setVisible(!unlocked);
      const isActive = refs.id === this.currentPlaneId;
      refs.bg.setStrokeStyle(2, isActive ? 0x4fd1ff : 0xffffff, isActive ? 1 : 0.25);
    });
  }

  private togglePause(): void {
    if (this.gameOverPanel.visible) return;
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  private pauseGame(): void {
    this.paused = true;
    this.scene.pause('GameScene');
    this.refreshPlaneCards();
    this.pausePanel.setVisible(true);
  }

  private resumeGame(): void {
    this.paused = false;
    this.pausePanel.setVisible(false);
    this.scene.resume('GameScene');
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.sound.mute = this.muted;
    this.muteButton.label.setText(this.muted ? '🔇' : '🔊');
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore storage failures (private browsing etc.)
    }
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  private onScoreChanged(score: number): void {
    this.scoreText.setText(`分數 ${score}`);
  }

  private onHealthChanged({ health, maxHealth }: { health: number; maxHealth: number }): void {
    this.healthText.setText(`❤ ${health}/${maxHealth}`);
  }

  private onWeaponChanged(levels: Record<string, number>): void {
    const text = Object.entries(levels)
      .map(([key, value]) => `${WEAPON_ICON[key] ?? key}Lv${value}`)
      .join('  ');
    this.weaponText.setText(text);
  }

  private onShieldChanged(charges: number): void {
    this.shieldText.setText(charges > 0 ? `🛡️ x${charges}` : '');
  }

  private onPlaneChanged(planeId: PlaneId): void {
    this.currentPlaneId = planeId;
    this.refreshPlaneCards();
  }

  private onUltimateStateChanged(readyAt: number): void {
    this.ultimateReadyAt = readyAt;
  }

  private onGameOver(score: number): void {
    const finalScore = this.gameOverPanel.getByName('finalScore') as Phaser.GameObjects.Text;
    finalScore.setText(`最終分數：${score}`);
    this.gameOverPanel.setVisible(true);
    this.pauseButton.circle.setVisible(false);
    this.pauseButton.label.setVisible(false);
    if (this.paused) this.resumeGame();
  }
}
