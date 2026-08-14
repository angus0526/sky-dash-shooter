import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Target } from '../entities/Target';
import { Obstacle } from '../entities/Obstacle';
import { Pickup, PickupType } from '../entities/Pickup';
import { Spawner } from '../systems/Spawner';
import { AimAssist } from '../systems/AimAssist';
import { BulletPool } from '../systems/BulletPool';
import { LaserPool } from '../systems/LaserPool';
import { NukePool } from '../systems/NukePool';
import { RicochetPool } from '../systems/RicochetPool';
import { HomingPool } from '../systems/HomingPool';
import { Explosion } from '../systems/Explosion';
import { Sfx } from '../systems/Sfx';
import { Music } from '../systems/Music';
import { WeaponSystem } from '../systems/WeaponSystem';
import { BossManager } from '../systems/BossManager';
import { Starfield } from '../systems/Starfield';
import { getMaxBossKills, recordBossKills } from '../systems/Progress';
import { getActiveProfile, recordRunScore } from '../systems/PlayerProfile';
import { submitScore } from '../systems/Leaderboard';
import { GhostRenderer } from '../systems/GhostRenderer';
import { EntitySnap, GameSnapshot, getLocalPeerId, LOCAL_RIG_ID, MultiplayerSession, NetInput } from '../systems/Multiplayer';
import { EVENTS, GameEvents } from '../systems/GameEvents';
import { InputState } from '../controls/InputState';
import { PlaneId, getPlane } from '../config/planes';
import {
  BOSS_DEFEAT_SCORE,
  GAME_HEIGHT,
  GAME_WIDTH,
  HOMING_EXPLOSION_RADIUS,
  HOMING_FIRE_COOLDOWN_MS,
  HOMING_SPLASH_DAMAGE_TO_BOSS,
  INPUT_SEND_INTERVAL_MS,
  NUKE_EXPLOSION_RADIUS,
  PLAYER_COUNT_MULTIPLIER,
  PLAYER_START_X,
  PLAYER_START_Y,
  RICOCHET_DAMAGE_TO_BOSS,
  RICOCHET_FIRE_COOLDOWN_MS,
  HOMING_DAMAGE_TO_BOSS,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_START,
  SNAPSHOT_INTERVAL_MS,
  SPECIAL_NUKE_FIRE_COOLDOWN_MS,
  SPECIAL_NUKE_TINTS,
  ULTIMATE_BOSS_DAMAGE,
  ULTIMATE_COOLDOWN_MS,
  WEAPON_DAMAGE_GROWTH_PER_LEVEL
} from '../config/constants';

const BULLET_DAMAGE_TO_BOSS = 4;
const LASER_DAMAGE_TO_BOSS = 6;
const NUKE_DAMAGE_TO_BOSS = 20;
const CLIENT_STARFIELD_SCROLL_SPEED = (SCROLL_SPEED_START + SCROLL_SPEED_MAX) / 2;

/** Scales a weapon's base boss-damage by the level the projectile was actually fired at — unlimited, so a shot from a well-fed weapon keeps hitting harder even past the old fixed level cap. */
function scaleDamage(base: number, level: number): number {
  return base * (1 + (level - 1) * WEAPON_DAMAGE_GROWTH_PER_LEVEL);
}

// Preserves each pool slot's index (active: false when inactive) rather than compacting
// down to only the active members — see the GameSnapshot fields' doc comment in
// Multiplayer.ts for why filtering breaks stable per-object identity across snapshots.
function snapGroup(group: Phaser.Physics.Arcade.Group): EntitySnap[] {
  return group.getChildren().map((o) => {
    const sprite = o as Phaser.Physics.Arcade.Sprite;
    return { active: sprite.active, x: sprite.x, y: sprite.y };
  });
}

interface SceneInitData {
  session?: MultiplayerSession | null;
}

/** One player's full loadout — the host runs one of these per connected player (including
 * itself); solo is just the one-rig special case. Only the local rig ever gets to switch
 * planes (no networked plane-select request exists yet), so remote rigs stay on 'default'. */
interface Rig {
  id: string;
  isLocal: boolean;
  startY: number;
  player: Player;
  aimAssist: AimAssist;
  weaponSystem: WeaponSystem;
  currentPlane: PlaneId;
  ricochetLevel: number;
  homingLevel: number;
  ricochetNukeLevel: number;
  homingNukeLevel: number;
  nextRicochetFireAt: number;
  nextHomingFireAt: number;
  nextSpecialNukeFireAt: number;
  moveX: number;
  moveY: number;
  firing: boolean;
}

export class GameScene extends Phaser.Scene {
  private session: MultiplayerSession | null = null;
  /** True for solo play AND for the multiplayer host — both run the real simulation. False only for a multiplayer client, which just renders the host's broadcast snapshots. */
  private isAuthority = true;

