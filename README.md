# QualityGuard for Twitch

QualityGuard for Twitch is a Chrome extension that restores your preferred Twitch player quality after unwanted forced downgrades.

It watches live Twitch channel pages, detects quality drops, and resets the player back to your configured target quality so you do not have to reopen Twitch player settings manually.

## Features

- Detects forced drops to 160p on live Twitch streams
- Optional mode for restoring any drop below your preferred quality
- Supports Auto, Source, 1080p60, 720p60, 480p, 360p, and 160p targets
- Restores quality through Twitch player APIs when available, with a UI fallback path
- Shows an optional in-player toast after a successful restore
- Adds a player control button for toggling QualityGuard on supported pages
- Tracks lifetime and per-tab restore counts
- Provides keyboard shortcuts for toggling and manual resets
- Includes debug mode with diagnostic export from the popup

QualityGuard does not block ads, modify Twitch network requests, or change unrelated Twitch features.

## Installation

### From source

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Build the extension:

   ```powershell
   npm run build
   ```

3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the generated `dist/` directory.
7. Open a live Twitch channel page at `https://www.twitch.tv/<channel>`.

## Usage

Open the extension popup to configure:

- **Enabled**: turn QualityGuard on or off.
- **Trigger**: restore only forced 160p drops, or restore any drop below the preferred quality.
- **Target quality**: choose Auto, Source, or a fixed quality target.
- **Show toast in player**: show a short confirmation when quality is restored.
- **Debug mode**: expose diagnostic export controls.

Default settings:

- Enabled: `true`
- Trigger: `Only when forced to 160p`
- Target quality: `Source`
- Toasts: `true`
- Debug mode: `false`

Keyboard shortcuts:

- `Alt+Shift+Q`: toggle QualityGuard on or off.
- `Alt+Shift+R`: force a quality reset on the current Twitch tab.

## Development

Install dependencies:

```powershell
npm install
```

Build once:

```powershell
npm run build
```

Build in watch mode:

```powershell
npm run watch
```

Run tests:

```powershell
npm test
```

Regenerate extension icons:

```powershell
npm run icons
```

The build script bundles the extension source with esbuild and copies the manifest, popup HTML/CSS, and icons into `dist/`.

## Project Structure

```text
src/
  background.js       Extension service worker and command handling
  content.js          Twitch page integration and quality restore flow
  injected.js         Page-context Twitch player API bridge
  popup.html          Extension popup markup
  popup.css           Extension popup styles
  popup.js            Popup settings, stats, and diagnostics UI
  storage.js          Chrome storage helpers
  lib/                Shared defaults, messages, selectors, trigger logic, cooldowns

tests/                Vitest unit tests and Chrome API test setup
docs/                 Manual test plan and planning notes
icons/                Extension icon source and rendered icons
store/                Store listing copy, screenshots, privacy policy, promo assets
scripts/              Asset and icon rendering scripts
dist/                 Generated extension build output
```

## Testing

Automated tests cover storage behavior, trigger logic, selector helpers, cooldowns, and debug support:

```powershell
npm test
```

Before release, run the manual smoke checklist in [docs/test-plan.md](docs/test-plan.md). It covers live Twitch flows, popup state, badge counts, keyboard shortcuts, diagnostics export, and negative cases.

## Privacy

QualityGuard stores settings and restore statistics locally through Chrome storage. It does not collect personal data, track browsing history, or send data to external servers.

See [store/PRIVACY.md](store/PRIVACY.md) for the full privacy policy.

## Limitations

- Designed for live Twitch channel pages.
- Available quality options depend on the stream.
- Twitch UI or player internals may change, which can require selector or integration updates.
- Does not block ads.
- Does not modify Twitch network requests.

## Release Notes

Release and store-facing material lives under `store/`, including listing copy, screenshots, promo assets, and the privacy policy. Build output is generated into `dist/` and should be rebuilt before loading or packaging the extension.
