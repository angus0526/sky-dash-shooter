import Phaser from 'phaser';
import { Target } from '../entities/Target';
import { Obstacle } from '../entities/Obstacle';
import { Pickup, PickupType } from '../entities/Pickup';
import {
  BIG_OBSTACLE_CHANCE_MAX,
  BIG_OBSTACLE_CHANCE_PER_STAGE,
  DIFFICULTY_STAGE_SEC,
  GAME_HEIGHT,
  GAME_WIDTH,
  PICKUP_INTERVAL_JITTER_MS,
  PICKUP_INTERVAL_MS,
  PICKUP_SPEED_FACTOR,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_RAMP_PER_SEC,
  SCROLL_SPEED_START,
  SPAWN_INTERVAL_MIN_MS,
  SPAWN_INTERVAL_RAMP_PER_SEC,
  SPAWN_INTERVAL_START_MS,
  TARGET_RATIO
} from '../config/constants';

const POOL_SIZE = 12;
const PICKUP_POOL_SIZE = 4;
const SPAWN_MARGIN_Y = 40;

// Weapon pickups are common, heart/shield are rarer and more precious.
const PICKUP_WEIGHTS: Array<[PickupType, number]> = [
  ['bullet', 30],
  ['laser', 25],
  ['nuke', 20],
  ['shield', 15],
  ['heart', 10]
];

function pickRandomPickupType(): PickupType {
  const total = PICKUP_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of PICKUP_WEIGHTS) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return 'bullet';
}

export class Spawner {
  private scene: Phaser.Scene;
  targets: Phaser.Physics.Arcade.Group;
  obstacles: Phaser.Physics.Arcade.Group;
  pickups: Phaser.Physics.Arcade.Group;

  private elapsedSec = 0;
  private nextSpawnAt = 0;
  private nextPickupAt = 0;
  private paused = false;

  /** Player-count difficulty multiplier (1.0 in solo — see PLAYER_COUNT_MULTIPLIER). Speeds up spawn cadence rather than bursting multiple spawns per tick, so it scales smoothly for fractional values like 1.5. */
  constructor(scene: Phaser.Scene, private multiplier: number = 1) {
    this.scene = scene;

    const poolSize = Math.ceil(POOL_SIZE * multiplier);
    const pickupPoolSize = Math.ceil(PICKUP_POOL_SIZE * multiplier);

    this.targets = scene.physics.add.group({
      classType: Target,
      runChildUpdate: false,
      maxSize: poolSize
    });
    this.obstacles = scene.physics.add.group({
      classType: Obstacle,
      runChildUpdate: false,
      maxSize: poolSize
    });
    this.pickups = scene.physics.add.group({
      classType: Pickup,
      runChildUpdate: false,
      maxSize: pickupPoolSize
    });

    for (let i = 0; i < poolSize; i++) {
      this.targets.add(new Target(scene), true);
      this.obstacles.add(new Obstacle(scene), true);
    }
    for (let i = 0; i < pickupPoolSize; i++) {
      this.pickups.add(new Pickup(scene), true);
    }

    this.nextPickupAt = this.randomPickupDelay();
  }

  get scrollSpeed(): number {
    return Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_START + this.elapsedSec * SCROLL_SPEED_RAMP_PER_SEC);
  }

  private get spawnInterval(): number {
    const base = Math.max(
      SPAWN_INTERVAL_MIN_MS,
      SPAWN_INTERVAL_START_MS - this.elapsedSec * SPAWN_INTERVAL_RAMP_PER_SEC
    );
    return base / this.multiplier;
  }

  private get bigObstacleChance(): number {
    const stage = Math.floor(this.elapsedSec / DIFFICULTY_STAGE_SEC);
    return Math.min(BIG_OBSTACLE_CHANCE_MAX, stage * BIG_OBSTACLE_CHANCE_PER_STAGE);
  }

  private randomPickupDelay(): number {
    const base = PICKUP_INTERVAL_MS + Phaser.Math.Between(-PICKUP_INTERVAL_JITTER_MS, PICKUP_INTERVAL_JITTER_MS);
    return base / this.multiplier;
  }

  /** Fast-forwards the difficulty baseline, e.g. after a boss fight. */
  advanceDifficulty(extraSec: number): void {
    this.elapsedSec += extraSec;
  }

  /** While paused, no new targets/obstacles/pickups spawn (used during boss fights); existing ones keep moving. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.elapsedSec = 0;
    this.nextSpawnAt = 0;
    this.nextPickupAt = this.randomPickupDelay();
    this.paused = false;
    [...this.targets.getChildren(), ...this.obstacles.getChildren(), ...this.pickups.getChildren()].forEach(
      (obj) => {
        const sprite = obj as Target | Obstacle | Pickup;
        sprite.deactivate();
      }
    );
  }

  update(deltaMs: number): void {
    const vx = -this.scrollSpeed;

    if (!this.paused) {
      this.elapsedSec += deltaMs / 1000;

      const spawnY = Phaser.Math.Between(SPAWN_MARGIN_Y, GAME_HEIGHT - SPAWN_MARGIN_Y);

      if (this.scene.time.now >= this.nextSpawnAt) {
        this.nextSpawnAt = this.scene.time.now + this.spawnInterval;

        if (Math.random() < TARGET_RATIO) {
          const t = this.targets.get() as Target | null;
          t?.spawnAt(GAME_WIDTH + 30, spawnY, vx);
        } else {
          const o = this.obstacles.get() as Obstacle | null;
          o?.spawnAt(GAME_WIDTH + 30, spawnY, vx, Math.random() < this.bigObstacleChance);
        }
      }

      if (this.scene.time.now >= this.nextPickupAt) {
        this.nextPickupAt = this.scene.time.now + this.randomPickupDelay();
        const p = this.pickups.get() as Pickup | null;
        p?.spawnAt(
          GAME_WIDTH + 30,
          Phaser.Math.Between(SPAWN_MARGIN_Y, GAME_HEIGHT - SPAWN_MARGIN_Y),
          vx * PICKUP_SPEED_FACTOR,
          pickRandomPickupType()
        );
      }
    }

    this.recycleOffscreen(this.targets);
    this.recycleOffscreen(this.obstacles);
    this.recycleOffscreen(this.pickups);

    this.targets.getChildren().forEach((obj) => {
      const t = obj as Target;
      if (t.active) t.setVelocityX(vx);
    });
    this.obstacles.getChildren().forEach((obj) => {
      const o = obj as Obstacle;
      if (o.active) o.setVelocityX(vx);
    });
    this.pickups.getChildren().forEach((obj) => {
      const p = obj as Pickup;
      if (p.active) p.setVelocityX(vx * PICKUP_SPEED_FACTOR);
    });
  }

  private recycleOffscreen(group: Phaser.Physics.Arcade.Group): void {
    group.getChildren().forEach((obj) => {
      const sprite = obj as Target | Obstacle | Pickup;
      if (sprite.active && sprite.x < -40) {
        sprite.deactivate();
      }
    });
  }
}
