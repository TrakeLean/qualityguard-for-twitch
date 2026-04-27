# QualityGuard for Twitch — Design

**Status:** Draft
**Date:** 2026-04-27
**Owner:** Tarek

## Problem

Twitch detects when an ad blocker (e.g. AdGuard) prevents an ad from playing and retaliates by forcing the player resolution to 160p, leaving it there even after the ad would have ended. This makes the stream unwatchable and pressures the user to disable their ad blocker.

## Goal

Ship a Manifest V3 Chrome extension — **QualityGuard for Twitch** — that detects this forced downgrade on live Twitch channel pages and silently restores the user's preferred quality. Targets the Chrome Web Store, so naming, permissions, and behavior must be store-friendly.

## Non-goals

- Blocking ads (out of scope; that's the ad blocker's job).
- Supporting non-live contexts (VODs, clips, embeds) in v1.
- Browsers other than Chrome / Chromium-based browsers in v1.
- Twitch desktop or mobile app.

## User Stories

1. *As a viewer*, when Twitch forces my quality to 160p after an ad block, the extension restores it within ~1 second so I don't notice.
2. *As a viewer*, when I deliberately pick a lower quality (e.g. on mobile data tethering), the extension respects my choice and does not fight me.
3. *As a viewer*, I can configure trigger sensitivity, target quality, and feedback in a popup.
4. *As a viewer*, I can see how many times the extension has restored quality on the current page (badge) and lifetime (popup stats).

## Settings (configurable in popup)

| Setting | Type | Default | Notes |
|---|---|---|---|
| Master enabled | toggle | on | Disables all logic when off. |
| Trigger | radio | "Only when forced to 160p" | Other options: "Any drop from preferred quality", "Any change from Auto". |
| Target quality | dropdown | "Source" | Options: Auto, Source, 1080p60, 720p60, 480p, 360p, 160p. |
| Show toast | toggle | on | In-player confirmation when a reset happens. |

Stats (read-only in popup):
- Lifetime reset count.
- Last reset timestamp (relative).
- Per-tab count (matches badge).

## Architecture

Manifest V3 extension with these components:

