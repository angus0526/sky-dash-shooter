import Phaser from 'phaser';
import { GameSnapshot } from './Multiplayer';
import { FACING_OFFSET_DEG } from '../entities/Player';

const MAX_TARGETS = 40;
const MAX_OBSTACLES = 40;
const MAX_PICKUPS = 12;
const MAX_BOSS_BULLETS = 40;

// Real scales the corresponding entities use (Target.ts/Obstacle.ts/BossBulletPool.ts) —
// ghost sprites are plain Images with no inherent size, so without these they render at
// each texture's native pixel size, which is dramatically larger than the real game object.
const TARGET_SCALE = 0.4;
const OBSTACLE_SCALE = { small: 0.85, big: 0.55 };
const BOSS_BULLET_SCALE = 1.2;
const PLAYER_GHOST_SCALE = 0.45;

// How quickly a ghost eases toward its latest known position, expressed as a time constant
// in ms rather than a flat per-frame factor — keeps the easing rate the same regardless of
// frame rate, since snapshots only arrive every SNAPSHOT_INTERVAL_MS-ish and directly
// snapping to each one looks like stutter/teleporting rather than motion.
const SMOOTHING_TAU_MS = 120;

function smoothingFactor(deltaMs: number): number {
  return 1 - Math.exp(-deltaMs / SMOOTHING_TAU_MS);
}

class SimplePool<T extends { x: number; y: number }> {
  private sprites: Phaser.GameObjects.Image[] = [];
  private targetX: number[] = [];
  private targetY: number[] = [];

  constructor(
    scene: Phaser.Scene,
    size: number,
    private textureFor: (entry: T) => string,
    depth: number,
    private scaleFor: (entry: T) => number = () => 1,
    tint?: number
  ) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-1000, -1000, '__DEFAULT');
      img.setVisible(false);
      img.setDepth(depth);
      if (tint !== undefined) img.setTint(tint);
      this.sprites.push(img);
      this.targetX.push(0);
      this.targetY.push(0);
    }
  }

  /** `entries[i]` must always refer to the same real pool slot across calls (null when that
   * slot is inactive) — this is the client's only notion of "which object is this", so an
   * index that means something different each call reads as that ghost teleporting/flying
   * to an unrelated position instead of representing its own object smoothly moving. */
  sync(entries: (T | null)[]): void {
    this.sprites.forEach((sprite, i) => {
      const entry = entries[i];
      if (!entry) {
        sprite.setVisible(false);
        return;
      }
      sprite.setTexture(this.textureFor(entry));
      sprite.setScale(this.scaleFor(entry));
      // Snap immediately rather than easing in from wherever it last was (or its offscreen
      // parking spot) the moment a slot starts being used again — only interpolate between
      // positions that are both real.
      if (!sprite.visible) sprite.setPosition(entry.x, entry.y);
      this.targetX[i] = entry.x;
      this.targetY[i] = entry.y;
      sprite.setVisible(true);
    });
  }

  tick(factor: number): void {
    this.sprites.forEach((sprite, i) => {
      if (!sprite.visible) return;
      sprite.x = Phaser.Math.Linear(sprite.x, this.targetX[i], factor);
      sprite.y = Phaser.Math.Linear(sprite.y, this.targetY[i], factor);
    });
  }

  destroy(): void {
    this.sprites.forEach((s) => s.destroy());
  }
}

interface GhostPlayer {
  sprite: Phaser.GameObjects.Image;
  targetX: number;
  targetY: number;
}

/**
 * Client-side (non-host) world rendering: no local physics simulation of the shared world
 * at all — every enemy/pickup/boss/teammate sprite here is purely cosmetic, repositioned
 * from the host's periodic broadcast snapshot. The client's own ship is a real physics
 * Player elsewhere (for responsive local movement), never one of these ghosts.
 */
export class GhostRenderer {
  private targets: SimplePool<{ x: number; y: number }>;
  private obstacles: SimplePool<{ x: number; y: number; big: boolean }>;
  private pickups: SimplePool<{ x: number; y: number; type: string }>;
  private bossBullets: SimplePool<{ x: number; y: number }>;
  private boss: Phaser.GameObjects.Image;
  private bossTargetX = 0;
  private bossTargetY = 0;
  private otherPlayers = new Map<string, GhostPlayer>();

