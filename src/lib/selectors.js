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

const QUALITY_MENU_SELECTORS = [
  '[data-a-target="player-settings-menu-item-quality"]',
  '[data-a-target="player-settings-menuitem-quality"]',
  '[role="menuitem"][data-a-target*="quality" i]',
  'button[data-a-target*="quality" i]'
];

const QUALITY_MENU_WORDS = ['quality', 'kvalitet'];

function getLabelText(el) {
  return [
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.textContent
  ].filter(Boolean).join(' ').trim();
}

export function findSettingsButton(root = document) {
  for (const sel of SETTINGS_BUTTON_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }

  const controlButtons = root.querySelectorAll('#channel-player .player-controls__right-control-group button');
  for (const el of controlButtons) {
    const text = getLabelText(el).toLowerCase();

    if (SETTINGS_WORDS.some(word => text.includes(word))) return el;
  }

  return null;
}

export function findQualityMenuButton(root = document) {
  for (const sel of QUALITY_MENU_SELECTORS) {
    const el = root.querySelector(sel);
    if (el && el.getAttribute('role') !== 'menuitemradio') return el;
  }

  const menuItems = root.querySelectorAll('[role="menuitem"], button, [data-a-target*="quality" i]');
  for (const el of menuItems) {
    if (el.getAttribute('role') === 'menuitemradio') continue;
    if (el.matches?.('[data-a-target="player-settings-submenu-quality-option"]')) continue;

    const text = getLabelText(el).toLowerCase();
    if (QUALITY_MENU_WORDS.some(word => text.includes(word))) return el;
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
