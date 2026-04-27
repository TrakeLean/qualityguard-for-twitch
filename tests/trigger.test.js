import { describe, it, expect } from 'vitest';
import { shouldReset } from '../src/lib/trigger.js';

const baseSettings = {
  enabled: true,
  trigger: 'forced160',
  targetQuality: 'chunked'
};

describe('shouldReset', () => {
  it('returns false if extension is disabled', () => {
    expect(shouldReset(720, 160, { ...baseSettings, enabled: false })).toBe(false);
  });

  describe('trigger=forced160', () => {
    it('returns true when new height is exactly 160', () => {
      expect(shouldReset(720, 160, baseSettings)).toBe(true);
    });

    it('returns true when new height is 200 or below (covers manifest variation)', () => {
      expect(shouldReset(720, 200, baseSettings)).toBe(true);
      expect(shouldReset(720, 180, baseSettings)).toBe(true);
    });

    it('returns false when new height is above 200', () => {
      expect(shouldReset(720, 360, baseSettings)).toBe(false);
      expect(shouldReset(1080, 720, baseSettings)).toBe(false);
    });

    it('returns false when new height equals previous (no change)', () => {
      expect(shouldReset(160, 160, baseSettings)).toBe(false);
    });
  });

  describe('trigger=anyDrop', () => {
    const s = { ...baseSettings, trigger: 'anyDrop' };

    it('returns true when new height is below target', () => {
      expect(shouldReset(1080, 720, s)).toBe(true);
    });

    it('returns false when new height equals target height', () => {
      expect(shouldReset(720, 1080, s)).toBe(false);
    });

    it('returns false when previous height is unknown (null)', () => {
      expect(shouldReset(null, 720, s)).toBe(false);
    });
  });

  describe('trigger=anyChange', () => {
    const s = { ...baseSettings, trigger: 'anyChange' };

    it('returns true on any height change', () => {
      expect(shouldReset(1080, 720, s)).toBe(true);
      expect(shouldReset(720, 1080, s)).toBe(true);
    });

    it('returns false when heights are equal', () => {
      expect(shouldReset(720, 720, s)).toBe(false);
    });
  });
});
