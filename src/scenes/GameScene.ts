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
  NUKE_EXPLOSION_RADIUS,
  PICKUP_MAXED_BONUS_SCORE,
  RICOCHET_DAMAGE_TO_BOSS,
  RICOCHET_FIRE_COOLDOWN_MS,
  HOMING_DAMAGE_TO_BOSS,
  SPECIAL_NUKE_FIRE_COOLDOWN_MS,
  SPECIAL_NUKE_TINTS,
  ULTIMATE_BOSS_DAMAGE,
  ULTIMATE_COOLDOWN_MS,
  WEAPON_LEVEL_MAX
} from '../config/constants';

const BULLET_DAMAGE_TO_BOSS = 4;
const LASER_DAMAGE_TO_BOSS = 6;
const NUKE_DAMAGE_TO_BOSS = 20;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private spawner!: Spawner;
  private aimAssist!: AimAssist;
  private bullets!: BulletPool;
  private lasers!: LaserPool;
  private nukes!: NukePool;
  private ricochets!: RicochetPool;
  private homings!: HomingPool;
  private explosion!: Explosion;
  private sfx!: Sfx;
  private music!: Music;
  private weaponSystem!: WeaponSystem;
  private bossManager!: BossManager;
  private starfield!: Starfield;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private score = 0;
  private gameOver = false;

  private currentPlane: PlaneId = 'default';
  private ricochetLevel = 1;
  private homingLevel = 1;
  private ricochetNukeLevel = 0;
  private homingNukeLevel = 0;
  private nextRicochetFireAt = 0;
  private nextHomingFireAt = 0;
  private nextSpecialNukeFireAt = 0;
  private ultimateReadyAt = 0;
  private bossKillsThisRun = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.starfield = new Starfield(this);

    this.player = new Player(this);
    this.spawner = new Spawner(this);
    this.aimAssist = new AimAssist(this);
    this.bullets = new BulletPool(this);
    this.lasers = new LaserPool(this);
    this.nukes = new NukePool(this);
    this.ricochets = new RicochetPool(this);
    this.homings = new HomingPool(this);
    this.explosion = new Explosion(this);
    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.weaponSystem = new WeaponSystem(this, this.bullets, this.lasers, this.nukes, this.sfx);
    this.bossManager = new BossManager(this, this.spawner);
    this.nukes.onDetonate = (x, y) => this.handleNukeDetonate(x, y);
    this.bossManager.onBossStart = () => this.music.play('music_boss');
    this.bossManager.onBossEnd = () => this.music.play('music_normal');
    this.music.play('music_normal');

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard!.addKey('W'),
      a: this.input.keyboard!.addKey('A'),
      s: this.input.keyboard!.addKey('S'),
      d: this.input.keyboard!.addKey('D')
    };
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.physics.add.overlap(this.player, this.spawner.obstacles, (_p, obj) => {
      const obstacle = obj as Obstacle;
      if (!obstacle.active) return;
      obstacle.deactivate();
      this.applyDamageToPlayer();
    });

    this.physics.add.overlap(this.player, this.spawner.pickups, (_p, obj) => {
      const pickup = obj as Pickup;
      if (!pickup.active) return;
      pickup.deactivate();
      this.handlePickup(pickup.pickupType);
    });

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
      const hitX = missile.x;
      const hitY = missile.y;
      this.homings.deactivate(missile);
      this.killTarget(target);
      this.homingSplash(hitX, hitY, false);
    });

    // Boss: player weapons hit the boss; the boss's own bullets/body hurt the player.
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
      this.bullets.deactivate(bullet);
      this.damageBoss(BULLET_DAMAGE_TO_BOSS);
    });
    this.physics.add.overlap(this.lasers.group, this.bossManager.boss, (a, b) => {
      const laser = pickProjectile(a, b);
      if (!laser.active || !this.bossManager.boss.active) return;
      this.damageBoss(LASER_DAMAGE_TO_BOSS);
    });
    this.physics.add.overlap(this.nukes.group, this.bossManager.boss, (a, b) => {
      const nuke = pickProjectile(a, b);
      if (!nuke.active || !this.bossManager.boss.active) return;
      this.nukes.detonate(nuke);
    });
    this.physics.add.overlap(this.ricochets.group, this.bossManager.boss, (a, b) => {
      const bullet = pickProjectile(a, b);
      if (!bullet.active || !this.bossManager.boss.active) return;
      this.ricochets.deactivate(bullet);
      this.damageBoss(RICOCHET_DAMAGE_TO_BOSS);
    });
    this.physics.add.overlap(this.homings.group, this.bossManager.boss, (a, b) => {
      const missile = pickProjectile(a, b);
      if (!missile.active || !this.bossManager.boss.active) return;
      const hitX = missile.x;
      const hitY = missile.y;
      this.homings.deactivate(missile);
      this.damageBoss(HOMING_DAMAGE_TO_BOSS);
      this.homingSplash(hitX, hitY, true);
    });
    this.physics.add.overlap(this.player, this.bossManager.boss, () => {
      if (!this.bossManager.boss.active) return;
      this.applyDamageToPlayer();
    });
    this.physics.add.overlap(this.player, this.bossManager.bulletPool.group, (a: unknown, b: unknown) => {
      const bullet = (a === this.player ? b : a) as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return;
      this.bossManager.bulletPool.deactivate(bullet);
      this.applyDamageToPlayer();
    });

    GameEvents.on(EVENTS.RESTART_REQUESTED, this.restart, this);
    GameEvents.on(EVENTS.PLANE_SELECT_REQUESTED, this.handlePlaneSelect, this);
    GameEvents.on(EVENTS.ULTIMATE_REQUESTED, this.handleUltimateRequest, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      GameEvents.off(EVENTS.RESTART_REQUESTED, this.restart, this);
      GameEvents.off(EVENTS.PLANE_SELECT_REQUESTED, this.handlePlaneSelect, this);
      GameEvents.off(EVENTS.ULTIMATE_REQUESTED, this.handleUltimateRequest, this);
    });

    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    GameEvents.emit(EVENTS.HEALTH_CHANGED, this.player.health);
    GameEvents.emit(EVENTS.SHIELD_CHANGED, this.player.shieldCharges);
    GameEvents.emit(EVENTS.PLANE_CHANGED, this.currentPlane);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevels());
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);

    // Frozen behind UIScene's intro panel until the player dismisses it. create() only ever
    // runs once per page load (restart() re-runs the run, not this), so this only gates the
    // very first start, not subsequent restarts after death.
    this.scene.pause();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    this.starfield.update(this.spawner.scrollSpeed, delta);
    this.handleMovement();
    this.spawner.update(delta);
    this.bossManager.update(this.player.x, this.player.y);
    this.handleFiring();
    this.bullets.update();
    this.lasers.update();
    this.nukes.update();
    this.ricochets.update();
    this.homings.update(delta);

    const bossTarget = this.bossManager.active ? this.bossManager.boss : null;
    this.aimAssist.findLock(this.player.x, this.player.y, this.spawner.targets, bossTarget);
    this.aimAssist.updateIndicator();

    this.player.clampToBounds();
    this.player.syncShieldVisual();
  }

  private handleMovement(): void {
    let dx = InputState.moveX;
    let dy = InputState.moveY;

    const kx = (this.cursors.right?.isDown || this.wasd.d.isDown ? 1 : 0) - (this.cursors.left?.isDown || this.wasd.a.isDown ? 1 : 0);
    const ky = (this.cursors.down?.isDown || this.wasd.s.isDown ? 1 : 0) - (this.cursors.up?.isDown || this.wasd.w.isDown ? 1 : 0);

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky) || 1;
      dx = kx / len;
      dy = ky / len;
    }

    this.player.setMoveVector(dx, dy);
  }

  private handleFiring(): void {
    const firing = InputState.firing || this.spaceKey.isDown;
    if (!firing) return;

    const originX = this.player.x + 20;
    const originY = this.player.y;
    const lock = this.aimAssist.current;

    if (this.currentPlane === 'default') {
      this.weaponSystem.tryFire(originX, originY, lock?.x ?? null, lock?.y ?? null);
      return;
    }

    if (this.currentPlane === 'ricochet') {
      if (this.time.now >= this.nextRicochetFireAt) {
        this.nextRicochetFireAt = this.time.now + RICOCHET_FIRE_COOLDOWN_MS;
        this.ricochets.fireSpread(this.ricochetLevel, originX, originY, lock?.x ?? null, lock?.y ?? null);
        this.sfx.shoot();
      }
    } else {
      // homing
      if (this.time.now >= this.nextHomingFireAt) {
        this.nextHomingFireAt = this.time.now + HOMING_FIRE_COOLDOWN_MS;
        const bossTarget = this.bossManager.active ? this.bossManager.boss : null;
        this.homings.fireSpread(this.homingLevel, originX, originY, this.spawner.targets, bossTarget);
        this.sfx.laser();
      }
    }

    // Shared colorful nuke — available on both non-default planes once leveled via a nuke
    // pickup, on its own cooldown so it fires independently of the plane's primary weapon.
    const nukeLevel = this.currentPlane === 'ricochet' ? this.ricochetNukeLevel : this.homingNukeLevel;
    if (nukeLevel > 0 && this.time.now >= this.nextSpecialNukeFireAt) {
      this.nextSpecialNukeFireAt = this.time.now + SPECIAL_NUKE_FIRE_COOLDOWN_MS;
      this.nukes.fireSpread(nukeLevel, originX, originY, lock?.x ?? null, lock?.y ?? null, SPECIAL_NUKE_TINTS);
      this.sfx.nuke();
    }
  }

  private weaponLevels(): Record<string, number> {
    if (this.currentPlane === 'default') {
      return { bullet: this.weaponSystem.bulletLevel, laser: this.weaponSystem.laserLevel, nuke: this.weaponSystem.nukeLevel };
    }
    if (this.currentPlane === 'ricochet') return { ricochet: this.ricochetLevel, nuke: this.ricochetNukeLevel };
    return { homing: this.homingLevel, nuke: this.homingNukeLevel };
  }

  private handlePickup(type: PickupType): void {
    this.sfx.pickup();

    let applied: boolean;
    if (type === 'heart') {
      applied = this.player.heal();
      if (applied) GameEvents.emit(EVENTS.HEALTH_CHANGED, this.player.health);
    } else if (type === 'shield') {
      applied = this.player.addShield();
      if (applied) GameEvents.emit(EVENTS.SHIELD_CHANGED, this.player.shieldCharges);
    } else if (this.currentPlane === 'default') {
      applied = this.weaponSystem.upgrade(type);
      if (applied) GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevels());
    } else {
      applied = this.upgradePlaneWeapon(type, this.currentPlane);
    }

    if (!applied) {
      this.score += PICKUP_MAXED_BONUS_SCORE;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    }
  }

  /** Bullet/laser pickups boost the plane's primary weapon; nuke pickups boost its shared colorful nuke. Returns false if that slot is already maxed. */
  private upgradePlaneWeapon(type: PickupType, plane: 'ricochet' | 'homing'): boolean {
    if (type === 'nuke') {
      const level = plane === 'ricochet' ? this.ricochetNukeLevel : this.homingNukeLevel;
      if (level >= WEAPON_LEVEL_MAX) return false;
      if (plane === 'ricochet') this.ricochetNukeLevel++;
      else this.homingNukeLevel++;
    } else {
      const level = plane === 'ricochet' ? this.ricochetLevel : this.homingLevel;
      if (level >= WEAPON_LEVEL_MAX) return false;
      if (plane === 'ricochet') this.ricochetLevel++;
      else this.homingLevel++;
    }
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevels());
    return true;
  }

  private handlePlaneSelect(planeId: PlaneId): void {
    if (planeId === this.currentPlane) return;

    const config = getPlane(planeId);
    if (getMaxBossKills() < config.unlockBossKills) return;

    this.currentPlane = planeId;
    this.player.setPlane(config.shipTexture);
    GameEvents.emit(EVENTS.PLANE_CHANGED, planeId);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevels());
  }

  private applyDamageToPlayer(): void {
    const result = this.player.takeDamage();
    if (result === 'none') return;

    this.sfx.damage();
    if (result === 'shield') {
      GameEvents.emit(EVENTS.SHIELD_CHANGED, this.player.shieldCharges);
      return;
    }

    GameEvents.emit(EVENTS.HEALTH_CHANGED, this.player.health);
    if (this.player.health <= 0) this.triggerGameOver();
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

  private handleNukeDetonate(x: number, y: number): void {
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
        const defeated = this.bossManager.boss.takeDamage(NUKE_DAMAGE_TO_BOSS);
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
  private homingSplash(x: number, y: number, hitBoss: boolean): void {
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
      if (dist <= HOMING_EXPLOSION_RADIUS) this.damageBoss(HOMING_SPLASH_DAMAGE_TO_BOSS);
    }

    if (scoreGained > 0) {
      this.score += scoreGained;
      GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    }
  }

  /** Full-screen "ultimate" nuke — available to every plane, on its own fixed cooldown. Guarded by scene.isPaused() because this is event-driven (from a UI tap or key press), not polled from update(), so a paused GameScene wouldn't otherwise stop it from firing. */
  private handleUltimateRequest(): void {
    if (this.gameOver || this.scene.isPaused()) return;
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

  private triggerGameOver(): void {
    this.gameOver = true;
    this.player.setVelocity(0, 0);
    this.sfx.gameOver();
    this.music.play('music_gameover', false, 0.4);
    GameEvents.emit(EVENTS.GAME_OVER, this.score);
  }

  private restart(): void {
    this.score = 0;
    this.gameOver = false;
    this.music.play('music_normal');
    this.bossKillsThisRun = 0;
    this.currentPlane = 'default';
    this.ricochetLevel = 1;
    this.homingLevel = 1;
    this.ricochetNukeLevel = 0;
    this.homingNukeLevel = 0;
    this.nextRicochetFireAt = 0;
    this.nextHomingFireAt = 0;
    this.nextSpecialNukeFireAt = 0;
    this.ultimateReadyAt = 0;

    this.player.reset();
    this.player.setPlane(getPlane('default').shipTexture);
    this.spawner.reset();
    this.bullets.reset();
    this.lasers.reset();
    this.nukes.reset();
    this.ricochets.reset();
    this.homings.reset();
    this.weaponSystem.reset();
    this.bossManager.reset();

    GameEvents.emit(EVENTS.SCORE_CHANGED, this.score);
    GameEvents.emit(EVENTS.HEALTH_CHANGED, this.player.health);
    GameEvents.emit(EVENTS.SHIELD_CHANGED, this.player.shieldCharges);
    GameEvents.emit(EVENTS.PLANE_CHANGED, this.currentPlane);
    GameEvents.emit(EVENTS.WEAPON_CHANGED, this.weaponLevels());
    GameEvents.emit(EVENTS.ULTIMATE_STATE_CHANGED, this.ultimateReadyAt);
  }
}
