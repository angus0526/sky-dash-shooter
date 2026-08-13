import Phaser from 'phaser';
import { suppressGameKeyCapture } from './keyboardCaptureGuard';
import { generateRoomCode, getLocalPeerId, MultiplayerSession } from '../systems/Multiplayer';

/** HTML overlay shown right after the profile overlay: solo, or create/join a Trystero room and wait in a lobby until the host starts. Resolves with the session (null for solo). */
export function initRoomOverlay(game: Phaser.Game): Promise<MultiplayerSession | null> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('room-overlay');
    const stepChoice = document.getElementById('room-step-choice');
    const stepMultiChoice = document.getElementById('room-step-multi-choice');
    const stepLobby = document.getElementById('room-step-lobby');
    const soloBtn = document.getElementById('room-solo-btn');
    const multiBtn = document.getElementById('room-multi-btn');
    const backBtn = document.getElementById('room-back-btn');
    const createBtn = document.getElementById('room-create-btn');
    const joinBtn = document.getElementById('room-join-btn');
    const joinCodeInput = document.getElementById('room-join-code') as HTMLInputElement | null;
    const statusEl = document.getElementById('room-status');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const peerCountEl = document.getElementById('room-peer-count');
    const startBtn = document.getElementById('room-start-btn') as HTMLButtonElement | null;
    const lobbyStatus = document.getElementById('room-lobby-status');

    if (
      !overlay ||
      !stepChoice ||
      !stepMultiChoice ||
      !stepLobby ||
      !soloBtn ||
      !multiBtn ||
      !backBtn ||
      !createBtn ||
      !joinBtn ||
      !joinCodeInput ||
      !statusEl ||
      !roomCodeDisplay ||
      !peerCountEl ||
      !startBtn ||
      !lobbyStatus
    ) {
      resolve(null);
      return;
    }

    let session: MultiplayerSession | null = null;
    const releaseCapture = suppressGameKeyCapture(game);
    overlay.classList.add('visible');

    const showStep = (step: 'choice' | 'multi-choice' | 'lobby') => {
      stepChoice.style.display = step === 'choice' ? '' : 'none';
      stepMultiChoice.style.display = step === 'multi-choice' ? '' : 'none';
      stepLobby.style.display = step === 'lobby' ? '' : 'none';
    };
    showStep('choice');

    const finish = (result: MultiplayerSession | null) => {
      overlay.classList.remove('visible');
      releaseCapture();
      resolve(result);
    };

    soloBtn.addEventListener('click', () => finish(null));
    multiBtn.addEventListener('click', () => {
      statusEl.textContent = '';
      showStep('multi-choice');
    });
    backBtn.addEventListener('click', () => showStep('choice'));

    const updatePeerCount = () => {
      const friends = session?.peerIds.length ?? 0;
      peerCountEl.textContent = friends > 0 ? `目前 ${friends + 1} 人（${friends} 位朋友已加入）` : '目前 1 人，等待朋友加入...';
    };

    const enterLobby = (newSession: MultiplayerSession, code: string) => {
      session = newSession;
      showStep('lobby');
      roomCodeDisplay.textContent = code;
      updatePeerCount();
      session.onPeerJoin = updatePeerCount;
      session.onPeerLeave = updatePeerCount;

      if (session.isHost) {
        startBtn.style.display = '';
        startBtn.addEventListener('click', () => {
          const roster = [getLocalPeerId(), ...session!.peerIds];
          // Peer presence (onPeerJoin firing, the peer count going up) isn't necessarily the
          // same moment its WebRTC data channel is fully warmed up for sending — a single
          // send() right as the host clicks start can go out just ahead of that, and get
          // lost. Resending a few times over the next ~1.5s costs nothing (the client side
          // below just resolves once, so repeats are harmless) and covers that gap.
          [0, 400, 900, 1500].forEach((delayMs) => {
            setTimeout(() => session!.broadcastStart(roster), delayMs);
          });
          finish(session);
        });
      } else {
        lobbyStatus.textContent = '已連線，等待房主開始遊戲...';
        session.onStart = () => finish(session);

        // Pure UX safety net — this can't distinguish "host hasn't clicked start yet" from
        // "the start message got lost", so it only ever adds a hint, never gives up on its
        // own; the resend above is what actually mitigates the lost-message case.
        setTimeout(() => {
          if (!overlay.classList.contains('visible')) return;
          lobbyStatus.textContent = '已連線，等待房主開始遊戲...（等太久的話，可能是連線不穩，請房主重新整理頁面再建一次房間）';
        }, 10000);
      }
    };

    createBtn.addEventListener('click', () => {
      const code = generateRoomCode();
      enterLobby(new MultiplayerSession(code, true), code);
    });

    joinBtn.addEventListener('click', () => {
      const code = joinCodeInput.value.trim().toUpperCase();
      if (!code) {
        statusEl.textContent = '請輸入房號';
        return;
      }
      enterLobby(new MultiplayerSession(code, false), code);
    });
    joinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBtn.click();
    });
  });
}
