import { joinRoom, selfId, Room } from '@trystero-p2p/firebase';
import { firebaseApp } from '../config/firebase';
import { MAX_PLAYERS, TRYSTERO_FIREBASE_APP_ID, TRYSTERO_ROOM_PREFIX } from '../config/constants';

interface TypedAction<T> {
  send(data: T, opts?: { target?: string | string[] }): Promise<void>;
  onMessage: ((data: T, meta: { peerId: string }) => void) | null;
}

/** The local player's slot key inside GameScene's rig map — deliberately not `selfId`, so
 * solo mode (no Trystero session at all) can use the exact same map-keyed code path. */
export const LOCAL_RIG_ID = '__local__';

// STUN alone (Trystero's default) only establishes a direct peer connection when both
// sides have "easy" NAT — it silently fails for common real-world cases like one phone on
// mobile-carrier NAT, leaving peers stuck never discovering each other with no error
// surfaced anywhere. These are the Open Relay Project's (openrelay.metered.ca) public
// credentials — a well-known free TURN relay with no signup, widely used for exactly this
// prototyping case; not a secret, safe to ship in the client bundle. Best-effort/no SLA, so
// this isn't a guarantee, just a meaningfully better success rate than STUN-only.
const TURN_SERVERS = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

export interface NetInput {
  moveX: number;
  moveY: number;
  firing: boolean;
}

export interface EntitySnap {
  x: number;
  y: number;
}

export interface ObstacleSnap extends EntitySnap {
  big: boolean;
}

export interface PickupSnap extends EntitySnap {
  type: string;
}

export interface PlayerSnap {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  shieldCharges: number;
  bulletLevel: number;
  laserLevel: number;
  nukeLevel: number;
}

export interface BossSnap {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

export interface GameSnapshot {
  score: number;
  gameOver: boolean;
  bossKillsThisRun: number;
  /** Shared team cooldown, same as solo — any player triggering it charges it for everyone. */
  ultimateReadyAt: number;
  players: Record<string, PlayerSnap>;
  // Fixed-length, one entry per pool slot (null where that slot is currently inactive) —
  // NOT compacted down to just the active ones. Array index is the only identity a client
  // has for "which real object is this" across successive snapshots; if inactive slots were
  // filtered out, every spawn/despawn elsewhere in the pool would shift every later index,
  // and the client would smoothly ease each ghost toward what is actually a *different*
  // real object's position — read as enemies/pickups flying erratically around the screen.
  targets: (EntitySnap | null)[];
  obstacles: (ObstacleSnap | null)[];
  pickups: (PickupSnap | null)[];
  boss: BossSnap | null;
  bossBullets: (EntitySnap | null)[];
}

/** One Trystero room for one co-op run. The room creator is host (an app-level convention —
 * Trystero itself has no concept of a host, every peer is equal). The host runs the exact
 * single-player simulation, just iterated over every connected player's rig; everyone else
 * is a "client" that only sends input and renders from the host's broadcast snapshots. */
export class MultiplayerSession {
  readonly room: Room;
  readonly isHost: boolean;
  readonly roomCode: string;
  peerIds: string[] = [];

  onPeerJoin: ((peerId: string) => void) | null = null;
  onPeerLeave: ((peerId: string) => void) | null = null;
  onInput: ((peerId: string, input: NetInput) => void) | null = null;
  onSnapshot: ((snap: GameSnapshot) => void) | null = null;
  onStart: ((roster: string[]) => void) | null = null;
  /** Host-side only: fires when any client asks to trigger the shared ultimate. */
  onUltimateRequest: ((peerId: string) => void) | null = null;

  private inputAction: TypedAction<NetInput>;
  private snapshotAction: TypedAction<GameSnapshot>;
  private startAction: TypedAction<string[]>;
  private ultimateAction: TypedAction<null>;

  constructor(roomCode: string, isHost: boolean) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    // Reuse the same Firebase app instance the leaderboard already initialized — letting
    // Trystero call its own initializeApp() here throws "Firebase App named '[DEFAULT]'
    // already exists", since both features share one Firebase project by design.
    this.room = joinRoom(
      { appId: TRYSTERO_FIREBASE_APP_ID, relayConfig: { firebaseApp }, turnConfig: TURN_SERVERS },
      TRYSTERO_ROOM_PREFIX + roomCode
    );

    // makeAction()'s generic requires an index-signature-bearing payload type (Trystero's
    // DataPayload), which plain interfaces like NetInput/GameSnapshot don't structurally
    // satisfy even though every field they carry is JSON-safe — cast to a narrower local
    // shape instead of loosening the public types just to please that constraint.
    this.inputAction = this.room.makeAction('input') as unknown as TypedAction<NetInput>;
    this.snapshotAction = this.room.makeAction('snap') as unknown as TypedAction<GameSnapshot>;
    this.startAction = this.room.makeAction('start') as unknown as TypedAction<string[]>;
    this.ultimateAction = this.room.makeAction('ult') as unknown as TypedAction<null>;

    this.room.onPeerJoin = (peerId) => {
      if (!this.peerIds.includes(peerId)) this.peerIds.push(peerId);
      this.onPeerJoin?.(peerId);
    };
    this.room.onPeerLeave = (peerId) => {
      this.peerIds = this.peerIds.filter((id) => id !== peerId);
      this.onPeerLeave?.(peerId);
    };
    this.inputAction.onMessage = (data, { peerId }) => this.onInput?.(peerId, data);
    this.snapshotAction.onMessage = (data) => this.onSnapshot?.(data);
    this.startAction.onMessage = (roster) => this.onStart?.(roster);
    this.ultimateAction.onMessage = (_data, { peerId }) => this.onUltimateRequest?.(peerId);
  }

  /** Capped at MAX_PLAYERS purely for the difficulty table's range — Trystero itself doesn't enforce a room size limit. */
  get playerCount(): number {
    return Math.min(MAX_PLAYERS, this.peerIds.length + 1);
  }

  sendInput(input: NetInput): void {
    this.inputAction.send(input);
  }

  broadcastSnapshot(snap: GameSnapshot): void {
    this.snapshotAction.send(snap);
  }

  /** Client-side only: asks the host to trigger the shared ultimate on its behalf — a client has no local world to resolve it against itself. */
  sendUltimateRequest(): void {
    this.ultimateAction.send(null);
  }

  broadcastStart(roster: string[]): void {
    this.startAction.send(roster);
  }

  leave(): void {
    this.room.leave();
  }
}

export function getLocalPeerId(): string {
  return selfId;
}

export function generateRoomCode(): string {
  // Excludes visually-confusable characters (0/O, 1/I) since this gets read aloud/typed by hand.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
