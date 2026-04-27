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
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => tabCounts.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) {
    tabCounts.delete(tabId);
    setBadge(tabId);
  }
});

chrome.commands.onCommand.addListener(async command => {
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
