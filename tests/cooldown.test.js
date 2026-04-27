import { describe, it, expect } from 'vitest';
import { createCooldown } from '../src/lib/cooldown.js';

describe('createCooldown', () => {
  it('allows the first attempt immediately', () => {
    const c = createCooldown();
    expect(c.canAttempt(0)).toBe(true);
  });

  it('blocks attempts within 1500ms of a recorded attempt', () => {
    const c = createCooldown();
    c.recordAttempt(0);
    expect(c.canAttempt(500)).toBe(false);
    expect(c.canAttempt(1499)).toBe(false);
    expect(c.canAttempt(1500)).toBe(true);
  });

  it('blocks during a 3s user-action suppression window', () => {
    const c = createCooldown();
    c.recordUserAction(0);
    expect(c.canAttempt(2999)).toBe(false);
    expect(c.canAttempt(3000)).toBe(true);
  });

  describe('exponential backoff', () => {
    it('does not back off for the first 3 attempts in 10s', () => {
      const c = createCooldown();
      c.recordAttempt(0);
      c.recordAttempt(2000);
      c.recordAttempt(4000);
      expect(c.canAttempt(5500)).toBe(true);
    });

    it('applies 5s backoff after 3 attempts within 10s', () => {
      const c = createCooldown();
      c.recordAttempt(0);
      c.recordAttempt(2000);
      c.recordAttempt(4000);
      c.recordAttempt(5500);
      expect(c.canAttempt(5500)).toBe(false);
      expect(c.canAttempt(10000)).toBe(false);
      expect(c.canAttempt(10500)).toBe(true);
    });

    it('applies 10s backoff after 5 attempts in 10s', () => {
      const c = createCooldown();
      c.recordAttempt(0);
      c.recordAttempt(2000);
      c.recordAttempt(4000);
      c.recordAttempt(6000);
      c.recordAttempt(8000);
      expect(c.canAttempt(17000)).toBe(false);
      expect(c.canAttempt(18001)).toBe(true);
    });

    it('applies 20s backoff after 6+ attempts in 10s', () => {
      const c = createCooldown();
      for (let t = 0; t <= 8000; t += 1500) c.recordAttempt(t);
      expect(c.recordAttempt(9000));
      expect(c.canAttempt(28999)).toBe(false);
      expect(c.canAttempt(29001)).toBe(true);
    });
  });

  it('forceReset bypasses cooldown', () => {
    const c = createCooldown();
    c.recordAttempt(0);
    expect(c.canAttempt(100, { force: true })).toBe(true);
  });
});