```
ChromeAutoAuto/
├── manifest.json
├── src/
│   ├── content.js      — orchestrator, runs on live channel pages (isolated world)
│   ├── injected.js     — talks to Twitch's player (page world)
│   ├── background.js   — service worker, badge + lifetime stats
│   ├── popup.html
│   ├── popup.js        — settings UI + stats
│   └── storage.js      — shared chrome.storage helpers
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Why two scripts in the page

Content scripts run in an isolated JavaScript world and cannot reach `window.Twitch` or the React player instance. `injected.js` is added to the page via `<script>` tag (declared in `web_accessible_resources`) and communicates with `content.js` via `window.postMessage`. This is the standard Chrome-extension pattern for poking at a page's runtime objects.

### Manifest highlights

- `manifest_version: 3`
- `host_permissions: ["https://www.twitch.tv/*"]`
- `permissions: ["storage"]`
- Content script `matches: ["https://www.twitch.tv/*"]` with a JS-side guard that only activates on live channel URLs (excludes `/videos/`, `/directory`, `/p/`, etc.).
- `web_accessible_resources` exposes `injected.js` to the page.
- `action` (popup) and `background` (service worker) declared.

## Components

### `content.js` (isolated world)
- Detects channel page activation via URL pattern matching + listening for SPA navigation events (`pushState`/`popstate` patched once at load).
- Injects `injected.js` once per page (idempotent).
- Loads settings from `chrome.storage.sync` and subscribes to changes.
- Watches the `<video>` element for `resize` and `loadedmetadata` events; primary downgrade signal is `videoHeight`.
- Tracks a `userInteractionAt` timestamp via a click listener on the Settings button, so we can suppress resets when the user is using the menu themselves.
- Decides whether a quality change qualifies as a "punishment" event based on the active trigger setting.
- Sends `RESET_QUALITY` messages to the page via `postMessage`.
- Falls back to UI automation (clicks) if the API path fails 3 consecutive times.
- Renders the toast notification element inside the player container.
- Sends `INCREMENT_BADGE` messages to the service worker on success.

### `injected.js` (page world)
- Locates the Twitch player object by walking the React fiber tree starting from the `<video>` element. The player exposes methods like `setQuality(group)`, `getQuality()`, and `getQualities()`.
- Exposes a small message protocol over `window.postMessage`:
  - `{type: 'AUTOQUALITY_SET', target: '<group>', id: <n>}` → attempts `setQuality`, replies with `{type: 'AUTOQUALITY_RESULT', id: <n>, ok: <bool>, error?: <string>}`.
  - `{type: 'AUTOQUALITY_GET', id: <n>}` → replies with current quality.
- On first load, if user's target is a fixed quality (Source, 1080p60, …), writes `localStorage["video-quality"] = JSON.stringify({"default": "<group>"})` so the very first manifest request loads at the right quality.
- Polls (`requestAnimationFrame`) up to 10 seconds for the player object; if not found, replies with `not_ready`.

### `background.js` (service worker)
- Holds an in-memory map `tabId → resetCount`. Wipes on `chrome.tabs.onRemoved` and on cross-origin navigation.
- On `INCREMENT_BADGE`: increments per-tab counter, calls `chrome.action.setBadgeText({tabId, text})`.
- On `INCREMENT_BADGE`: also increments lifetime counter in `chrome.storage.local` and stamps `lastResetAt`.

### `popup.html` / `popup.js`
- Plain HTML + minimal JS, no framework needed.
- Reads/writes settings via `storage.js`.
- Re-renders stats every time the popup opens.

### `storage.js`
- `getSettings() / setSettings(partial)` against `chrome.storage.sync`.
- `getStats() / incrementStats()` against `chrome.storage.local`.
- `subscribe(callback)` wraps `chrome.storage.onChanged` and filters to settings only.
- Defaults centralized here so popup, content, and background agree.

## Data Flow

### On page load (proactive)

1. URL matches a live channel page → `content.js` activates.
2. Settings loaded; if disabled, exit.
3. `injected.js` injected via `<script>`.
4. `injected.js` reads `localStorage["video-quality"]`. If user's target is a fixed quality and the current value differs, writes the preferred value before the player initializes.
5. `injected.js` waits (up to 10s) for the player object; once found, calls `setQuality(target)` if current quality differs from target.
6. `content.js` attaches `resize` / `loadedmetadata` listeners to the `<video>` element (re-attaching if the element is replaced — Twitch occasionally swaps it).

### On forced downgrade (reactive)

1. `<video>` fires `resize` with new dimensions.
2. `content.js` reads `videoHeight` and compares to last known.
3. Trigger evaluation:
   - "Only when forced to 160p": match if `videoHeight === 160` (or close — use `<= 200` to absorb manifest variation).
   - "Any drop from preferred quality": match if new height < height of target setting.
   - "Any change from Auto": match if current player setting !== `auto` and previous was `auto`.
4. Loop guard: if `Date.now() - lastResetAt < 1500`, skip.
5. User-action guard: if `Date.now() - userInteractionAt < 3000`, skip.
6. Send `AUTOQUALITY_SET` to page world with target group.
7. On `ok: true` reply: stamp `lastResetAt`, render toast (if enabled), increment badge, store `lastQualitySetByUs`.
8. On `ok: false` reply (3 times in a row): switch to UI automation fallback for next attempt.

### UI automation fallback path

1. Click `[data-a-target="player-settings-menu"]` parent button (Settings).
2. Wait for the quality submenu to render (poll for `[data-a-target="player-settings-submenu-quality-option"]`).
3. Find the option whose label matches the target (e.g. "Source", "Auto").
4. Click it.
5. Press Escape to close any remaining menu.

Selector resolution priority: user-provided CSS selectors → `data-a-target` attributes → ARIA roles. If all three layers fail, log to console and stop trying for this page.

### On settings change

`chrome.storage.onChanged` → content script picks up new values without reload. If "enabled" goes false, detach listeners; if true, re-arm.

### On SPA navigation

`pushState` / `popstate` listeners re-run page-load logic. Detach old listeners first to prevent duplicates.

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Player API not yet mounted | Poll up to 10s; fall back to UI clicks if still missing. |
| Twitch renames player methods | API path fails → automatic fallback to UI clicks. |
| User manually picks quality | 3s suppression window after Settings button click. |
| Rapid repeat downgrades | 1.5s cooldown; exponential backoff (5s/10s/20s) after 3 resets in 10s. |
| Selectors break (redesign) | Three-layer fallback: CSS → `data-a-target` → ARIA. |
| Both API and UI paths fail 5x in 60s | Log warning, stop trying. User can toggle off/on to retry. |
| Theatre / fullscreen / PiP | `<video>` persists; toast renders in player container so it follows fullscreen. |
| Video element swap | Listener re-attach on every `resize`/`loadedmetadata` (cheap). |
| SPA channel switch | Re-arm content script logic. |
| Storage quota | Negligible: lifetime count + ISO timestamp + small settings object. |

## Testing

### Layer 1 — Unit tests (Vitest)
- `shouldReset(prevQuality, newQuality, settings)` — table-driven coverage of all trigger modes.
- Cooldown / backoff state machine.
- Settings storage helpers with `chrome.storage` mocked.
- Selector fallback chain (provide a fake DOM, drop selectors one at a time, assert correct fallback fires).

### Layer 2 — Manual smoke checklist (in `docs/test-plan.md`, written alongside implementation)
- Load unpacked extension; open live Twitch channel.
- Force quality to 160p via menu, confirm extension restores it.
- Verify badge increments per reset.
- Clear `localStorage`, reload, confirm Source loads first (proactive).
- Open settings menu, manually pick 720p, confirm extension does NOT reset for 3 seconds.
- Switch channels via sidebar (SPA navigation), confirm logic re-arms.
- Toggle master enabled off → confirm no resets fire.
- Verify settings persistence across browser restart.

### Layer 3 — Integration tests (deferred)
Puppeteer/Playwright with extension loaded. Defer until v1 ships and manual flow is stable.

## Open Questions

None blocking — all design decisions resolved in brainstorming.

## Future Work (not in v1)

- VOD / clips / embed support.
- Firefox port (manifest differences are minor).
- Per-channel overrides (if a channel always streams at 720p, don't fight it).
- Telemetry opt-in (count of resets across users, helps detect Twitch tactic changes).
