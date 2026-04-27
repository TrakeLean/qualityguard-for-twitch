# QualityGuard for Twitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Manifest V3 Chrome extension that detects when Twitch forces the player to a low quality (e.g. 160p after an ad-block event) on live channel pages and silently restores the user's preferred quality.

**Architecture:** Two-script content layer (isolated content + page-world injected) talking to the live Twitch player via its React-fiber-exposed API, with a service worker for badge/stats/commands and a popup for settings + diagnostics. Pure logic modules (trigger decision, cooldown, selector fallback) are TDD'd in isolation; integration glue is verified via a manual smoke checklist. Build via `esbuild` so we can use ES module imports across all extension surfaces.

**Tech Stack:** JavaScript (ES2022), Chrome Manifest V3, esbuild (bundler), Vitest + jsdom (unit tests), no UI framework.

---

## File Structure

```
ChromeAutoAuto/
├── manifest.json                 — Chrome extension manifest (MV3)
├── package.json                  — npm config, build + test scripts
├── vitest.config.js              — Vitest config (jsdom env)
├── esbuild.config.js             — bundler config
├── .gitignore
├── src/
│   ├── lib/
│   │   ├── defaults.js           — settings defaults (single source of truth)
│   │   ├── trigger.js            — pure: shouldReset(prev, current, settings)
│   │   ├── cooldown.js           — pure: cooldown + backoff state machine
│   │   ├── selectors.js          — pure: selector fallback chain
│   │   └── messages.js           — message-type string constants
│   ├── storage.js                — chrome.storage helpers
│   ├── debug.js                  — log() helper, no-op unless debug mode on
│   ├── content.js                — content script entry (isolated world)
│   ├── injected.js               — page-world player bridge
│   ├── background.js             — service worker
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── source.svg                — vector master
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── store/
│   ├── PRIVACY.md
│   ├── description.md
│   ├── promo-tile-spec.md
│   └── screenshots/.gitkeep
├── tests/
│   ├── trigger.test.js
│   ├── cooldown.test.js
│   ├── selectors.test.js
│   ├── storage.test.js
│   └── debug.test.js
├── dist/                         — build output (gitignored)
└── docs/
    ├── superpowers/specs/        — design docs (already populated)
    ├── superpowers/plans/        — this file
    └── test-plan.md              — manual smoke checklist
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `esbuild.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "qualityguard-for-twitch",
  "version": "0.1.0",
  "description": "Restores Twitch player quality after ad-block-triggered forced downgrades.",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js']
  }
});
```

- [ ] **Step 4: Create `esbuild.config.js`**

```js
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const entries = [
  'src/content.js',
  'src/injected.js',
  'src/background.js',
  'src/popup.js'
];

mkdirSync('dist/src', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: entries,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: 'dist/src',
  logLevel: 'info'
});

await ctx.rebuild();

copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('src/popup.html', 'dist/src/popup.html');
copyFileSync('src/popup.css', 'dist/src/popup.css');
if (existsSync('icons')) cpSync('icons', 'dist/icons', { recursive: true });

if (watch) {
  await ctx.watch();
  console.log('watching for changes...');
} else {
  await ctx.dispose();
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: Creates `node_modules/` and `package-lock.json`. No errors.

- [ ] **Step 6: Verify Vitest runs (no tests yet, should report no files)**

Run: `npm test`
Expected: Vitest runs, reports no test files found, exits cleanly.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js esbuild.config.js .gitignore
git commit -m "chore: scaffold project (esbuild + vitest)"
```

---

## Task 2: Defaults module + tests

**Files:**
- Create: `src/lib/defaults.js`
- Create: `src/lib/messages.js`

- [ ] **Step 1: Create `src/lib/defaults.js`**

```js
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  trigger: 'forced160',          // 'forced160' | 'anyDrop' | 'anyChange'
  targetQuality: 'chunked',      // Twitch's group key for "Source"
  showToast: true,
  debugMode: false
});

export const DEFAULT_STATS = Object.freeze({
  lifetimeResets: 0,
  lastResetAt: null
});

