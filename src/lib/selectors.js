const SETTINGS_BUTTON_SELECTORS = [
  '[data-a-target="player-settings-button"]',
  'button[aria-label*="Settings" i]',
  'button[title*="Settings" i]',
  'button[aria-label*="Innstilling" i]',
  'button[title*="Innstilling" i]'
];

const SETTINGS_WORDS = ['settings', 'innstilling', 'inställning', 'indstilling'];

const QUALITY_OPTION_SELECTORS = [
  '[data-a-target="player-settings-submenu-quality-option"]',
  '[role="menuitemradio"]'
];

export function findSettingsButton(root = document) {
  for (const sel of SETTINGS_BUTTON_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }

  const controlButtons = root.querySelectorAll('#channel-player .player-controls__right-control-group button');
  for (const el of controlButtons) {
    const text = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.textContent
    ].filter(Boolean).join(' ').toLowerCase();

    if (SETTINGS_WORDS.some(word => text.includes(word))) return el;
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
