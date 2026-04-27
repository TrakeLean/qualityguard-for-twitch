import { DEFAULT_SETTINGS, DEFAULT_STATS } from './lib/defaults.js';

const SETTINGS_KEY = 'settings';
const STATS_KEY = 'stats';
const TRIGGER_MIGRATIONS = Object.freeze({
  anyChange: 'anyDrop'
});

function normalizeSettings(settings) {
  return {
    ...settings,
    trigger: TRIGGER_MIGRATIONS[settings.trigger] ?? settings.trigger
  };
}

export async function getSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.sync.get([SETTINGS_KEY]);
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
}

export async function setSettings(partial) {
  const merged = { ...(await getSettings()), ...partial };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function getStats() {
  const { [STATS_KEY]: stored } = await chrome.storage.local.get([STATS_KEY]);
  return { ...DEFAULT_STATS, ...(stored ?? {}) };
}

export async function recordReset(when = new Date()) {
  const stats = await getStats();
  const next = {
    lifetimeResets: stats.lifetimeResets + 1,
    lastResetAt: when.toISOString()
  };

  await chrome.storage.local.set({ [STATS_KEY]: next });
  return next;
}

export function subscribeSettings(callback) {
  const listener = (changes, area) => {
    if (area !== 'sync' || !changes[SETTINGS_KEY]) return;

    const next = normalizeSettings({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue ?? {}) });
    callback(next);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
