import { getSettings, subscribeSettings, recordReset } from './storage.js';
import { createLogger } from './debug.js';
import { shouldReset } from './lib/trigger.js';
import { createCooldown } from './lib/cooldown.js';
import { findSettingsButton, findQualityMenuButton, findQualityOptions, findOptionByLabel } from './lib/selectors.js';
import { MSG } from './lib/messages.js';

let settings;
let log = () => {};
const cooldown = createCooldown();
let lastHeight = null;
let consecutiveApiFailures = 0;
let messageId = 0;
const pendingMessages = new Map();
let deferredResetTimer = null;

const DEFERRED_RESET_MS = 3200;

function isLiveChannelUrl(url = location.href) {
  const u = new URL(url);
  if (u.hostname !== 'www.twitch.tv') return false;

  const path = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return false;

  const reserved = new Set([
    'videos',
    'directory',
    'p',
    'settings',
    'subscriptions',
    'inventory',
    'wallet',
    'search',
    'following'
  ]);
  const [first] = path.split('/');
  return !reserved.has(first) && !path.includes('/');
}

function injectScript() {
  if (document.getElementById('qualityguard-injected')) return;

  const s = document.createElement('script');
  s.id = 'qualityguard-injected';
  s.src = chrome.runtime.getURL('src/injected.js');
  s.type = 'module';
  (document.head || document.documentElement).appendChild(s);
}

function postToPage(message, timeoutMs = 4000) {
  const id = ++messageId;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingMessages.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);

    pendingMessages.set(id, payload => {
      clearTimeout(timer);
      pendingMessages.delete(id);
      resolve(payload);
    });

    window.postMessage({ ...message, id }, '*');
  });
}

function reportEvent(event, detail = {}) {
  chrome.runtime.sendMessage({
    type: MSG.DEBUG_EVENT,
    event,
    target: settings?.targetQuality,
    height: lastHeight,
    ...detail
  });
}

window.addEventListener('message', event => {
  if (event.source !== window || !event.data || event.data.type !== MSG.AUTOQUALITY_RESULT) return;

  const handler = pendingMessages.get(event.data.id);
  if (handler) handler(event.data);
});

function showToast(text) {
  if (!settings.showToast) return;

  const toast = document.createElement('div');
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(20, 20, 24, 0.85)',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '4px',
    font: '12px system-ui',
    zIndex: 9999,
    pointerEvents: 'none',
    transition: 'opacity 0.3s',
    opacity: '1'
  });
  document.documentElement.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 1700);
  setTimeout(() => toast.remove(), 2000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function activationTarget(el) {
  return el.closest?.('button, [role="menuitem"], [role="menuitemradio"]') ?? el;
}

function dispatchPointerSequence(el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;

  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;

  const target = document.elementFromPoint(x, y) ?? el;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
    view: window
  };

  if (typeof PointerEvent !== 'undefined') {
    target.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent('mousedown', eventInit));
  if (typeof PointerEvent !== 'undefined') {
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
  target.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));
  return true;
}

function activateElement(el, { keyboard = false } = {}) {
  const target = activationTarget(el);
  target.focus?.();
  const pointerOk = dispatchPointerSequence(target);
  target.click?.();

  if (keyboard || !pointerOk) {
    for (const key of ['Enter', ' ']) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, composed: true }));
    }
  }
}

function currentQualityValue(current) {
  if (current === null || current === undefined) return null;
  if (typeof current === 'string') return current;
  if (typeof current === 'object') {
    return current.group
      ?? current.quality
      ?? current.name
      ?? current.label
      ?? current.value
      ?? null;
  }
  return String(current);
}

function qualityMatchesTarget(current, target) {
  const value = currentQualityValue(current);
  if (!value) return false;

  const normalized = String(value).toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget === 'chunked') return normalized.includes('chunked') || normalized.includes('source');
  if (normalizedTarget === 'auto') return normalized.includes('auto');
  return normalized.startsWith(normalizedTarget);
}

function storedDefaultQuality() {
  try {
    const parsed = JSON.parse(localStorage.getItem('video-quality') ?? 'null');
    return parsed?.default ?? null;
  } catch {
    return null;
  }
}

function storedDefaultMatchesTarget(storedDefault, target) {
  if (!storedDefault) return false;
  return qualityMatchesTarget(storedDefault, target);
}

async function verifyTargetQuality(target) {
  await sleep(250);
  const result = await postToPage({ type: MSG.AUTOQUALITY_GET }, 1500);
  const storedDefault = storedDefaultQuality();

  if (!result.ok) {
    log('quality verification failed:', result.error);
    const ok = storedDefaultMatchesTarget(storedDefault, target);
    reportEvent('verify_failed', { ok, error: result.error, current: storedDefault });
    return ok;
  }

  const ok = qualityMatchesTarget(result.current, target) || storedDefaultMatchesTarget(storedDefault, target);
  log('quality verification:', result.current, 'storedDefault=', storedDefault, 'target=', target, 'ok=', ok);
  reportEvent('verify_result', { ok, current: { player: result.current, storedDefault } });
  return ok;
}