  // --- Authority-only world (solo + host) ---
  private spawner!: Spawner;
  private bossManager!: BossManager;
  private bullets!: BulletPool;
  private lasers!: LaserPool;
  private nukes!: NukePool;
  private ricochets!: RicochetPool;
  private homings!: HomingPool;
  private rigs = new Map<string, Rig>();
  private nextSnapshotAt = 0;

  // --- Client-only (non-host multiplayer) ---
  private ghosts?: GhostRenderer;
  private clientPlayer?: Player;
  private clientWeaponSystem?: WeaponSystem;
  private clientBullets?: BulletPool;
  private clientLasers?: LaserPool;
  private clientNukes?: NukePool;
  private clientSfx?: Sfx;
  private clientMusic?: Music;
  private nextInputSendAt = 0;
  private clientBossKillsThisRun = 0;

  // --- Shared ---
  private starfield!: Starfield;
  private explosion!: Explosion;
  private sfx!: Sfx;
  private music!: Music;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private score = 0;
  private gameOver = false;
  private bossKillsThisRun = 0;
  private ultimateReadyAt = 0;

  constructor() {
    super('GameScene');
  }

  init(data: SceneInitData): void {
    this.session = data?.session ?? null;
    this.isAuthority = !this.session || this.session.isHost;
  }

  create(): void {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.starfield = new Starfield(this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard!.addKey('W'),
      a: this.input.keyboard!.addKey('A'),
      s: this.input.keyboard!.addKey('S'),
      d: this.input.keyboard!.addKey('D')
    };
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    if (this.isAuthority) this.createAuthorityWorld();
    else this.createClientWorld();

    GameEvents.on(EVENTS.RESTART_REQUESTED, this.restart, this);
    GameEvents.on(EVENTS.PLANE_SELECT_REQUESTED, this.handlePlaneSelect, this);
    GameEvents.on(EVENTS.ULTIMATE_REQUESTED, this.handleUltimateRequest, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      GameEvents.off(EVENTS.RESTART_REQUESTED, this.restart, this);
      GameEvents.off(EVENTS.PLANE_SELECT_REQUESTED, this.handlePlaneSelect, this);
      GameEvents.off(EVENTS.ULTIMATE_REQUESTED, this.handleUltimateRequest, this);
    });