export const QUALITY_HEIGHTS = Object.freeze({
  chunked: 1080,    // Source — actual height varies, treat as max
  '1080p60': 1080,
  '720p60': 720,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '160p': 160,
  auto: null        // adaptive — height check uses video.videoHeight
});
```

- [ ] **Step 2: Create `src/lib/messages.js`**

```js
export const MSG = Object.freeze({
  // content.js -> injected.js (via window.postMessage)
  AUTOQUALITY_SET: 'autoquality:set',
  AUTOQUALITY_GET: 'autoquality:get',
  AUTOQUALITY_RESULT: 'autoquality:result',

  // content.js -> background.js (via chrome.runtime.sendMessage)
  INCREMENT_BADGE: 'autoquality:incrementBadge',
  RESET_TAB_BADGE: 'autoquality:resetTabBadge',
  GET_DIAGNOSTICS: 'autoquality:getDiagnostics',

  // background.js -> content.js (via chrome.tabs.sendMessage)
  CMD_TOGGLE: 'autoquality:cmdToggle',
  CMD_FORCE_RESET: 'autoquality:cmdForceReset'
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/defaults.js src/lib/messages.js
git commit -m "feat: add defaults and message-type constants"
```

---

## Task 3: Trigger decision logic (TDD)

**Files:**
- Test: `tests/trigger.test.js`
- Create: `src/lib/trigger.js`

- [ ] **Step 1: Write failing tests at `tests/trigger.test.js`**

```js
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
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- tests/trigger.test.js`
Expected: All tests fail with "Cannot find module '../src/lib/trigger.js'" or "shouldReset is not a function".

- [ ] **Step 3: Implement `src/lib/trigger.js`**

```js
import { QUALITY_HEIGHTS } from './defaults.js';

const FORCED_LOW_THRESHOLD = 200;

export function shouldReset(prevHeight, newHeight, settings) {
  if (!settings.enabled) return false;
  if (prevHeight === newHeight) return false;

  switch (settings.trigger) {
    case 'forced160':
      return newHeight !== null && newHeight <= FORCED_LOW_THRESHOLD;

    case 'anyDrop': {
      if (prevHeight === null) return false;
      const targetH = QUALITY_HEIGHTS[settings.targetQuality];
      if (targetH === null || targetH === undefined) return newHeight < prevHeight;
      return newHeight < targetH;
    }

    case 'anyChange':
      return true;

    default:
      return false;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/trigger.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trigger.js tests/trigger.test.js
git commit -m "feat: pure trigger decision logic with tests"
```

---

## Task 4: Cooldown + backoff state machine (TDD)

**Files:**
- Test: `tests/cooldown.test.js`
- Create: `src/lib/cooldown.js`

- [ ] **Step 1: Write failing tests at `tests/cooldown.test.js`**

```js
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

    it('applies 10s backoff after 4 attempts in 10s', () => {
      const c = createCooldown();
      c.recordAttempt(0);
      c.recordAttempt(2000);
      c.recordAttempt(4000);
      c.recordAttempt(6000);
      expect(c.canAttempt(15000)).toBe(false);
      expect(c.canAttempt(16001)).toBe(true);
    });
  });

  it('forceReset bypasses cooldown', () => {
    const c = createCooldown();
    c.recordAttempt(0);
    expect(c.canAttempt(100, { force: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- tests/cooldown.test.js`
Expected: All tests fail with "Cannot find module".

- [ ] **Step 3: Implement `src/lib/cooldown.js`**

```js
const BASE_COOLDOWN_MS = 1500;
const USER_ACTION_SUPPRESSION_MS = 3000;
const BACKOFF_WINDOW_MS = 10_000;
const BACKOFF_MS = [5_000, 10_000, 20_000];

export function createCooldown() {
  let lastAttemptAt = -Infinity;
  let lastUserActionAt = -Infinity;
  const recentAttempts = [];

  function pruneRecent(now) {
    while (recentAttempts.length && now - recentAttempts[0] > BACKOFF_WINDOW_MS) {
      recentAttempts.shift();
    }
  }

  function currentBackoffMs(now) {
    pruneRecent(now);
    const overflow = recentAttempts.length - 3;
    if (overflow < 0) return BASE_COOLDOWN_MS;
    return BACKOFF_MS[Math.min(overflow, BACKOFF_MS.length - 1)];
  }

  return {
    canAttempt(now, { force = false } = {}) {
      if (force) return true;
      if (now - lastUserActionAt < USER_ACTION_SUPPRESSION_MS) return false;
      const cooldown = currentBackoffMs(now);
      return now - lastAttemptAt >= cooldown;
    },
    recordAttempt(now) {
      lastAttemptAt = now;
      recentAttempts.push(now);
    },
    recordUserAction(now) {
      lastUserActionAt = now;
    }
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/cooldown.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cooldown.js tests/cooldown.test.js
git commit -m "feat: cooldown and backoff state machine"
```

---

## Task 5: Selector fallback chain (TDD)

**Files:**
- Test: `tests/selectors.test.js`
- Create: `src/lib/selectors.js`

- [ ] **Step 1: Write failing tests at `tests/selectors.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { findSettingsButton, findQualityOptions } from '../src/lib/selectors.js';

function setBody(html) {
  document.body.innerHTML = html;
}

describe('findSettingsButton', () => {
  beforeEach(() => setBody(''));

  it('finds the button via the user-provided CSS selector', () => {
    setBody(`
      <div id="channel-player">
        <div>
          <div class="Layout-sc-1xcs6mc-0 iqRXAC player-controls__right-control-group">
            <div></div>
            <div>
              <div></div>
              <div>
                <div>
                  <button id="primary">Settings</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
    const btn = findSettingsButton();
    expect(btn?.id).toBe('primary');
  });

  it('falls back to data-a-target when CSS selector misses', () => {
    setBody(`<button data-a-target="player-settings-button" id="fallback">x</button>`);
    expect(findSettingsButton()?.id).toBe('fallback');
  });

  it('returns null when nothing matches', () => {
    setBody(`<div></div>`);
    expect(findSettingsButton()).toBeNull();
  });
});

describe('findQualityOptions', () => {
  beforeEach(() => setBody(''));

  it('returns options with their labels and elements via data-a-target', () => {
    setBody(`
      <div data-a-target="player-settings-menu">
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div>Auto</div></label>
        </div>
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div><div>1080p60<span>(Source)</span></div></div></label>
        </div>
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div><div>160p</div></div></label>
        </div>
      </div>
    `);
    const opts = findQualityOptions();
    expect(opts).toHaveLength(3);
    expect(opts[0].label).toBe('Auto');
    expect(opts[1].label.startsWith('1080p60')).toBe(true);
    expect(opts[2].label).toBe('160p');
  });

  it('falls back to role=menuitemradio if data-a-target is missing', () => {
    setBody(`
      <div>
        <div role="menuitemradio"><label><div>Auto</div></label></div>
        <div role="menuitemradio"><label><div>720p</div></label></div>
      </div>
    `);
    const opts = findQualityOptions();
    expect(opts).toHaveLength(2);
    expect(opts[0].label).toBe('Auto');
  });

  it('returns empty array when nothing matches', () => {
    expect(findQualityOptions()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- tests/selectors.test.js`
Expected: All tests fail with module not found.

- [ ] **Step 3: Implement `src/lib/selectors.js`**

```js
const SETTINGS_BUTTON_SELECTORS = [
  '#channel-player .player-controls__right-control-group button',
  '[data-a-target="player-settings-button"]',
  'button[aria-label*="Settings" i]'
];

const QUALITY_OPTION_SELECTORS = [
  '[data-a-target="player-settings-submenu-quality-option"]',
  '[role="menuitemradio"]'
];

export function findSettingsButton(root = document) {
  for (const sel of SETTINGS_BUTTON_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function findQualityOptions(root = document) {
  for (const sel of QUALITY_OPTION_SELECTORS) {
    const els = root.querySelectorAll(sel);
    if (els.length) {
      return Array.from(els).map(el => ({
        element: el,
        label: el.textContent?.trim() ?? ''
      }));
    }
  }
  return [];
}

export function findOptionByLabel(options, target) {
  const t = target.toLowerCase();
  return options.find(o => o.label.toLowerCase().startsWith(t)) ?? null;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/selectors.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/selectors.js tests/selectors.test.js
git commit -m "feat: selector fallback chain for Twitch player UI"
```

---

## Task 6: Storage helpers (TDD with chrome.storage mock)

**Files:**
- Create: `tests/setup.js`
- Modify: `vitest.config.js`
- Test: `tests/storage.test.js`
- Create: `src/storage.js`

- [ ] **Step 1: Create `tests/setup.js` with a minimal `chrome.storage` mock**

```js
import { vi } from 'vitest';

function makeArea() {
  let data = {};
  const listeners = new Set();
  return {
    _data: () => data,
    _listeners: listeners,
    get: vi.fn(keys => {
      if (keys === null || keys === undefined) return Promise.resolve({ ...data });
      const out = {};
      const arr = Array.isArray(keys) ? keys : Object.keys(keys);
      for (const k of arr) out[k] = data[k] ?? (typeof keys === 'object' && !Array.isArray(keys) ? keys[k] : undefined);
      return Promise.resolve(out);
    }),
    set: vi.fn(obj => {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }
      for (const fn of listeners) fn(changes);
      return Promise.resolve();
    }),
    clear: vi.fn(() => { data = {}; return Promise.resolve(); })
  };
}

export function installChromeMock() {
  const sync = makeArea();
  const local = makeArea();
  const onChangedListeners = new Set();
  globalThis.chrome = {
    storage: {
      sync,
      local,
      onChanged: {
        addListener: fn => onChangedListeners.add(fn),
        removeListener: fn => onChangedListeners.delete(fn)
      }
    }
  };
  // Bridge area listeners into chrome.storage.onChanged with areaName.
  sync._listeners.add(changes => onChangedListeners.forEach(fn => fn(changes, 'sync')));
  local._listeners.add(changes => onChangedListeners.forEach(fn => fn(changes, 'local')));
}

export function resetChromeMock() {
  globalThis.chrome.storage.sync.clear();
  globalThis.chrome.storage.local.clear();
}
```

- [ ] **Step 2: Update `vitest.config.js` to load setup**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup-chrome.js']
  }
});
```

- [ ] **Step 3: Create `tests/setup-chrome.js`** (auto-runs before each test file)

```js
import { beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from './setup.js';

installChromeMock();
beforeEach(() => resetChromeMock());
```

- [ ] **Step 4: Write failing tests at `tests/storage.test.js`**

```js
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
    await new Promise(r => setTimeout(r, 0));
    expect(calls).toHaveLength(1);
    expect(calls[0].enabled).toBe(false);
    off();
  });
});
```

- [ ] **Step 5: Run tests, verify failure**

Run: `npm test -- tests/storage.test.js`
Expected: Module not found.

- [ ] **Step 6: Implement `src/storage.js`**

```js
import { DEFAULT_SETTINGS, DEFAULT_STATS } from './lib/defaults.js';

const SETTINGS_KEY = 'settings';
const STATS_KEY = 'stats';

export async function getSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.sync.get([SETTINGS_KEY]);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
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
    const next = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue ?? {}) };
    callback(next);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
```

- [ ] **Step 7: Run tests, verify pass**

Run: `npm test -- tests/storage.test.js`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/storage.js tests/storage.test.js tests/setup.js tests/setup-chrome.js vitest.config.js
git commit -m "feat: storage helpers with chrome.storage mock"
```

---

## Task 7: Debug log helper (TDD)

**Files:**
- Test: `tests/debug.test.js`
- Create: `src/debug.js`

- [ ] **Step 1: Write failing tests at `tests/debug.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../src/debug.js';

describe('createLogger', () => {
  it('does not log when disabled', () => {
    const sink = vi.fn();
    const log = createLogger(() => false, sink);
    log('hello');
    expect(sink).not.toHaveBeenCalled();
  });

  it('logs with prefix when enabled', () => {
    const sink = vi.fn();
    const log = createLogger(() => true, sink);
    log('hello', 1, { a: 2 });
    expect(sink).toHaveBeenCalledWith('[QualityGuard]', 'hello', 1, { a: 2 });
  });

  it('reflects live changes to the predicate', () => {
    const sink = vi.fn();
    let on = false;
    const log = createLogger(() => on, sink);
    log('a');
    on = true;
    log('b');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('[QualityGuard]', 'b');
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- tests/debug.test.js`
Expected: Module not found.

- [ ] **Step 3: Implement `src/debug.js`**

```js
export function createLogger(isEnabled, sink = console.log) {
  return (...args) => {
    if (isEnabled()) sink('[QualityGuard]', ...args);
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/debug.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/debug.js tests/debug.test.js
git commit -m "feat: debug logger that no-ops unless enabled"
```

---

## Task 8: manifest.json + popup skeleton (no logic yet, lets us load unpacked)

**Files:**
- Create: `manifest.json`
- Create: `src/popup.html`
- Create: `src/popup.css`
- Create: `src/popup.js`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (placeholders)

- [ ] **Step 1: Create placeholder PNG icons**

Run:

```bash
node -e "
const fs = require('fs');
// 1x1 transparent PNG, base64
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
fs.mkdirSync('icons', { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync('icons/icon' + s + '.png', png);
"
```

(Real icons land in Task 14.)

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "QualityGuard for Twitch",
  "short_name": "QualityGuard",
  "version": "0.1.0",
  "description": "Restores your preferred Twitch player quality after forced downgrades.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.twitch.tv/*"],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup.html",
    "default_title": "QualityGuard for Twitch",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://www.twitch.tv/*"],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/injected.js"],
      "matches": ["https://www.twitch.tv/*"]
    }
  ],
  "commands": {
    "toggle-guard": {
      "suggested_key": { "default": "Alt+Shift+Q" },
      "description": "Toggle QualityGuard on/off"
    },
    "force-reset": {
      "suggested_key": { "default": "Alt+Shift+R" },
      "description": "Force a quality reset right now"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 3: Create `src/popup.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header>
      <h1>QualityGuard</h1>
      <label class="toggle">
        <input type="checkbox" id="enabled" />
        <span>Enabled</span>
      </label>
    </header>

    <section>
      <label for="trigger">Trigger</label>
      <select id="trigger">
        <option value="forced160">Only when forced to 160p</option>
        <option value="anyDrop">Any drop from preferred quality</option>
        <option value="anyChange">Any change from Auto</option>
      </select>
    </section>

    <section>
      <label for="targetQuality">Target quality</label>
      <select id="targetQuality">
        <option value="auto">Auto</option>
        <option value="chunked">Source</option>
        <option value="1080p60">1080p60</option>
        <option value="720p60">720p60</option>
        <option value="480p">480p</option>
        <option value="360p">360p</option>
        <option value="160p">160p</option>
      </select>
    </section>

    <section>
      <label class="toggle"><input type="checkbox" id="showToast" /> <span>Show toast in player</span></label>
      <label class="toggle"><input type="checkbox" id="debugMode" /> <span>Debug mode</span></label>
    </section>

    <section class="stats">
      <h2>Stats</h2>
      <div>Lifetime resets: <span id="lifetime">0</span></div>
      <div>This tab: <span id="tab">0</span></div>
      <div>Last reset: <span id="last">never</span></div>
    </section>

    <section>
      <button id="copyDebug">Copy debug info</button>
      <span id="copyDebugStatus"></span>
    </section>

    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `src/popup.css`**

```css
:root { color-scheme: light dark; }
body { font: 13px system-ui, sans-serif; width: 280px; margin: 0; padding: 12px; }
h1 { font-size: 14px; margin: 0; }
h2 { font-size: 12px; margin: 8px 0 4px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
section { margin-bottom: 10px; }
section label { display: block; margin-bottom: 4px; }
.toggle { display: flex; align-items: center; gap: 6px; margin: 0; }
select, button { width: 100%; padding: 6px; font: inherit; }
.stats div { display: flex; justify-content: space-between; padding: 2px 0; }
#copyDebugStatus { font-size: 11px; opacity: 0.7; margin-left: 6px; }
```

- [ ] **Step 5: Create `src/popup.js` (skeleton — full logic in Task 13)**

```js
import { getSettings, setSettings, getStats } from './storage.js';

async function render() {
  const settings = await getSettings();
  const stats = await getStats();

  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('trigger').value = settings.trigger;
  document.getElementById('targetQuality').value = settings.targetQuality;
  document.getElementById('showToast').checked = settings.showToast;
  document.getElementById('debugMode').checked = settings.debugMode;

  document.getElementById('lifetime').textContent = String(stats.lifetimeResets);
  document.getElementById('last').textContent = stats.lastResetAt ?? 'never';
}

function bind(id, key, prop = 'checked') {
  document.getElementById(id).addEventListener('change', e => {
    setSettings({ [key]: e.target[prop] });
  });
}

bind('enabled', 'enabled');
bind('showToast', 'showToast');
bind('debugMode', 'debugMode');
bind('trigger', 'trigger', 'value');
bind('targetQuality', 'targetQuality', 'value');

render();
```

- [ ] **Step 6: Create empty placeholder `src/content.js`, `src/injected.js`, `src/background.js`**

```js
// src/content.js
console.log('[QualityGuard] content placeholder');
```

```js
// src/injected.js
console.log('[QualityGuard] injected placeholder');
```

```js
// src/background.js
console.log('[QualityGuard] background placeholder');
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: `dist/` populated with `manifest.json`, `src/*`, `icons/*`. No errors.

- [ ] **Step 8: Manual verification — load unpacked**

1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked", pick the `dist/` folder.
4. Confirm "QualityGuard for Twitch" appears with no errors.
5. Click the icon → popup opens, toggles persist across reopens.

- [ ] **Step 9: Commit**

```bash
git add manifest.json src/popup.html src/popup.css src/popup.js src/content.js src/injected.js src/background.js icons/
git commit -m "feat: extension skeleton with manifest, popup, and placeholder scripts"
```

---

## Task 9: injected.js — page-world player bridge

**Files:**
- Modify: `src/injected.js`

This is integration glue against Twitch's React player. Not unit-testable in isolation; verified via the manual smoke checklist (Task 15).

- [ ] **Step 1: Replace `src/injected.js` with the full bridge**

```js
import { MSG } from './lib/messages.js';

const PROACTIVE_FLAG = '__qualityguard_proactive_done';

function findPlayerFromVideo(video) {
  if (!video) return null;
  const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  let node = video[fiberKey];
  while (node) {
    const inst = node.stateNode;
    if (inst && typeof inst.setQuality === 'function' && typeof inst.getQuality === 'function') {
      return inst;
    }
    if (inst && inst.player && typeof inst.player.setQuality === 'function') {
      return inst.player;
    }
    node = node.return;
  }
  return null;
}

function waitForPlayer(timeoutMs = 10_000) {
  return new Promise(resolve => {
    const start = performance.now();
    function tick() {
      const video = document.querySelector('video');
      const player = findPlayerFromVideo(video);
      if (player) return resolve(player);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    }
    tick();
  });
}

function applyProactiveLocalStorage(target) {
  if (window[PROACTIVE_FLAG]) return;
  window[PROACTIVE_FLAG] = true;
  if (target === 'auto') return;
  try {
    const raw = localStorage.getItem('video-quality');
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.default !== target) {
      parsed.default = target;
      localStorage.setItem('video-quality', JSON.stringify(parsed));
    }
  } catch {
    localStorage.setItem('video-quality', JSON.stringify({ default: target }));
  }
}

window.addEventListener('message', async event => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;
  const { type, id } = event.data;

  if (type === MSG.AUTOQUALITY_SET) {
    applyProactiveLocalStorage(event.data.target);
    const player = await waitForPlayer();
    if (!player) {
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: false, error: 'player_not_found' }, '*');
      return;
    }
    try {
      player.setQuality(event.data.target);
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, target: event.data.target }, '*');
    } catch (err) {
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: false, error: String(err?.message ?? err) }, '*');
    }
    return;
  }

  if (type === MSG.AUTOQUALITY_GET) {
    const player = await waitForPlayer(2000);
    const current = player?.getQuality?.() ?? null;
    window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, current }, '*');
  }
});
```

- [ ] **Step 2: Build and reload extension**

Run: `npm run build`
Then in `chrome://extensions`, click the reload icon on QualityGuard. Open a live channel and confirm the console shows no errors from `injected.js`.

- [ ] **Step 3: Commit**

```bash
git add src/injected.js
git commit -m "feat: page-world player bridge with React-fiber lookup"
```

---

## Task 10: content.js — orchestrator

**Files:**
- Modify: `src/content.js`

- [ ] **Step 1: Replace `src/content.js`**

```js
import { getSettings, subscribeSettings, recordReset } from './storage.js';
import { createLogger } from './debug.js';
import { shouldReset } from './lib/trigger.js';
import { createCooldown } from './lib/cooldown.js';
import { findSettingsButton, findQualityOptions, findOptionByLabel } from './lib/selectors.js';
import { MSG } from './lib/messages.js';

let settings;
let log = () => {};
const cooldown = createCooldown();
let lastHeight = null;
let consecutiveApiFailures = 0;
let messageId = 0;
const pendingMessages = new Map();

function isLiveChannelUrl(url = location.href) {
  const u = new URL(url);
  if (u.hostname !== 'www.twitch.tv') return false;
  const path = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return false;
  const reserved = new Set(['videos', 'directory', 'p', 'settings', 'subscriptions', 'inventory', 'wallet', 'search', 'following']);
  const [first] = path.split('/');
  return !reserved.has(first) && !path.includes('/');
}

function injectScript() {
  if (document.getElementById('qualityguard-injected')) return;
  const s = document.createElement('script');
  s.id = 'qualityguard-injected';
  s.src = chrome.runtime.getURL('src/injected.js');
  s.type = 'module';
  (document.head || document.documentElement).appendChild(s);
}

function postToPage(message, timeoutMs = 4000) {
  const id = ++messageId;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingMessages.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);
    pendingMessages.set(id, payload => {
      clearTimeout(timer);
      pendingMessages.delete(id);
      resolve(payload);
    });
    window.postMessage({ ...message, id }, '*');
  });
}

window.addEventListener('message', event => {
  if (event.source !== window || !event.data || event.data.type !== MSG.AUTOQUALITY_RESULT) return;
  const handler = pendingMessages.get(event.data.id);
  if (handler) handler(event.data);
});

function showToast(text) {
  if (!settings.showToast) return;
  const player = document.querySelector('#channel-player') ?? document.body;
  const toast = document.createElement('div');
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(20, 20, 24, 0.85)', color: '#fff', padding: '6px 12px',
    borderRadius: '4px', font: '12px system-ui', zIndex: 9999, pointerEvents: 'none',
    transition: 'opacity 0.3s', opacity: '1'
  });
  player.style.position ||= 'relative';
  player.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 1700);
  setTimeout(() => toast.remove(), 2000);
}

async function uiAutomationFallback(target) {
  const button = findSettingsButton();
  if (!button) return false;
  button.click();
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 50));
    const opts = findQualityOptions();
    if (opts.length) {
      const targetLabel = target === 'chunked' ? 'Source' : target === 'auto' ? 'Auto' : target;
      const opt = findOptionByLabel(opts, targetLabel) ?? findOptionByLabel(opts, '1080') ?? opts[1] ?? opts[0];
      if (opt) {
        opt.element.click();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return true;
      }
    }
  }
  return false;
}

async function performReset(reason) {
  log('reset triggered:', reason, 'target=', settings.targetQuality);
  let result;
  if (consecutiveApiFailures < 3) {
    result = await postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
  } else {
    result = { ok: false, error: 'api_disabled_until_next_page' };
  }

  if (!result.ok) {
    consecutiveApiFailures++;
    log('api failed, falling back to UI:', result.error);
    const uiOk = await uiAutomationFallback(settings.targetQuality);
    if (!uiOk) {
      log('UI fallback also failed');
      return;
    }
  } else {
    consecutiveApiFailures = 0;
  }

  cooldown.recordAttempt(performance.now());
  showToast(`Quality restored to ${settings.targetQuality === 'chunked' ? 'Source' : settings.targetQuality}`);
  await recordReset();
  chrome.runtime.sendMessage({ type: MSG.INCREMENT_BADGE, height: lastHeight, target: settings.targetQuality });
}

function attachVideoListeners(video) {
  const onResize = () => {
    const h = video.videoHeight;
    if (!h) return;
    if (shouldReset(lastHeight, h, settings) && cooldown.canAttempt(performance.now())) {
      performReset('video resize');
    }
    lastHeight = h;
  };
  video.addEventListener('resize', onResize);
  video.addEventListener('loadedmetadata', onResize);
  if (video.videoHeight) lastHeight = video.videoHeight;
}

function trackUserInteraction() {
  document.addEventListener('click', e => {
    const btn = findSettingsButton();
    if (btn && (e.target === btn || btn.contains(e.target))) {
      cooldown.recordUserAction(performance.now());
      log('user opened settings menu');
    }
  }, true);
}

function watchForVideo() {
  let attached = null;
  const tryAttach = () => {
    const video = document.querySelector('video');
    if (video && video !== attached) {
      attached = video;
      attachVideoListeners(video);
      log('attached to video element');
    }
  };
  tryAttach();
  const observer = new MutationObserver(tryAttach);
  observer.observe(document.body, { childList: true, subtree: true });
}

function patchHistoryEvents() {
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) { const r = origPush.apply(this, args); window.dispatchEvent(new Event('locationchange')); return r; };
  history.replaceState = function (...args) { const r = origReplace.apply(this, args); window.dispatchEvent(new Event('locationchange')); return r; };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
}

async function activate() {
  if (!isLiveChannelUrl()) return;
  injectScript();
  postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
  watchForVideo();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === MSG.CMD_TOGGLE) showToast(`QualityGuard ${settings.enabled ? 'enabled' : 'disabled'}`);
  if (msg?.type === MSG.CMD_FORCE_RESET) {
    if (cooldown.canAttempt(performance.now(), { force: true })) performReset('manual command');
  }
});

(async () => {
  settings = await getSettings();
  log = createLogger(() => settings.debugMode);
  subscribeSettings(s => { settings = s; log = createLogger(() => settings.debugMode); });
  trackUserInteraction();
  patchHistoryEvents();
  window.addEventListener('locationchange', activate);
  activate();
})();
```

- [ ] **Step 2: Build and reload extension**

Run: `npm run build`
Then reload the extension in `chrome://extensions` and confirm no errors in the service worker / page consoles when visiting `https://www.twitch.tv/`.

- [ ] **Step 3: Commit**

```bash
git add src/content.js
git commit -m "feat: content script orchestrator with reactive + proactive logic"
```

---

## Task 11: background.js — service worker

**Files:**
- Modify: `src/background.js`

- [ ] **Step 1: Replace `src/background.js`**

```js
import { getSettings, setSettings } from './storage.js';
import { MSG } from './lib/messages.js';

const tabCounts = new Map();
const recentEvents = [];
const RECENT_LIMIT = 20;

function pushRecent(event) {
  recentEvents.push({ ...event, at: new Date().toISOString() });
  while (recentEvents.length > RECENT_LIMIT) recentEvents.shift();
}

function setBadge(tabId) {
  const count = tabCounts.get(tabId) ?? 0;
  chrome.action.setBadgeBackgroundColor({ color: '#9146FF' });
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  if (msg.type === MSG.INCREMENT_BADGE) {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      tabCounts.set(tabId, (tabCounts.get(tabId) ?? 0) + 1);
      setBadge(tabId);
    }
    pushRecent({ event: 'reset', height: msg.height, target: msg.target, tabId });
    return;
  }

  if (msg.type === MSG.GET_DIAGNOSTICS) {
    (async () => {
      const settings = await getSettings();
      const { stats } = await chrome.storage.local.get(['stats']);
      sendResponse({
        version: chrome.runtime.getManifest().version,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        settings,
        stats: stats ?? null,
        recentEvents: [...recentEvents]
      });
    })();
    return true; // async response
  }
});

chrome.tabs.onRemoved.addListener(tabId => tabCounts.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) {
    tabCounts.delete(tabId);
    setBadge(tabId);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-guard') {
    const settings = await getSettings();
    await setSettings({ enabled: !settings.enabled });
    chrome.tabs.sendMessage(tab.id, { type: MSG.CMD_TOGGLE });
  }
  if (command === 'force-reset') {
    chrome.tabs.sendMessage(tab.id, { type: MSG.CMD_FORCE_RESET });
  }
});
```

- [ ] **Step 2: Build and reload extension**

Run: `npm run build` then reload. Visit a Twitch channel, force quality to 160p via the menu, confirm the badge increments to "1".

- [ ] **Step 3: Commit**

```bash
git add src/background.js
git commit -m "feat: service worker for badge, diagnostics buffer, and commands"
```

---

## Task 12: Wire up popup — diagnostics export + per-tab count

**Files:**
- Modify: `src/popup.js`

- [ ] **Step 1: Replace `src/popup.js`**

```js
import { getSettings, setSettings, getStats } from './storage.js';
import { MSG } from './lib/messages.js';

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function getTabBadgeCount() {
  const tabId = await getActiveTabId();
  if (tabId === null) return 0;
  const text = await chrome.action.getBadgeText({ tabId });
  return Number(text) || 0;
}

function relativeTime(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

async function render() {
  const [settings, stats, tabCount] = await Promise.all([getSettings(), getStats(), getTabBadgeCount()]);
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('trigger').value = settings.trigger;
  document.getElementById('targetQuality').value = settings.targetQuality;
  document.getElementById('showToast').checked = settings.showToast;
  document.getElementById('debugMode').checked = settings.debugMode;
  document.getElementById('lifetime').textContent = String(stats.lifetimeResets);
  document.getElementById('tab').textContent = String(tabCount);
  document.getElementById('last').textContent = relativeTime(stats.lastResetAt);
}

function bind(id, key, prop = 'checked') {
  document.getElementById(id).addEventListener('change', e => setSettings({ [key]: e.target[prop] }));
}

bind('enabled', 'enabled');
bind('showToast', 'showToast');
bind('debugMode', 'debugMode');
bind('trigger', 'trigger', 'value');
bind('targetQuality', 'targetQuality', 'value');

document.getElementById('copyDebug').addEventListener('click', async () => {
  const status = document.getElementById('copyDebugStatus');
  status.textContent = '...';
  const diag = await chrome.runtime.sendMessage({ type: MSG.GET_DIAGNOSTICS });
  await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
  status.textContent = 'copied!';
  setTimeout(() => (status.textContent = ''), 1500);
});

render();
```

- [ ] **Step 2: Build, reload, smoke test**

Run: `npm run build`. Reload extension. Open popup → confirm:
- Toggles persist.
- Trigger / target dropdowns persist.
- Lifetime + last reset reflect prior activity.
- "Copy debug info" puts JSON on clipboard with `version`, `settings`, `stats`, `recentEvents`.

- [ ] **Step 3: Commit**

```bash
git add src/popup.js
git commit -m "feat: popup wiring, diagnostics export, per-tab counter"
```

---

## Task 13: Icon design (SVG master + PNG exports)

**Files:**
- Create: `icons/source.svg`
- Modify: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

This is a simple two-color shield + upward chevron in Twitch purple on dark.

- [ ] **Step 1: Create `icons/source.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1F1F23"/>
  <path fill="#9146FF" d="M256 64 L432 128 L432 272 C432 368 352 432 256 464 C160 432 80 368 80 272 L80 128 Z"/>
  <path fill="#FFFFFF" d="M256 192 L352 304 L296 304 L296 384 L216 384 L216 304 L160 304 Z"/>
</svg>
```

- [ ] **Step 2: Install a tiny PNG rasterizer** (one-time dev dep)

Run: `npm install -D sharp`

- [ ] **Step 3: Add an icon export script**

Add to `package.json` `scripts`:

```json
"icons": "node scripts/render-icons.js"
```

Create `scripts/render-icons.js`:

```js
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('icons/source.svg');
for (const size of [16, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(`icons/icon${size}.png`);
  console.log(`wrote icons/icon${size}.png`);
}
```

- [ ] **Step 4: Render PNGs**

Run: `npm run icons`
Expected: Three PNG files written. Visually inspect they look like the shield+chevron (open in a viewer).

- [ ] **Step 5: Build and reload, confirm icons display correctly**

Run: `npm run build`. Reload extension. The toolbar icon, popup header (browser-rendered), and `chrome://extensions` listing should all show the new icon.

- [ ] **Step 6: Commit**

```bash
git add icons/source.svg icons/icon16.png icons/icon48.png icons/icon128.png scripts/render-icons.js package.json package-lock.json
git commit -m "feat: shield+chevron icon (SVG master + PNG exports)"
```

---

## Task 14: Store listing prep files

**Files:**
- Create: `store/PRIVACY.md`
- Create: `store/description.md`
- Create: `store/promo-tile-spec.md`
- Create: `store/screenshots/.gitkeep`

- [ ] **Step 1: Create `store/PRIVACY.md`**

```markdown
# QualityGuard for Twitch — Privacy Policy

**Effective date:** 2026-04-27

QualityGuard for Twitch ("the extension") does not collect, transmit, or store any personal data. The extension never communicates with any server other than the Twitch site you are visiting.

## What is stored locally
- **Settings** (enabled toggle, trigger mode, target quality, toast/debug toggles): stored via `chrome.storage.sync`, which keeps them in your Chrome profile and syncs to your other Chrome installations *only if* you have Chrome Sync enabled. We never see this data.
- **Statistics** (lifetime count of times the extension restored your quality, timestamp of the last reset): stored via `chrome.storage.local`, which keeps them on your device only.
- **Recent events buffer** (last 20 reset events, in memory only): cleared whenever the extension's service worker shuts down. Used only for the "Copy debug info" feature, which writes to your clipboard at your explicit request.

## What is NOT collected
- No user identifiers, account names, IP addresses, viewing history, or content of streams.
- No data is sent to the extension authors, to Twitch, or to any third party.

## Permissions used
- `storage`: to persist your settings and stats locally.
- `host_permissions: https://www.twitch.tv/*`: to run on Twitch pages so we can detect and reverse forced quality drops.

## Contact
Issues or questions: open an issue at <repository URL once published>.
```

- [ ] **Step 2: Create `store/description.md`**

```markdown
# Store Listing Copy

## Short description (≤132 chars)

> Twitch dropping you to 160p? QualityGuard restores your preferred quality automatically when forced downgrades happen.

## Long description (~1500 chars)

If you use an ad blocker on Twitch, you may have noticed the player suddenly switching to 160p — and *staying* there. That blurry mess is by design: it's pressure to disable your ad blocker.

QualityGuard for Twitch fixes it. The moment the player drops to 160p (or any other unwanted quality, depending on your settings), the extension instantly switches it back to the quality you actually want. Most of the time you won't even notice it happened.

**Features**
- Detects forced quality drops on live Twitch channels
- Restores your preferred quality (Source by default) within ~1 second
- Configurable trigger sensitivity: only on 160p, any drop, or any change
- Subtle in-player toast confirms when a reset happened (toggleable)
- Per-tab badge counter shows how many times Twitch tried to punish you
- Lifetime stats in the popup
- Keyboard shortcuts: Alt+Shift+Q to toggle, Alt+Shift+R to force a reset
- Respects your manual quality choices — won't fight you when you pick a quality yourself
- Debug mode + "Copy debug info" button for easy bug reports

**Privacy**
QualityGuard collects no personal data. Settings live in your browser's storage. The extension never talks to any server other than Twitch itself.

**Limitations**
- Live channels only in v1 (no VODs, clips, or embeds — coming later).
- Does not block ads. Use your ad blocker of choice for that.

Source code: <repository URL once published>.
```

- [ ] **Step 3: Create `store/promo-tile-spec.md`**

```markdown
# Promo Tile Briefs

## Small (440×280) — required

- **Headline:** "No more 160p."
- **Subhead:** "QualityGuard for Twitch"
- **Visual:** Split-screen: left side a blurry 160p stream (faded, desaturated), right side the same stream at Source. Diagonal divider in Twitch purple. Shield icon bottom-right.

## Large (920×680) — optional

- **Headline:** "Stop letting Twitch downgrade you."
- **Subhead:** "Auto-restore your quality after every forced drop."
- **Visual:** Twitch-style player frame, with the badge counter "37" prominently visible on a stylized extension icon. Three small thumbnails below showing 160p → 1080p restoration sequence.

## Marquee (1400×560) — optional

- **Headline:** "QualityGuard for Twitch"
- **Subhead:** "One-second auto-recovery from forced quality drops. Privacy-respecting. Open source."
- **Visual:** Wide hero shot of a stream at full Source quality, with a subtle tooltip-style "Quality restored to Source" toast in the corner.

## Style notes (all sizes)

- Primary color: Twitch purple `#9146FF`.
- Background: dark `#0E0E10`.
- Avoid using the literal Twitch logo (trademark risk). The shield icon plus the word "Twitch" in the description is fine — Chrome Web Store allows nominative use.
```

- [ ] **Step 4: Create `store/screenshots/.gitkeep`**

```
# Place 1280×800 PNG screenshots here before submission.
# Required: 1–5 PNGs. Plan: (1) toast in player, (2) popup with stats, (3) settings panel, (4) before/after.
```

- [ ] **Step 5: Commit**

```bash
git add store/
git commit -m "docs: store listing prep (privacy, description, promo specs)"
```

---

## Task 15: Manual test plan + final smoke

**Files:**
- Create: `docs/test-plan.md`

- [ ] **Step 1: Create `docs/test-plan.md`**

```markdown
# QualityGuard for Twitch — Manual Smoke Test Plan

Run this checklist after every meaningful change before tagging a release.

## Setup
1. `npm run build`
2. `chrome://extensions` → Developer mode → "Load unpacked" → select `dist/`.
3. Open `https://www.twitch.tv/<a popular live channel>` in a fresh tab.

## Core flows

### 1. Reactive recovery from forced 160p
- Open settings (gear icon) → Quality → pick **160p**.
- Within ~1.5s, expect:
  - Quality jumps back to Source (or your configured target).
  - Toast appears: "Quality restored to Source".
  - Toolbar badge increments by 1.

### 2. Proactive on page load
- In DevTools console: `localStorage.removeItem('video-quality')`.
- Reload the channel page.
- Expect the stream to start at Source (or configured target) immediately, not Auto.

### 3. Respects manual user picks
- Click Settings → Quality → pick **720p**.
- Expect QualityGuard to NOT reset for at least 3 seconds.
- After 3s, manually switch to 160p — extension should now reset back to target.

### 4. SPA navigation
- Click a different live channel from the sidebar (no full reload).
- Repeat flow 1 — extension should still react on the new channel.

### 5. Disabled toggle
- Open popup, uncheck "Enabled".
- Drop quality to 160p — extension should NOT reset. Badge should not increment.
- Re-enable. Verify resets resume.

### 6. Stats and per-tab counter
- Trigger 3 resets on tab A.
- Open popup on tab A — "This tab" reads 3.
- Switch to a non-Twitch tab — toolbar badge clears (per-tab).
- Return to tab A — badge shows 3 again.
- "Lifetime" reflects all resets across the session.
- "Last reset" shows a recent relative time.

### 7. Keyboard shortcuts
- Alt+Shift+Q on a Twitch tab — toggles enabled. Toast confirms.
- Alt+Shift+R — forces a reset (badge increments even with no recent drop).

### 8. Debug mode
- Toggle "Debug mode" on. Open DevTools console on the channel page.
- Trigger a reset. Console shows `[QualityGuard]` lines describing the flow.
- Toggle off. New events do not log.

### 9. Diagnostics export
- Click "Copy debug info" in popup.
- Paste into a text editor. Verify JSON has: `version`, `settings`, `stats`, `recentEvents` (with at least one entry from earlier flows).

### 10. UI fallback path (optional, harder to trigger)
- In DevTools, monkey-patch the player to throw on `setQuality`: pick a video, run `document.querySelector('video').__reactFiber$xxx` … (skip if too fiddly; instead trust unit tests for the selector chain).

## Negative cases

- Open a non-channel Twitch URL (e.g. `/directory`). Confirm the extension is inactive (no badge updates, no console errors).
- Open Twitch in an Incognito window without permission. Confirm the extension is correctly absent.

## Pass criteria

All flows 1–9 pass. No console errors on page or service worker.
```

- [ ] **Step 2: Run the manual smoke test plan end-to-end**

Walk through every numbered flow. Record any failures and fix before moving on.

- [ ] **Step 3: Run unit tests one last time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Build for distribution**

Run: `npm run build`
Expected: clean `dist/` folder ready to zip and submit.

- [ ] **Step 5: Commit**

```bash
git add docs/test-plan.md
git commit -m "docs: manual smoke test plan for v0.1.0"
```

---

## Done

At this point:
- All unit tests pass (`npm test`).
- The manual smoke checklist passes against a live Twitch channel.
- `dist/` is loadable as an unpacked extension and ready to be packaged into a `.zip` for the Chrome Web Store.
- `store/` contains the privacy policy, listing copy, and promo tile briefs needed for submission (screenshots still need to be captured from the running extension).
