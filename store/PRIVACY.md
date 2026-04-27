# QualityGuard for Twitch - Privacy Policy

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
