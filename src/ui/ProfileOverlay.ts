import Phaser from 'phaser';
import { suppressGameKeyCapture } from './keyboardCaptureGuard';
import {
  createProfile,
  decodeProfileCode,
  getActiveProfile,
  getProfileByName,
  PlayerProfile,
  setActiveProfile
} from '../systems/PlayerProfile';

/**
 * HTML overlay (not a Phaser scene) shown on top of the canvas at boot, mirroring the
 * existing #rotate-overlay pattern in index.html — text input is far more reliable as a
 * real DOM <input> than anything Phaser's canvas can offer. Resolves once a profile has
 * been picked so the caller can chain the next step (room selection, then the game itself).
 */
export function initProfileOverlay(game: Phaser.Game): Promise<PlayerProfile> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('profile-overlay');
    const nameInput = document.getElementById('profile-name') as HTMLInputElement | null;
    const codeInput = document.getElementById('profile-code') as HTMLInputElement | null;
    const startBtn = document.getElementById('profile-start');
    const statusText = document.getElementById('profile-status');
    if (!overlay || !nameInput || !codeInput || !startBtn || !statusText) {
      resolve(getActiveProfile() ?? createProfile('Guest'));
      return;
    }

    const existing = getActiveProfile();
    if (existing) nameInput.value = existing.name;

    const releaseCapture = suppressGameKeyCapture(game);
    overlay.classList.add('visible');
    nameInput.focus();

    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) {
        statusText.textContent = '請輸入姓名';
        return;
      }

      let profile: PlayerProfile;
      const code = codeInput.value.trim();
      if (code) {
        const decoded = decodeProfileCode(code);
        if (!decoded) {
          statusText.textContent = '代碼無效，請確認輸入正確';
          return;
        }
        decoded.name = name;
        profile = decoded;
      } else {
        profile = getProfileByName(name) ?? createProfile(name);
      }
      setActiveProfile(profile);

      overlay.classList.remove('visible');
      releaseCapture();
      resolve(profile);
    };

    startBtn.addEventListener('click', submit);
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  });
}
