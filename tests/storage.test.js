import { describe, it, expect } from 'vitest';
import { getSettings, setSettings, getStats, recordReset, subscribeSettings } from '../src/storage.js';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '../src/lib/defaults.js';

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists partial updates and merges with defaults', async () => {
    await setSettings({ enabled: false });

    const got = await getSettings();
    expect(got.enabled).toBe(false);
    expect(got.trigger).toBe(DEFAULT_SETTINGS.trigger);
  });
});

describe('stats', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getStats()).toEqual(DEFAULT_STATS);
  });

  it('recordReset increments lifetimeResets and stamps lastResetAt', async () => {
    await recordReset(new Date('2026-04-27T12:00:00Z'));
    let s = await getStats();
    expect(s.lifetimeResets).toBe(1);
    expect(s.lastResetAt).toBe('2026-04-27T12:00:00.000Z');

    await recordReset(new Date('2026-04-27T12:01:00Z'));
    s = await getStats();
    expect(s.lifetimeResets).toBe(2);
  });
});

describe('subscribeSettings', () => {
  it('fires only when settings change, with the merged settings object', async () => {
    const calls = [];
    const off = subscribeSettings(s => calls.push(s));

    await setSettings({ enabled: false });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(calls).toHaveLength(1);
    expect(calls[0].enabled).toBe(false);
    off();
  });
});
