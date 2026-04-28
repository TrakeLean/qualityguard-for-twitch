import { describe, it, expect } from 'vitest';
import { shouldEnforceCurrentHeight, shouldReset } from '../src/lib/trigger.js';

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

    it('returns true when first observed height is below target', () => {
      expect(shouldReset(null, 160, s)).toBe(true);
    });

    it('returns false when first observed height equals or exceeds target', () => {
      expect(shouldReset(null, 1080, s)).toBe(false);
      expect(shouldReset(null, 1440, s)).toBe(false);
    });

    it('returns false on first observed height if target has no known height', () => {
      expect(shouldReset(null, 720, { ...s, targetQuality: 'auto' })).toBe(false);
    });

    it('returns false for first observed violation if extension is disabled', () => {
      expect(shouldReset(null, 160, { ...s, enabled: false })).toBe(false);
    });
  });

  describe('unsupported trigger', () => {
    it('returns false', () => {
      expect(shouldReset(1080, 720, { ...baseSettings, trigger: 'anyChange' })).toBe(false);
    });
  });
});

describe('shouldEnforceCurrentHeight', () => {
  it('returns true for current forced 160p even when it did not change', () => {
    expect(shouldEnforceCurrentHeight(160, baseSettings)).toBe(true);
  });

  it('returns true for current height below known anyDrop target', () => {
    expect(shouldEnforceCurrentHeight(160, { ...baseSettings, trigger: 'anyDrop' })).toBe(true);
  });

  it('returns false when current height is at target or extension is disabled', () => {
    expect(shouldEnforceCurrentHeight(1080, { ...baseSettings, trigger: 'anyDrop' })).toBe(false);
    expect(shouldEnforceCurrentHeight(160, { ...baseSettings, enabled: false })).toBe(false);
  });
});
