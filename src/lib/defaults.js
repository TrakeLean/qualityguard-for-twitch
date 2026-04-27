export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  trigger: 'forced160',
  targetQuality: 'chunked',
  showToast: true,
  debugMode: false
});

export const DEFAULT_STATS = Object.freeze({
  lifetimeResets: 0,
  lastResetAt: null
});

export const QUALITY_HEIGHTS = Object.freeze({
  chunked: 1080,
  '1080p60': 1080,
  '720p60': 720,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '160p': 160,
  auto: null
});
