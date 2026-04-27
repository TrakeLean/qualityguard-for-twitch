# QualityGuard for Twitch - Manual Smoke Test Plan

Run this checklist after every meaningful change before tagging a release.

## Setup
1. `npm run build`
2. `chrome://extensions` -> Developer mode -> "Load unpacked" -> select `dist/`.
3. Open `https://www.twitch.tv/<a popular live channel>` in a fresh tab.

## Core flows

### 1. Reactive recovery from forced 160p
- Open settings (gear icon) -> Quality -> pick **160p**.
- Within ~1.5s, expect:
  - Quality jumps back to Source (or your configured target).
  - Toast appears: "Quality restored to Source".
  - Toolbar badge increments by 1.

### 2. Proactive on page load
- In DevTools console: `localStorage.removeItem('video-quality')`.
- Reload the channel page.
- Expect the stream to start at Source (or configured target) immediately, not Auto.

### 3. Respects manual user picks
- Click Settings -> Quality -> pick **720p**.
- Expect QualityGuard to NOT reset for at least 3 seconds.
- After 3s, manually switch to 160p - extension should now reset back to target.

### 4. SPA navigation
- Click a different live channel from the sidebar (no full reload).
- Repeat flow 1 - extension should still react on the new channel.

### 5. Disabled toggle
- Open popup, uncheck "Enabled".
- Drop quality to 160p - extension should NOT reset. Badge should not increment.
- Re-enable. Verify resets resume.

### 6. Stats and per-tab counter
- Trigger 3 resets on tab A.
- Open popup on tab A - "This tab" reads 3.
- Switch to a non-Twitch tab - toolbar badge clears (per-tab).
- Return to tab A - badge shows 3 again.
- "Lifetime" reflects all resets across the session.
- "Last reset" shows a recent relative time.

### 7. Keyboard shortcuts
- Alt+Shift+Q on a Twitch tab - toggles enabled. Toast confirms.
- Alt+Shift+R - forces a reset (badge increments even with no recent drop).

### 8. Debug mode
- Toggle "Debug mode" on. Open DevTools console on the channel page.
- Trigger a reset. Console shows `[QualityGuard]` lines describing the flow.
- Toggle off. New events do not log.

### 9. Diagnostics export
- Click "Copy debug info" in popup.
- Paste into a text editor. Verify JSON has: `version`, `settings`, `stats`, `recentEvents` (with at least one entry from earlier flows).

### 10. UI fallback path (optional, harder to trigger)
- In DevTools, monkey-patch the player to throw on `setQuality`: pick a video, run `document.querySelector('video').__reactFiber$xxx` and inspect the player path.
- Skip if too fiddly; instead trust unit tests for the selector chain.

## Negative cases

- Open a non-channel Twitch URL (e.g. `/directory`). Confirm the extension is inactive (no badge updates, no console errors).
- Open Twitch in an Incognito window without permission. Confirm the extension is correctly absent.

## Pass criteria

All flows 1-9 pass. No console errors on page or service worker.
