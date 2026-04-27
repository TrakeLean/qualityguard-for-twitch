const BASE_COOLDOWN_MS = 1500;
const USER_ACTION_SUPPRESSION_MS = 3000;
const BACKOFF_WINDOW_MS = 10_000;
const BACKOFF_MS = [5_000, 10_000, 20_000];

export function createCooldown() {
  let nextAllowedAt = -Infinity;
  let lastUserActionAt = -Infinity;
  let burst = [];

  return {
    canAttempt(now, { force = false } = {}) {
      if (force) return true;
      if (now - lastUserActionAt < USER_ACTION_SUPPRESSION_MS) return false;
      return now >= nextAllowedAt;
    },
    recordAttempt(now) {
      burst = burst.filter(t => now - t <= BACKOFF_WINDOW_MS);
      burst.push(now);
      const overflow = burst.length - 4;
      const cooldown = overflow < 0
        ? BASE_COOLDOWN_MS
        : BACKOFF_MS[Math.min(overflow, BACKOFF_MS.length - 1)];
      nextAllowedAt = now + cooldown;
    },
    recordUserAction(now) {
      lastUserActionAt = now;
    }
  };
}
