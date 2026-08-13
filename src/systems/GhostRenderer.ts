import Phaser from 'phaser';
import { GameSnapshot } from './Multiplayer';

const MAX_TARGETS = 40;
const MAX_OBSTACLES = 40;
const MAX_PICKUPS = 12;
const MAX_BOSS_BULLETS = 40;

class SimplePool<T extends { x: number; y: number }> {
  private sprites: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, size: number, private textureFor: (entry: T) => string, depth: number, tint?: number) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-1000, -1000, '__DEFAULT');
      img.setVisible(false);
      img.setDepth(depth);
      if (tint !== undefined) img.setTint(tint);
      this.sprites.push(img);
    }
  }

  sync(entries: T[]): void {
    entries.forEach((entry, i) => {
      if (i >= this.sprites.length) return;
      const sprite = this.sprites[i];
      sprite.setTexture(this.textureFor(entry));
      sprite.setPosition(entry.x, entry.y);
      sprite.setVisible(true);
    });
    for (let i = entries.length; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
  }

  destroy(): void {
    this.sprites.forEach((s) => s.destroy());
  }
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
  private otherPlayers = new Map<string, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene) {
    this.targets = new SimplePool(scene, MAX_TARGETS, () => 'target', 5);
    this.obstacles = new SimplePool(scene, MAX_OBSTACLES, (o) => (o.big ? 'obstacle_big' : 'obstacle'), 5);
    this.pickups = new SimplePool(scene, MAX_PICKUPS, (p) => `pickup_${p.type}`, 5);
    this.bossBullets = new SimplePool(scene, MAX_BOSS_BULLETS, () => 'laser1', 8, 0xff4d4d);

    this.boss = scene.add.image(-1000, -1000, 'boss');
    this.boss.setTint(0x9b5cff);
    this.boss.setScale(2.2);
    this.boss.setVisible(false);
    this.boss.setDepth(6);
  }

  private getPlayerGhost(peerId: string): Phaser.GameObjects.Image {
    let sprite = this.otherPlayers.get(peerId);
    if (!sprite) {
      sprite = this.scene.add.image(-1000, -1000, 'ship');
      sprite.setScale(0.45);
      sprite.setDepth(9);
      this.otherPlayers.set(peerId, sprite);
    }
    return sprite;
  }

  apply(snap: GameSnapshot, localPeerId: string): void {
    this.targets.sync(snap.targets);
    this.obstacles.sync(snap.obstacles);
    this.pickups.sync(snap.pickups);
    this.bossBullets.sync(snap.bossBullets);

    if (snap.boss) {
      this.boss.setPosition(snap.boss.x, snap.boss.y);
      this.boss.setVisible(true);
    } else {
      this.boss.setVisible(false);
    }

    const seenPeers = new Set<string>();
    for (const [peerId, playerSnap] of Object.entries(snap.players)) {
      if (peerId === localPeerId) continue;
      seenPeers.add(peerId);
      const sprite = this.getPlayerGhost(peerId);
      sprite.setPosition(playerSnap.x, playerSnap.y);
      sprite.setVisible(true);
    }
    this.otherPlayers.forEach((sprite, peerId) => {
      if (!seenPeers.has(peerId)) sprite.setVisible(false);
    });
  }

  destroy(): void {
    this.targets.destroy();
    this.obstacles.destroy();
    this.pickups.destroy();
    this.bossBullets.destroy();
    this.boss.destroy();
    this.otherPlayers.forEach((s) => s.destroy());
  }
}