  constructor(private scene: Phaser.Scene) {
    this.targets = new SimplePool(scene, MAX_TARGETS, () => 'target', 5, () => TARGET_SCALE);
    this.obstacles = new SimplePool(
      scene,
      MAX_OBSTACLES,
      (o) => (o.big ? 'obstacle_big' : 'obstacle'),
      5,
      (o) => (o.big ? OBSTACLE_SCALE.big : OBSTACLE_SCALE.small)
    );
    this.pickups = new SimplePool(scene, MAX_PICKUPS, (p) => `pickup_${p.type}`, 5);
    this.bossBullets = new SimplePool(scene, MAX_BOSS_BULLETS, () => 'laser1', 8, () => BOSS_BULLET_SCALE, 0xff4d4d);

    this.boss = scene.add.image(-1000, -1000, 'boss');
    this.boss.setTint(0x9b5cff);
    this.boss.setScale(2.2);
    this.boss.setVisible(false);
    this.boss.setDepth(6);
  }

  private getPlayerGhost(peerId: string): GhostPlayer {
    let ghost = this.otherPlayers.get(peerId);
    if (!ghost) {
      const sprite = this.scene.add.image(-1000, -1000, 'ship');
      sprite.setScale(PLAYER_GHOST_SCALE);
      // Ship art faces "up"; every real Player corrects for this the same way. A ghost is a
      // plain Image with no movement-derived tilt to react to, so it just holds this static
      // correction — without it, teammates render rotated 90° off from every other sprite.
      sprite.setAngle(FACING_OFFSET_DEG);
      sprite.setDepth(9);
      // A freshly created Image defaults to visible — starting it hidden matches the pooled
      // sprites above, so apply()'s "snap instead of easing in" check on first appearance
      // actually triggers instead of lerping in all the way from this parking spot.
      sprite.setVisible(false);
      ghost = { sprite, targetX: -1000, targetY: -1000 };
      this.otherPlayers.set(peerId, ghost);
    }
    return ghost;
  }

  apply(snap: GameSnapshot, localPeerId: string): void {
    this.targets.sync(snap.targets);
    this.obstacles.sync(snap.obstacles);
    this.pickups.sync(snap.pickups);
    this.bossBullets.sync(snap.bossBullets);

    if (snap.boss) {
      if (!this.boss.visible) this.boss.setPosition(snap.boss.x, snap.boss.y);
      this.bossTargetX = snap.boss.x;
      this.bossTargetY = snap.boss.y;
      this.boss.setVisible(true);
    } else {
      this.boss.setVisible(false);
    }

    const seenPeers = new Set<string>();
    for (const [peerId, playerSnap] of Object.entries(snap.players)) {
      if (peerId === localPeerId) continue;
      seenPeers.add(peerId);
      const ghost = this.getPlayerGhost(peerId);
      if (!ghost.sprite.visible) ghost.sprite.setPosition(playerSnap.x, playerSnap.y);
      ghost.targetX = playerSnap.x;
      ghost.targetY = playerSnap.y;
      ghost.sprite.setVisible(true);
    }
    this.otherPlayers.forEach((ghost, peerId) => {
      if (!seenPeers.has(peerId)) ghost.sprite.setVisible(false);
    });
  }

  /** Eases every visible ghost toward its latest snapshot position — call once per frame from GameScene's client update loop, not just when a snapshot arrives, or motion looks like teleporting between each ~90ms update instead of smooth movement. */
  tick(deltaMs: number): void {
    const factor = smoothingFactor(deltaMs);
    this.targets.tick(factor);
    this.obstacles.tick(factor);
    this.pickups.tick(factor);
    this.bossBullets.tick(factor);

    if (this.boss.visible) {
      this.boss.x = Phaser.Math.Linear(this.boss.x, this.bossTargetX, factor);
      this.boss.y = Phaser.Math.Linear(this.boss.y, this.bossTargetY, factor);
    }

    this.otherPlayers.forEach((ghost) => {
      if (!ghost.sprite.visible) return;
      ghost.sprite.x = Phaser.Math.Linear(ghost.sprite.x, ghost.targetX, factor);
      ghost.sprite.y = Phaser.Math.Linear(ghost.sprite.y, ghost.targetY, factor);
    });
  }

  destroy(): void {
    this.targets.destroy();
    this.obstacles.destroy();
    this.pickups.destroy();
    this.bossBullets.destroy();
    this.boss.destroy();
    this.otherPlayers.forEach((ghost) => ghost.sprite.destroy());
  }
}
