import Phaser from 'phaser';

/** Cross-scene event bus shared between GameScene and UIScene. */
export const GameEvents = new Phaser.Events.EventEmitter();

export const EVENTS = {
  SCORE_CHANGED: 'score-changed',
  HEALTH_CHANGED: 'health-changed',
  WEAPON_CHANGED: 'weapon-changed',
  SHIELD_CHANGED: 'shield-changed',
  PLANE_CHANGED: 'plane-changed',
  PLANE_SELECT_REQUESTED: 'plane-select-requested',
  GAME_OVER: 'game-over',
  RESTART_REQUESTED: 'restart-requested',
  ULTIMATE_REQUESTED: 'ultimate-requested',
  ULTIMATE_STATE_CHANGED: 'ultimate-state-changed'
} as const;