    // Frozen behind UIScene's intro panel until the player dismisses it. create() only ever
    // runs once per page load (restart() re-runs the run, not this), so this only gates the
    // very first start, not subsequent restarts after death.
    //
    // Calling this.scene.pause() directly here is a no-op: this GameScene was started via
    // game.scene.start() from main.ts (outside any scene), not from another scene's own
    // create(), so at this exact point the SceneManager hasn't added it to its "active
    // scenes" list yet — pause() silently does nothing until that's happened, which the
    // CREATE event guarantees.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.scene.pause());
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    if (this.isAuthority) this.updateAuthority(delta);
    else this.updateClient(delta);
  }

  // ============================== Authority (solo + host) ==============================

  private createAuthorityWorld(): void {
    const multiplier = this.session ? PLAYER_COUNT_MULTIPLIER[this.session.playerCount - 1] : 1;

    this.spawner = new Spawner(this, multiplier);
    this.explosion = new Explosion(this);
    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.bullets = new BulletPool(this);
    this.lasers = new LaserPool(this);
    this.nukes = new NukePool(this);
    this.ricochets = new RicochetPool(this);
    this.homings = new HomingPool(this);
    this.bossManager = new BossManager(this, this.spawner, multiplier);
    this.nukes.onDetonate = (x, y, level) => this.handleNukeDetonate(x, y, level);
    this.bossManager.onBossStart = () => this.music.play('music_boss');
    this.bossManager.onBossEnd = () => this.music.play('music_normal');
    this.music.play('music_normal');

    const rigIds = [LOCAL_RIG_ID, ...(this.session?.peerIds ?? [])];
    rigIds.forEach((id, index) => this.rigs.set(id, this.createRig(id, id === LOCAL_RIG_ID, index)));
    this.rigs.forEach((rig) => this.wireRigCollisions(rig));
    this.wireProjectileCollisions();

    if (this.session) {
      this.session.onInput = (peerId, input) => {
        const rig = this.rigs.get(peerId);
        if (!rig) return;
        rig.moveX = input.moveX;
        rig.moveY = input.moveY;
        rig.firing = input.firing;
      };
      // A client has no local world to resolve its own ultimate against, so it asks the
      // host — same cooldown gate as the local Q-key/UI path, just entered from the network.
      this.session.onUltimateRequest = () => this.handleUltimateRequest();
    }

    const localRig = this.rigs.get(LOCAL_RIG_ID)!;
    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: localRig.player.health, maxHealth: localRig.player.maxHealth });
    GameEvents.emit(EVENTS.SHIELD_CHANGED, localRig.player.shieldCharges);
    GameEvents.emit(EVENTS.PLANE_CHANGED, localRig.currentPlane);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevelsFor(localRig));
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
  }

  /** Extra rigs (2nd, 3rd... player) are offset above/below the classic solo starting spot so they don't spawn stacked on top of each other. */
  private createRig(id: string, isLocal: boolean, index: number): Rig {
    const side = index % 2 === 1 ? -1 : 1;
    const magnitude = Math.ceil(index / 2) * 70;
    const startY = PLAYER_START_Y + (index === 0 ? 0 : side * magnitude);

    const player = new Player(this);
    player.setPosition(PLAYER_START_X, startY);

    return {
      id,
      isLocal,
      startY,
      player,
      aimAssist: new AimAssist(this),
      weaponSystem: new WeaponSystem(this, this.bullets, this.lasers, this.nukes, this.sfx),
      currentPlane: 'default',
      ricochetLevel: 1,
      homingLevel: 1,
      ricochetNukeLevel: 0,
      homingNukeLevel: 0,
      nextRicochetFireAt: 0,
      nextHomingFireAt: 0,
      nextSpecialNukeFireAt: 0,
      moveX: 0,
      moveY: 0,
      firing: false
    };
  }

  private wireRigCollisions(rig: Rig): void {
    this.physics.add.overlap(rig.player, this.spawner.obstacles, (_p, obj) => {
      const obstacle = obj as Obstacle;
      if (!obstacle.active) return;
      obstacle.deactivate();
      this.applyDamageToRig(rig);
    });

    this.physics.add.overlap(rig.player, this.spawner.pickups, (_p, obj) => {
      const pickup = obj as Pickup;
      if (!pickup.active) return;
      pickup.deactivate();
      this.handlePickup(rig, pickup.pickupType);
    });

    this.physics.add.overlap(rig.player, this.bossManager.boss, () => {
      if (!this.bossManager.boss.active) return;
      this.applyDamageToRig(rig);
    });

    this.physics.add.overlap(rig.player, this.bossManager.bulletPool.group, (a: unknown, b: unknown) => {
      const bullet = (a === rig.player ? b : a) as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return;
      this.bossManager.bulletPool.deactivate(bullet);
      this.applyDamageToRig(rig);
    });
  }

  /** Projectile-vs-enemy collision is pool-vs-pool, not per-player — a bullet doesn't care which rig fired it (its damage level is tagged on the projectile itself), so this wiring is identical regardless of player count. */
  private wireProjectileCollisions(): void {
    this.physics.add.overlap(this.bullets.group, this.spawner.targets, (bulletObj, targetObj) => {
      const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
      const target = targetObj as Target;
      if (!bullet.active || !target.active) return;

      this.bullets.deactivate(bullet);
      this.killTarget(target);
    });

    this.physics.add.overlap(this.lasers.group, this.spawner.targets, (laserObj, targetObj) => {
      const laser = laserObj as Phaser.Physics.Arcade.Sprite;
      const target = targetObj as Target;
      if (!laser.active || !target.active) return;
      // Laser pierces — it is NOT deactivated here, only the target it hit.
      this.killTarget(target);
    });

    this.physics.add.overlap(this.nukes.group, this.spawner.targets, (nukeObj, targetObj) => {
      const nuke = nukeObj as Phaser.Physics.Arcade.Sprite;
      if (!nuke.active || !(targetObj as Target).active) return;
      this.nukes.detonate(nuke);
    });
    this.physics.add.overlap(this.nukes.group, this.spawner.obstacles, (nukeObj, obstacleObj) => {
      const nuke = nukeObj as Phaser.Physics.Arcade.Sprite;
      if (!nuke.active || !(obstacleObj as Obstacle).active) return;
      this.nukes.detonate(nuke);
    });

    this.physics.add.overlap(this.ricochets.group, this.spawner.targets, (rObj, targetObj) => {
      const bullet = rObj as Phaser.Physics.Arcade.Sprite;
      const target = targetObj as Target;
      if (!bullet.active || !target.active) return;
      // Pierces — the bounce laser is not deactivated here, only the target it hit.
      this.killTarget(target);
    });
    this.physics.add.overlap(this.homings.group, this.spawner.targets, (hObj, targetObj) => {
      const missile = hObj as Phaser.Physics.Arcade.Sprite;
      const target = targetObj as Target;
      if (!missile.active || !target.active) return;
      const level = (missile.getData('level') as number) ?? 1;
      const hitX = missile.x;
      const hitY = missile.y;
      this.homings.deactivate(missile);
      this.killTarget(target);
      this.homingSplash(hitX, hitY, false, level);
    });

    // Boss: player weapons hit the boss. Boss-vs-player overlaps are wired per-rig in
    // wireRigCollisions() instead, since those need to know which player got hit.
    //
    // These overlaps pair a pooled Group with a single Sprite (the boss). Phaser's Arcade
    // overlap dispatch can deliver the two callback arguments in either order for that
    // shape (observed empirically, not just in theory), so we can't assume "first arg to
    // overlap() = first callback param". Instead we identify the boss by reference and
    // treat whichever object is NOT the boss as the projectile.
    const pickProjectile = (a: unknown, b: unknown) => (a === this.bossManager.boss ? b : a) as Phaser.Physics.Arcade.Sprite;

    this.physics.add.overlap(this.bullets.group, this.bossManager.boss, (a, b) => {
      const bullet = pickProjectile(a, b);
      if (!bullet.active || !this.bossManager.boss.active) return;
      const level = (bullet.getData('level') as number) ?? 1;
      this.bullets.deactivate(bullet);
      this.damageBoss(scaleDamage(BULLET_DAMAGE_TO_BOSS, level));
    });
    this.physics.add.overlap(this.lasers.group, this.bossManager.boss, (a, b) => {
      const laser = pickProjectile(a, b);
      if (!laser.active || !this.bossManager.boss.active) return;
      const level = (laser.getData('level') as number) ?? 1;
      this.damageBoss(scaleDamage(LASER_DAMAGE_TO_BOSS, level));
    });
    this.physics.add.overlap(this.nukes.group, this.bossManager.boss, (a, b) => {
      const nuke = pickProjectile(a, b);
      if (!nuke.active || !this.bossManager.boss.active) return;
      this.nukes.detonate(nuke);
    });
    this.physics.add.overlap(this.ricochets.group, this.bossManager.boss, (a, b) => {
      const bullet = pickProjectile(a, b);
      if (!bullet.active || !this.bossManager.boss.active) return;
      const level = (bullet.getData('level') as number) ?? 1;
      this.ricochets.deactivate(bullet);
      this.damageBoss(scaleDamage(RICOCHET_DAMAGE_TO_BOSS, level));
    });
    this.physics.add.overlap(this.homings.group, this.bossManager.boss, (a, b) => {
      const missile = pickProjectile(a, b);
      if (!missile.active || !this.bossManager.boss.active) return;
      const level = (missile.getData('level') as number) ?? 1;
      const hitX = missile.x;
      const hitY = missile.y;
      this.homings.deactivate(missile);
      this.damageBoss(scaleDamage(HOMING_DAMAGE_TO_BOSS, level));
      this.homingSplash(hitX, hitY, true, level);
    });
  }

  private updateAuthority(delta: number): void {
    this.starfield.update(this.spawner.scrollSpeed, delta);

    const localRig = this.rigs.get(LOCAL_RIG_ID)!;
    const localInput = this.gatherLocalInput();
    localRig.moveX = localInput.moveX;
    localRig.moveY = localInput.moveY;
    localRig.firing = localInput.firing;

    this.rigs.forEach((rig) => {
      if (rig.player.health > 0) rig.player.setMoveVector(rig.moveX, rig.moveY);
      else rig.player.setVelocity(0, 0);
    });

    this.spawner.update(delta);

    const aim = this.nearestAliveRigPosition(this.bossManager.boss.x, this.bossManager.boss.y);
    this.bossManager.update(aim.x, aim.y);

    this.rigs.forEach((rig) => this.handleFiringForRig(rig));

    this.bullets.update();
    this.lasers.update();
    this.nukes.update();
    this.ricochets.update();
    this.homings.update(delta);

    this.rigs.forEach((rig) => {
      const bossTarget = this.bossManager.active ? this.bossManager.boss : null;
      rig.aimAssist.findLock(rig.player.x, rig.player.y, this.spawner.targets, bossTarget);
      if (rig.isLocal) rig.aimAssist.updateIndicator();
      rig.player.clampToBounds();
      rig.player.syncShieldVisual();
    });

    if (this.session && this.time.now >= this.nextSnapshotAt) {
      this.nextSnapshotAt = this.time.now + SNAPSHOT_INTERVAL_MS;
      this.session.broadcastSnapshot(this.buildSnapshot(false));
    }
  }

  private gatherLocalInput(): NetInput {
    let dx = InputState.moveX;
    let dy = InputState.moveY;

    const kx = (this.cursors.right?.isDown || this.wasd.d.isDown ? 1 : 0) - (this.cursors.left?.isDown || this.wasd.a.isDown ? 1 : 0);
    const ky = (this.cursors.down?.isDown || this.wasd.s.isDown ? 1 : 0) - (this.cursors.up?.isDown || this.wasd.w.isDown ? 1 : 0);

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky) || 1;
      dx = kx / len;
      dy = ky / len;
    }

    return { moveX: dx, moveY: dy, firing: InputState.firing || this.spaceKey.isDown };
  }

  private nearestAliveRigPosition(originX: number, originY: number): { x: number; y: number } {
    let best: Rig | null = null;
    let bestDist = Infinity;
    this.rigs.forEach((rig) => {
      if (rig.player.health <= 0) return;
      const d = Phaser.Math.Distance.Between(originX, originY, rig.player.x, rig.player.y);
      if (d < bestDist) {
        bestDist = d;
        best = rig;
      }
    });
    const target = best ?? this.rigs.get(LOCAL_RIG_ID)!;
    return { x: target.player.x, y: target.player.y };
  }

  private handleFiringForRig(rig: Rig): void {
    if (!rig.firing || rig.player.health <= 0) return;

    const originX = rig.player.x + 20;
    const originY = rig.player.y;
    const lock = rig.aimAssist.current;

    if (rig.currentPlane === 'default') {
      rig.weaponSystem.tryFire(originX, originY, lock?.x ?? null, lock?.y ?? null);
      return;
    }

    if (rig.currentPlane === 'ricochet') {
      if (this.time.now >= rig.nextRicochetFireAt) {
        rig.nextRicochetFireAt = this.time.now + RICOCHET_FIRE_COOLDOWN_MS;
        this.ricochets.fireSpread(rig.ricochetLevel, originX, originY, lock?.x ?? null, lock?.y ?? null);
        if (rig.isLocal) this.sfx.shoot();
      }
    } else {
      // homing
      if (this.time.now >= rig.nextHomingFireAt) {
        rig.nextHomingFireAt = this.time.now + HOMING_FIRE_COOLDOWN_MS;
        const bossTarget = this.bossManager.active ? this.bossManager.boss : null;
        this.homings.fireSpread(rig.homingLevel, originX, originY, this.spawner.targets, bossTarget);
        if (rig.isLocal) this.sfx.laser();
      }
    }

    const nukeLevel = rig.currentPlane === 'ricochet' ? rig.ricochetNukeLevel : rig.homingNukeLevel;
    if (nukeLevel > 0 && this.time.now >= rig.nextSpecialNukeFireAt) {
      rig.nextSpecialNukeFireAt = this.time.now + SPECIAL_NUKE_FIRE_COOLDOWN_MS;
      this.nukes.fireSpread(nukeLevel, originX, originY, lock?.x ?? null, lock?.y ?? null, SPECIAL_NUKE_TINTS);
      if (rig.isLocal) this.sfx.nuke();
    }
  }

  private weaponLevelsFor(rig: Rig): Record<string, number> {
    if (rig.currentPlane === 'default') {
      return { bullet: rig.weaponSystem.bulletLevel, laser: rig.weaponSystem.laserLevel, nuke: rig.weaponSystem.nukeLevel };
    }
    if (rig.currentPlane === 'ricochet') return { ricochet: rig.ricochetLevel, nuke: rig.ricochetNukeLevel };
    return { homing: rig.homingLevel, nuke: rig.homingNukeLevel };
  }

  /** Every pickup type is uncapped now, so every single one always applies — no more "already maxed, give bonus score instead" fallback needed. */
  private handlePickup(rig: Rig, type: PickupType): void {
    if (rig.isLocal) this.sfx.pickup();

    if (type === 'heart') {
      rig.player.heal();
      if (rig.isLocal) GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: rig.player.health, maxHealth: rig.player.maxHealth });
    } else if (type === 'shield') {
      rig.player.addShield();
      if (rig.isLocal) GameEvents.emit(EVENTS.SHIELD_CHANGED, rig.player.shieldCharges);
    } else if (rig.currentPlane === 'default') {
      rig.weaponSystem.upgrade(type);
      if (rig.isLocal) GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevelsFor(rig));
    } else {
      this.upgradePlaneWeapon(rig, type, rig.currentPlane);
    }
  }

  /** Bullet/laser pickups boost the plane's primary weapon; nuke pickups boost its shared colorful nuke. */
  private upgradePlaneWeapon(rig: Rig, type: PickupType, plane: 'ricochet' | 'homing'): void {
    if (type === 'nuke') {
      if (plane === 'ricochet') rig.ricochetNukeLevel++;
      else rig.homingNukeLevel++;
    } else {
      if (plane === 'ricochet') rig.ricochetLevel++;
      else rig.homingLevel++;
    }
    if (rig.isLocal) GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevelsFor(rig));
  }

  /** Only the local rig can switch planes — there's no networked "plane select" request yet, so remote rigs always stay on 'default' (see the Rig interface doc comment). */
  private handlePlaneSelect(planeId: PlaneId): void {
    if (!this.isAuthority) return;
    const rig = this.rigs.get(LOCAL_RIG_ID);
    if (!rig || planeId === rig.currentPlane) return;

    const config = getPlane(planeId);
    if (getMaxBossKills() < config.unlockBossKills) return;

    rig.currentPlane = planeId;
    rig.player.setPlane(config.shipTexture);
    GameEvents.emit(EVENTS.PLANE_CHANGED, planeId);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevelsFor(rig));
  }

  /** A run ends the moment any one player's health hits zero — a deliberately simple v1 co-op rule (no "downed but teammates carry on" state yet). */
  private applyDamageToRig(rig: Rig): void {
    const result = rig.player.takeDamage();
    if (result === 'none') return;

    if (rig.isLocal) this.sfx.damage();
    if (result === 'shield') {
      if (rig.isLocal) GameEvents.emit(EVENTS.SHIELD_CHANGED, rig.player.shieldCharges);
      return;
    }

    if (rig.isLocal) GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: rig.player.health, maxHealth: rig.player.maxHealth });
    if (rig.player.health <= 0) this.triggerGameOver();
  }

  private killTarget(target: Target): void {
    this.explosion.playSmall(target.x, target.y);
    this.sfx.hit();
    target.deactivate();
    this.score += 10;
    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
  }

  private recordBossDefeat(): void {
    this.bossKillsThisRun++;
    recordBossKills(this.bossKillsThisRun);
  }

  private damageBoss(amount: number): void {
    const defeated = this.bossManager.boss.takeDamage(amount);
    if (!defeated) return;

    this.explosion.playBig(this.bossManager.boss.x, this.bossManager.boss.y, NUKE_EXPLOSION_RADIUS);
    this.sfx.nuke();
    this.score += BOSS_DEFEAT_SCORE;
    this.recordBossDefeat();
    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    this.bossManager.defeatBoss();
  }

  private handleNukeDetonate(x: number, y: number, level: number): void {
    this.sfx.nuke();
    this.explosion.playBig(x, y, NUKE_EXPLOSION_RADIUS);

    let scoreGained = 0;
    this.spawner.targets.getChildren().forEach((obj) => {
      const target = obj as Target;
      if (target.active && Phaser.Math.Distance.Between(x, y, target.x, target.y) <= NUKE_EXPLOSION_RADIUS) {
        target.deactivate();
        scoreGained += 10;
      }
    });
    this.spawner.obstacles.getChildren().forEach((obj) => {
      const obstacle = obj as Obstacle;
      if (obstacle.active && Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y) <= NUKE_EXPLOSION_RADIUS) {
        obstacle.deactivate();
      }
    });

    if (this.bossManager.active && this.bossManager.boss.active) {
      const dist = Phaser.Math.Distance.Between(x, y, this.bossManager.boss.x, this.bossManager.boss.y);
      if (dist <= NUKE_EXPLOSION_RADIUS) {
        const defeated = this.bossManager.boss.takeDamage(scaleDamage(NUKE_DAMAGE_TO_BOSS, level));
        if (defeated) {
          scoreGained += BOSS_DEFEAT_SCORE;
          this.recordBossDefeat();
          this.bossManager.defeatBoss();
        }
      }
    }

    if (scoreGained > 0) {
      this.score += scoreGained;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    }
  }

  /** Small blast radius on every homing missile impact — clears nearby chaff and chips extra boss damage. `hitBoss` is true when the primary hit already damaged the boss, so it isn't hit twice. */
  private homingSplash(x: number, y: number, hitBoss: boolean, level: number): void {
    this.explosion.playSmall(x, y);

    let scoreGained = 0;
    this.spawner.targets.getChildren().forEach((obj) => {
      const target = obj as Target;
      if (target.active && Phaser.Math.Distance.Between(x, y, target.x, target.y) <= HOMING_EXPLOSION_RADIUS) {
        target.deactivate();
        scoreGained += 10;
      }
    });
    this.spawner.obstacles.getChildren().forEach((obj) => {
      const obstacle = obj as Obstacle;
      if (obstacle.active && Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y) <= HOMING_EXPLOSION_RADIUS) {
        obstacle.deactivate();
      }
    });

    if (!hitBoss && this.bossManager.active && this.bossManager.boss.active) {
      const dist = Phaser.Math.Distance.Between(x, y, this.bossManager.boss.x, this.bossManager.boss.y);
      if (dist <= HOMING_EXPLOSION_RADIUS) this.damageBoss(scaleDamage(HOMING_SPLASH_DAMAGE_TO_BOSS, level));
    }

    if (scoreGained > 0) {
      this.score += scoreGained;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    }
  }

  /** Full-screen "ultimate" nuke — available to every plane regardless of loadout, and a
   * shared team cooldown (not per-player). Guarded by scene.isPaused() because this is
   * event-driven (from a UI tap, key press, or network request), not polled from update(),
   * so a paused GameScene wouldn't otherwise stop it from firing. */
  private handleUltimateRequest(): void {
    if (this.gameOver || this.scene.isPaused()) return;

    if (!this.isAuthority) {
      // Clients have no local world to blast — the host is the one that actually resolves
      // this and its next snapshot carries the updated cooldown back for our own HUD.
      this.session?.sendUltimateRequest();
      return;
    }

    if (this.time.now < this.ultimateReadyAt) return;

    this.ultimateReadyAt = this.time.now + ULTIMATE_COOLDOWN_MS;
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
    this.triggerUltimate();
  }

  private triggerUltimate(): void {
    this.sfx.nuke();
    this.cameras.main.flash(260, 255, 224, 102);
    this.cameras.main.shake(320, 0.01);
    this.explosion.playBig(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.6);

    let scoreGained = 0;
    this.spawner.targets.getChildren().forEach((obj) => {
      const target = obj as Target;
      if (target.active) {
        target.deactivate();
        scoreGained += 10;
      }
    });
    this.spawner.obstacles.getChildren().forEach((obj) => {
      const obstacle = obj as Obstacle;
      if (obstacle.active) obstacle.deactivate();
    });

    if (this.bossManager.active && this.bossManager.boss.active) {
      this.damageBoss(ULTIMATE_BOSS_DAMAGE);
    }

    if (scoreGained > 0) {
      this.score += scoreGained;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    }
  }

  private buildSnapshot(gameOverFlag: boolean): GameSnapshot {
    const players: GameSnapshot['players'] = {};
    this.rigs.forEach((rig, id) => {
      const key = id === LOCAL_RIG_ID ? getLocalPeerId() : id;
      players[key] = {
        x: rig.player.x,
        y: rig.player.y,
        health: rig.player.health,
        maxHealth: rig.player.maxHealth,
        shieldCharges: rig.player.shieldCharges,
        bulletLevel: rig.weaponSystem.bulletLevel,
        laserLevel: rig.weaponSystem.laserLevel,
        nukeLevel: rig.weaponSystem.nukeLevel
      };
    });

    return {
      score: this.score,
      gameOver: gameOverFlag,
      bossKillsThisRun: this.bossKillsThisRun,
      ultimateReadyAt: this.ultimateReadyAt,
      players,
      targets: snapGroup(this.spawner.targets),
      obstacles: this.spawner.obstacles.getChildren().map((o) => {
        const obstacle = o as Obstacle;
        return { active: obstacle.active, x: obstacle.x, y: obstacle.y, big: obstacle.big };
      }),
      pickups: this.spawner.pickups.getChildren().map((p) => {
        const pickup = p as Pickup;
        return { active: pickup.active, x: pickup.x, y: pickup.y, type: pickup.pickupType };
      }),
      boss:
        this.bossManager.active && this.bossManager.boss.active
          ? {
              x: this.bossManager.boss.x,
              y: this.bossManager.boss.y,
              health: this.bossManager.boss.health,
              maxHealth: this.bossManager.boss.maxHealth
            }
          : null,
      bossBullets: snapGroup(this.bossManager.bulletPool.group)
    };
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.rigs.forEach((rig) => rig.player.setVelocity(0, 0));
    this.sfx.gameOver();
    this.music.play('music_gameover', false, 0.4);
    recordRunScore(this.score);
    const profile = getActiveProfile();
    if (profile) submitScore(profile);
    GameEvents.emit(EVENTS.GAME_OVER, this.score);

    // Push the final state immediately rather than waiting for the next periodic tick, so clients stop in sync with the host.
    if (this.session) this.session.broadcastSnapshot(this.buildSnapshot(true));
  }

  private restart(): void {
    if (!this.isAuthority) {
      // A client has no local simulation to reset — cleanly return to the start screen so it can rejoin (or start) a room.
      location.reload();
      return;
    }

    this.score = 0;
    this.gameOver = false;
    this.music.play('music_normal');
    this.bossKillsThisRun = 0;
    this.ultimateReadyAt = 0;

    this.rigs.forEach((rig) => {
      rig.currentPlane = 'default';
      rig.ricochetLevel = 1;
      rig.homingLevel = 1;
      rig.ricochetNukeLevel = 0;
      rig.homingNukeLevel = 0;
      rig.nextRicochetFireAt = 0;
      rig.nextHomingFireAt = 0;
      rig.nextSpecialNukeFireAt = 0;
      rig.moveX = 0;
      rig.moveY = 0;
      rig.firing = false;
      rig.player.reset();
      rig.player.setPosition(PLAYER_START_X, rig.startY);
      rig.player.setPlane(getPlane('default').shipTexture);
      rig.weaponSystem.reset();
    });

    this.spawner.reset();
    this.bullets.reset();
    this.lasers.reset();
    this.nukes.reset();
    this.ricochets.reset();
    this.homings.reset();
    this.bossManager.reset();

    const localRig = this.rigs.get(LOCAL_RIG_ID)!;
    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: localRig.player.health, maxHealth: localRig.player.maxHealth });
    GameEvents.emit(EVENTS.SHIELD_CHANGED, localRig.player.shieldCharges);
    GameEvents.emit(EVENTS.PLANE_CHANGED, localRig.currentPlane);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevelsFor(localRig));
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
  }

  // ==================================== Client (non-host) ====================================

  /** No local physics simulation of the shared world at all — just a responsive local ship
   * plus its own cosmetic weapon-fire visuals (see WeaponSystem docs on GhostRenderer for
   * why bullets don't need syncing from the host), and a GhostRenderer mirroring
   * everything else (enemies/pickups/boss/teammates) from the host's snapshots. */
  private createClientWorld(): void {
    this.explosion = new Explosion(this);
    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.clientSfx = this.sfx;
    this.clientMusic = this.music;
    this.music.play('music_normal');

    this.clientPlayer = new Player(this);
    this.clientBullets = new BulletPool(this);
    this.clientLasers = new LaserPool(this);
    this.clientNukes = new NukePool(this);
    this.clientWeaponSystem = new WeaponSystem(this, this.clientBullets, this.clientLasers, this.clientNukes, this.sfx);

    this.ghosts = new GhostRenderer(this);

    if (this.session) {
      this.session.onSnapshot = (snap) => this.applyClientSnapshot(snap);
    }

    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: this.clientPlayer.health, maxHealth: this.clientPlayer.maxHealth });
    GameEvents.emit(EVENTS.SHIELD_CHANGED, this.clientPlayer.shieldCharges);
    GameEvents.emit(EVENTS.PLANE_CHANGED, 'default');
    GameEvents.emit(EVENTS.WEAPON_CHANGED, { bullet: 1, laser: 0, nuke: 0 });
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
  }

  private updateClient(delta: number): void {
    this.starfield.update(CLIENT_STARFIELD_SCROLL_SPEED, delta);
    // Snapshots only arrive every SNAPSHOT_INTERVAL_MS-ish over the network — easing every
    // ghost toward its latest known position each frame (rather than only moving them when
    // a snapshot lands) is what turns that into smooth motion instead of visible teleports.
    //
    // Phaser's game loop re-arms its own requestAnimationFrame at the end of each step, so
    // an uncaught throw anywhere in here doesn't just skip a frame — it can stop the loop
    // from ever ticking again, which reads as the whole game (including the player's own
    // ship) freezing solid. This is network-adjacent code (ghost state ultimately comes from
    // another peer), so it gets a safety net the purely-local solo/host path doesn't need.
    try {
      this.ghosts?.tick(delta);
    } catch (err) {
      console.warn('[client] ghost tick failed', err);
    }

    const input = this.gatherLocalInput();
    this.clientPlayer!.setMoveVector(input.moveX, input.moveY);
    this.clientPlayer!.clampToBounds();
    this.clientPlayer!.syncShieldVisual();

    if (this.session && this.time.now >= this.nextInputSendAt) {
      this.nextInputSendAt = this.time.now + INPUT_SEND_INTERVAL_MS;
      this.session.sendInput(input);
    }

    // Cosmetic-only: this client never resolves hits locally, so firing straight ahead
    // (no aim-assist target) is fine — the host's own copy of this rig is what actually
    // decides what dies.
    if (input.firing) {
      this.clientWeaponSystem!.tryFire(this.clientPlayer!.x + 20, this.clientPlayer!.y, null, null);
    }
    this.clientBullets!.update();
    this.clientLasers!.update();
    this.clientNukes!.update();
  }

  /** Runs from Trystero's own message-delivery callback, not from Phaser's update() loop —
   * but it's still fed data from another peer's browser (which, thanks to the PWA's
   * background auto-update, could in principle be running a slightly different build than
   * this one), so the same "don't let one bad packet wedge the client" caution applies. */
  private applyClientSnapshot(snap: GameSnapshot): void {
    try {
      this.score = snap.score;
      this.clientBossKillsThisRun = snap.bossKillsThisRun;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);

      if (typeof snap.ultimateReadyAt === 'number' && snap.ultimateReadyAt !== this.ultimateReadyAt) {
        this.ultimateReadyAt = snap.ultimateReadyAt;
        GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
      }

      this.ghosts?.apply(snap, getLocalPeerId());

      const mine = snap.players[getLocalPeerId()];
      if (mine) {
        GameEvents.emit(EVENTS.HEALTH_CHANGED, { health: mine.health, maxHealth: mine.maxHealth });
        GameEvents.emit(EVENTS.SHIELD_CHANGED, mine.shieldCharges);
        this.clientWeaponSystem!.bulletLevel = mine.bulletLevel;
        this.clientWeaponSystem!.laserLevel = mine.laserLevel;
        this.clientWeaponSystem!.nukeLevel = mine.nukeLevel;
        GameEvents.emit(EVENTS.WEAPON_CHANGED, { bullet: mine.bulletLevel, laser: mine.laserLevel, nuke: mine.nukeLevel });
      }

      if (snap.gameOver && !this.gameOver) this.triggerClientGameOver();
    } catch (err) {
      console.warn('[client] failed to apply snapshot', err);
    }
  }

  private triggerClientGameOver(): void {
    this.gameOver = true;
    this.clientPlayer?.setVelocity(0, 0);
    this.clientSfx?.gameOver();
    this.clientMusic?.play('music_gameover', false, 0.4);
    recordRunScore(this.score);
    recordBossKills(this.clientBossKillsThisRun);
    const profile = getActiveProfile();
    if (profile) submitScore(profile);
    GameEvents.emit(EVENTS.GAME_OVER, this.score);
  }
}
