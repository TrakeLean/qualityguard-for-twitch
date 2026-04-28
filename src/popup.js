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

  document.body.classList.toggle('is-disabled', !settings.enabled);
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('trigger').value = settings.trigger;
  document.getElementById('targetQuality').value = settings.targetQuality;
  document.getElementById('showToast').checked = settings.showToast;
  document.getElementById('debugMode').checked = settings.debugMode;
  document.getElementById('lifetime').textContent = String(stats.lifetimeResets);
  document.getElementById('tab').textContent = String(tabCount);
  document.getElementById('last').textContent = relativeTime(stats.lastResetAt);
  document.getElementById('debugActions').hidden = !settings.debugMode;
  document.getElementById('guardStatus').textContent = settings.enabled ? 'Guard active' : 'Guard off';
}

function bind(id, key, prop = 'checked') {
  document.getElementById(id).addEventListener('change', async e => {
    await setSettings({ [key]: e.target[prop] });
    render();
  });
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
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
});

render();