async function uiAutomationFallback(target) {
  const button = findSettingsButton();
  if (!button) {
    reportEvent('ui_no_settings_button');
    return false;
  }

  reportEvent('ui_open_settings');
  activateElement(button);
  let clickedQualityMenu = false;

  for (let i = 0; i < 40; i++) {
    await sleep(50);

    const opts = findQualityOptions();
    if (opts.length) {
      const targetLabel = target === 'chunked' ? 'Source' : target === 'auto' ? 'Auto' : target;
      const opt = findOptionByLabel(opts, targetLabel) ?? findOptionByLabel(opts, '1080') ?? opts[1] ?? opts[0];
      if (opt) {
        reportEvent('ui_select_option', { detail: opt.label });
        activateElement(opt.element, { keyboard: true });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true }));
        return true;
      }
    }

    if (!clickedQualityMenu) {
      const qualityButton = findQualityMenuButton();
      if (qualityButton) {
        reportEvent('ui_open_quality_menu', { detail: qualityButton.textContent?.trim() ?? null });
        activateElement(qualityButton, { keyboard: true });
        await sleep(150);
        clickedQualityMenu = true;
      }
    }
  }

  reportEvent('ui_timeout');
  return false;
}

async function performReset(reason) {
  log('reset triggered:', reason, 'target=', settings.targetQuality);
  reportEvent('reset_start', { detail: reason });

  let result;
  let resetSucceeded = false;
  if (consecutiveApiFailures < 3) {
    result = await postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
  } else {
    result = { ok: false, error: 'api_disabled_until_next_page' };
  }

  if (result.ok) {
    reportEvent('api_set_result', { ok: true });
    consecutiveApiFailures = 0;
    resetSucceeded = settings.targetQuality !== 'auto' && await verifyTargetQuality(settings.targetQuality);
    if (!resetSucceeded && settings.targetQuality === 'auto') {
      log('auto target requires explicit UI selection');
      reportEvent('api_auto_requires_ui');
    }
  } else {
    consecutiveApiFailures++;
    log('api failed:', result.error);
    reportEvent('api_set_result', { ok: false, error: result.error });
  }

  if (!resetSucceeded) {
    log('falling back to UI selection');
    reportEvent('ui_fallback_start');
    const uiOk = await uiAutomationFallback(settings.targetQuality);
    if (!uiOk) {
      log('UI fallback failed');
      reportEvent('ui_fallback_failed');
      return;
    }
    resetSucceeded = settings.targetQuality === 'auto' ? await verifyTargetQuality(settings.targetQuality) : await verifyTargetQuality(settings.targetQuality);
  }

  if (!resetSucceeded) {
    reportEvent('reset_unverified');
    return;
  }

  reportEvent('reset_success');
  cooldown.recordAttempt(performance.now());
  showToast(`Quality restored to ${settings.targetQuality === 'chunked' ? 'Source' : settings.targetQuality}`);
  await recordReset();
  chrome.runtime.sendMessage({ type: MSG.INCREMENT_BADGE, height: lastHeight, target: settings.targetQuality });
}

function scheduleDeferredReset(video, observedHeight, reason) {
  if (deferredResetTimer) clearTimeout(deferredResetTimer);

  log('reset deferred:', reason, 'height=', observedHeight);
  reportEvent('reset_deferred', { detail: reason, height: observedHeight });
  deferredResetTimer = setTimeout(() => {
    deferredResetTimer = null;
    if (!settings.enabled) {
      reportEvent('deferred_skip_disabled', { height: observedHeight });
      return;
    }
    if (!video.isConnected || video.videoHeight !== observedHeight) {
      reportEvent('deferred_skip_changed', { height: video.videoHeight, detail: `expected ${observedHeight}` });
      return;
    }
    if (!cooldown.canAttempt(performance.now())) {
      reportEvent('deferred_skip_cooldown', { height: observedHeight });
      return;
    }
    performReset(`${reason} after suppression`);
  }, DEFERRED_RESET_MS);
}

function attachVideoListeners(video) {
  const onResize = () => {
    const h = video.videoHeight;
    if (!h) return;

    if (shouldReset(lastHeight, h, settings)) {
      reportEvent('resize_trigger', { height: h, detail: `from ${lastHeight}` });
      if (cooldown.canAttempt(performance.now())) {
        performReset('video resize');
      } else {
        scheduleDeferredReset(video, h, 'video resize');
      }
    }
    lastHeight = h;
  };

  video.addEventListener('resize', onResize);
  video.addEventListener('loadedmetadata', onResize);
  if (video.videoHeight) lastHeight = video.videoHeight;
}

function trackUserInteraction() {
  document.addEventListener('click', e => {
    const btn = findSettingsButton();
    if (btn && (e.target === btn || btn.contains(e.target))) {
      cooldown.recordUserAction(performance.now());
      log('user opened settings menu');
    }
  }, true);
}

function watchForVideo() {
  let attached = null;

  const tryAttach = () => {
    const video = document.querySelector('video');
    if (video && video !== attached) {
      attached = video;
      attachVideoListeners(video);
      log('attached to video element');
    }
  };

  tryAttach();
  const observer = new MutationObserver(tryAttach);
  observer.observe(document.body, { childList: true, subtree: true });
}

function patchHistoryEvents() {
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    const r = origPush.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
    return r;
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
}

async function activate() {
  if (!isLiveChannelUrl()) return;

  injectScript();
  postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
  watchForVideo();
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === MSG.CMD_TOGGLE) showToast(`QualityGuard ${settings.enabled ? 'enabled' : 'disabled'}`);
  if (msg?.type === MSG.CMD_FORCE_RESET) {
    if (cooldown.canAttempt(performance.now(), { force: true })) performReset('manual command');
  }
});

(async () => {
  settings = await getSettings();
  log = createLogger(() => settings.debugMode);
  subscribeSettings(s => {
    settings = s;
    log = createLogger(() => settings.debugMode);
  });
  trackUserInteraction();
  patchHistoryEvents();
  window.addEventListener('locationchange', activate);
  activate();
})();
