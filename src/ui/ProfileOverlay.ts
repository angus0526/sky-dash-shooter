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

    const finish = (profile: PlayerProfile) => {
      overlay.classList.remove('visible');
      statusText.classList.remove('success');
      releaseCapture();
      resolve(profile);
    };

    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) {
        statusText.classList.remove('success');
        statusText.textContent = '請輸入姓名';
        return;
      }

      let profile: PlayerProfile;
      let restored = false;
      const code = codeInput.value.trim();
      if (code) {
        const decoded = decodeProfileCode(code);
        if (!decoded) {
          statusText.classList.remove('success');
          statusText.textContent = '代碼無效，請確認輸入正確';
          return;
        }
        decoded.name = name;
        profile = decoded;
        restored = true;
      } else {
        const existingLocal = getProfileByName(name);
        profile = existingLocal ?? createProfile(name);
        restored = !!existingLocal && (existingLocal.bestScore > 0 || existingLocal.maxBossKills > 0);
      }
      setActiveProfile(profile);

      // Silently proceeding straight into the game looks identical whether the restore
      // actually worked or not — surface what got restored for a moment before continuing,
      // instead of the player only being able to check via the in-game 🪪 panel.
      if (restored && (profile.bestScore > 0 || profile.maxBossKills > 0)) {
        statusText.classList.add('success');
        statusText.textContent = `已還原紀錄：最高分 ${profile.bestScore}、擊敗魔王 ${profile.maxBossKills} 次`;
        startBtn.setAttribute('disabled', 'true');
        setTimeout(() => {
          startBtn.removeAttribute('disabled');
          finish(profile);
        }, 1400);
        return;
      }

      finish(profile);
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
