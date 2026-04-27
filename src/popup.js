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
