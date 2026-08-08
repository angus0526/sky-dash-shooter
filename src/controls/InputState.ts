/** Shared input state written by touch controls (UIScene) and read by GameScene each frame. */
export const InputState = {
  moveX: 0,
  moveY: 0,
  firing: false
};

export const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
