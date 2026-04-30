import { getSettings, subscribeSettings, recordReset, setSettings } from './storage.js';
import { createLogger } from './debug.js';
import { shouldEnforceCurrentHeight, shouldReset } from './lib/trigger.js';
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
let readyResolve = null;
let injectedReady = false;
let videoObserver = null;
let attachedVideo = null;
let qualityWatchdogTimer = null;
let playerControlsObserver = null;

const DEFERRED_RESET_MS = 3200;
const QUALITY_WATCHDOG_MS = 2000;
const PLAYER_TOGGLE_ID = 'qualityguard-player-toggle';
const PLAYER_TOGGLE_STYLE_ID = 'qualityguard-player-toggle-style';

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
  if (document.getElementById('qualityguard-injected')) return waitForInjectedReady();

  const s = document.createElement('script');
  s.id = 'qualityguard-injected';
  s.src = chrome.runtime.getURL('src/injected.js');
  s.type = 'module';
  (document.head || document.documentElement).appendChild(s);
  return waitForInjectedReady();
}

function waitForInjectedReady(timeoutMs = 2500) {
  if (injectedReady) return Promise.resolve(true);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      if (readyResolve === wrappedResolve) readyResolve = null;
      resolve(false);
    }, timeoutMs);

    const wrappedResolve = () => {
      clearTimeout(timer);
      resolve(true);
    };

    readyResolve = wrappedResolve;
  });
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
  if (event.source !== window || !event.data) return;

  if (event.data.type === MSG.AUTOQUALITY_READY) {
    injectedReady = true;
    if (readyResolve) {
      const resolve = readyResolve;
      readyResolve = null;
      resolve();
    }
    return;
  }

  if (event.data.type !== MSG.AUTOQUALITY_RESULT) return;

  const handler = pendingMessages.get(event.data.id);
  if (handler) handler(event.data);
});

function showToast(text) {
  if (!settings.showToast) return;

  const player = document.querySelector('[data-a-target="video-player"], [data-a-target="video-ref"], .video-player__container, video');
  const rect = player?.getBoundingClientRect?.();
  const top = rect && rect.width && rect.height ? Math.max(12, rect.top + 16) : 12;
  const left = rect && rect.width && rect.height ? rect.left + rect.width / 2 : window.innerWidth / 2;

  const toast = document.createElement('div');
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
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

function ensurePlayerToggleStyles() {
  if (document.getElementById(PLAYER_TOGGLE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = PLAYER_TOGGLE_STYLE_ID;
  style.textContent = `
    .qualityguard-player-toggle-slot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    #${PLAYER_TOGGLE_ID} {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 2px;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: #fff;
      cursor: pointer;
      vertical-align: middle;
    }

    #${PLAYER_TOGGLE_ID}:hover,
    #${PLAYER_TOGGLE_ID}:focus-visible {
      background: rgba(255, 255, 255, 0.16);
      outline: none;
    }

    #${PLAYER_TOGGLE_ID} svg {
      display: block;
      width: 24px;
      height: 24px;
      overflow: visible;
      pointer-events: none;
    }

    #${PLAYER_TOGGLE_ID} .qualityguard-player-toggle-slash {
      opacity: 0;
      transition: opacity 140ms ease;
    }

    #${PLAYER_TOGGLE_ID}[data-enabled="false"] .qualityguard-player-toggle-slash {
      opacity: 1;
    }

    #${PLAYER_TOGGLE_ID}[data-enabled="false"] .qualityguard-player-toggle-logo {
      opacity: 0.72;
      filter: grayscale(0.35);
    }
  `;
  document.documentElement.appendChild(style);
}

function playerToggleSvg() {
  return `
    <svg viewBox="56 64 400 400" focusable="false" aria-hidden="true" role="presentation">
      <g class="qualityguard-player-toggle-logo">
        <path fill="#9146FF" fill-rule="evenodd" d="M256 64 L432 128 L432 272 C432 368 352 432 256 464 C160 432 80 368 80 272 L80 128 Z M256 168 L352 280 L296 280 L296 360 L216 360 L216 280 L160 280 Z"></path>
      </g>
      <path class="qualityguard-player-toggle-slash" d="M104 408 L408 104" fill="none" stroke="#FF4D4D" stroke-width="52" stroke-linecap="round"></path>
      <path class="qualityguard-player-toggle-slash" d="M104 408 L408 104" fill="none" stroke="rgba(20,20,24,.86)" stroke-width="24" stroke-linecap="round"></path>
    </svg>
  `;
}

function updatePlayerToggleButton() {
  const button = document.getElementById(PLAYER_TOGGLE_ID);
  if (!button || !settings) return;

  button.dataset.enabled = String(Boolean(settings.enabled));
  button.setAttribute('aria-label', settings.enabled ? 'Disable QualityGuard' : 'Enable QualityGuard');
  button.title = settings.enabled ? 'Disable QualityGuard' : 'Enable QualityGuard';
}

async function toggleQualityGuardFromPlayer() {
  const nextEnabled = !settings.enabled;
  showToast(`QualityGuard ${nextEnabled ? 'enabled' : 'disabled'}`);
  await setSettings({ enabled: nextEnabled });
}

function createPlayerToggleButton() {
  const button = document.createElement('button');
  button.id = PLAYER_TOGGLE_ID;
  button.type = 'button';
  button.dataset.aTarget = 'qualityguard-player-toggle';
  button.innerHTML = playerToggleSvg();
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleQualityGuardFromPlayer();
  });
  return button;
}

function removePlayerToggleButton() {
  document.getElementById(PLAYER_TOGGLE_ID)?.closest('.qualityguard-player-toggle-slot')?.remove();
}

function ensurePlayerToggleButton() {
  if (!isLiveChannelUrl()) {
    removePlayerToggleButton();
    return;
  }

  ensurePlayerToggleStyles();

  const existing = document.getElementById(PLAYER_TOGGLE_ID);
  if (existing?.isConnected) {
    updatePlayerToggleButton();
    return;
  }

  const rightControls = document.querySelector('.player-controls__right-control-group');
  if (!rightControls) return;

  const slot = document.createElement('div');
  slot.className = 'qualityguard-player-toggle-slot';
  slot.appendChild(createPlayerToggleButton());

  let anchor = findSettingsButton(rightControls);
  while (anchor?.parentElement && anchor.parentElement !== rightControls) {
    anchor = anchor.parentElement;
  }

  if (anchor?.parentElement === rightControls) {
    rightControls.insertBefore(slot, anchor);
  } else {
    rightControls.insertBefore(slot, rightControls.firstChild);
  }

  updatePlayerToggleButton();
}

function watchForPlayerControls() {
  ensurePlayerToggleButton();
  if (playerControlsObserver) return;

  playerControlsObserver = new MutationObserver(ensurePlayerToggleButton);
  playerControlsObserver.observe(document.body, { childList: true, subtree: true });
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
  if (normalizedTarget === 'chunked') {
    if (normalized.includes('chunked') || normalized.includes('source')) return true;
    if (typeof current === 'object') {
      return String(current.variantSource ?? '').toLowerCase() === 'source'
        || String(current.sourceId ?? '').toLowerCase() === 'source'
        || String(current.sourceType ?? '').toLowerCase() === 'source';
    }
    return false;
  }
  if (normalizedTarget === 'auto') return normalized.includes('auto');
  return normalized.startsWith(normalizedTarget);
}

function heightFromQualityValue(current) {
  if (typeof current === 'object' && Number(current.height) > 0) return Number(current.height);

  const value = currentQualityValue(current);
  if (!value) return null;

  const match = String(value).match(/(\d{3,4})p/i);
  return match ? Number(match[1]) : null;
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
    reportEvent('verify_failed', { ok: false, error: result.error, current: storedDefault });
    return false;
  }

  const ok = qualityMatchesTarget(result.current, target);
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
      return false;
    }
    resetSucceeded = settings.targetQuality === 'auto' ? await verifyTargetQuality(settings.targetQuality) : await verifyTargetQuality(settings.targetQuality);
  }

  if (!resetSucceeded) {
    reportEvent('reset_unverified');
    return false;
  }

  reportEvent('reset_success');
  cooldown.recordAttempt(performance.now());
  showToast(`Quality restored to ${settings.targetQuality === 'chunked' ? 'Source' : settings.targetQuality}`);
  await recordReset();
  chrome.runtime.sendMessage({ type: MSG.INCREMENT_BADGE, height: lastHeight, target: settings.targetQuality });
  return true;
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

async function maybeResetForHeight(h, reason, detail, { enforceCurrent = false } = {}) {
  if (!isLiveChannelUrl()) return false;
  if (!h) return false;

  const shouldResetNow = enforceCurrent
    ? shouldEnforceCurrentHeight(h, settings)
    : shouldReset(lastHeight, h, settings);

  if (!shouldResetNow) return false;

  const current = (await postToPage({ type: MSG.AUTOQUALITY_GET }, 800)).current;
  if (qualityMatchesTarget(current, settings.targetQuality)) {
    const targetHeight = heightFromQualityValue(current);
    if (!targetHeight || h >= targetHeight) {
      reportEvent(`${detail}_skip_already_target`, { height: h, current });
      return false;
    }
  }

  reportEvent(`${detail}_trigger`, { height: h, detail: `from ${lastHeight}` });
  if (cooldown.canAttempt(performance.now())) {
    performReset(reason);
  } else {
    const video = document.querySelector('video');
    if (video) scheduleDeferredReset(video, h, reason);
  }
  return true;
}

function startQualityWatchdog() {
  if (qualityWatchdogTimer) return;

  qualityWatchdogTimer = setInterval(() => {
    if (!settings.enabled || !isLiveChannelUrl()) return;

    const video = document.querySelector('video');
    const h = video?.videoHeight ?? null;
    if (!video || !shouldEnforceCurrentHeight(h, settings)) return;

    if (cooldown.canAttempt(performance.now())) {
      maybeResetForHeight(h, 'quality watchdog', 'watchdog', { enforceCurrent: true });
    } else {
      scheduleDeferredReset(video, h, 'quality watchdog');
    }
  }, QUALITY_WATCHDOG_MS);
}

function attachVideoListeners(video, { checkImmediately = true } = {}) {
  const onResize = () => {
    const h = video.videoHeight;
    if (!h) return;

    maybeResetForHeight(h, 'video resize', 'resize');
    lastHeight = h;
  };

  video.addEventListener('resize', onResize);
  video.addEventListener('loadedmetadata', onResize);
  if (checkImmediately && video.videoHeight) {
    maybeResetForHeight(video.videoHeight, 'video attach', 'attach', { enforceCurrent: true });
    lastHeight = video.videoHeight;
  }
}

async function enforceInitialQuality() {
  const deadline = performance.now() + 15_000;

  while (settings.enabled && isLiveChannelUrl() && performance.now() < deadline) {
    const video = document.querySelector('video');
    const current = (await postToPage({ type: MSG.AUTOQUALITY_GET }, 1500)).current;
    const h = video?.videoHeight || heightFromQualityValue(current);

    if (qualityMatchesTarget(current, settings.targetQuality)) {
      if (h) lastHeight = h;
      reportEvent('initial_quality_ok', { height: h, current });
      postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
      return;
    }

    if (shouldEnforceCurrentHeight(h, settings)) {
      reportEvent('initial_trigger', { height: h, detail: `from ${lastHeight}` });
      const ok = await performReset('initial quality check');
      if (h) lastHeight = h;
      if (ok) return;
      await sleep(750);
      continue;
    }

    if (h && !shouldEnforceCurrentHeight(h, settings)) {
      lastHeight = h;
      postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
      return;
    }

    await sleep(750);
  }

  reportEvent('initial_quality_timeout', { height: document.querySelector('video')?.videoHeight ?? null });
  postToPage({ type: MSG.AUTOQUALITY_SET, target: settings.targetQuality });
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
  let resolveFirstVideo = null;
  const firstVideo = new Promise(resolve => { resolveFirstVideo = resolve; });

  const tryAttach = () => {
    const video = document.querySelector('video');
    if (video && video === attachedVideo) {
      resolveFirstVideo(video);
      return;
    }

    if (video && video !== attachedVideo) {
      attachedVideo = video;
      attachVideoListeners(video);
      log('attached to video element');
      resolveFirstVideo(video);
    }
  };

  tryAttach();
  if (!videoObserver) {
    videoObserver = new MutationObserver(tryAttach);
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }
  return firstVideo;
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
  if (!settings.enabled) return;

  const ready = await injectScript();
  const firstVideo = watchForVideo();
  startQualityWatchdog();
  if (!ready) reportEvent('injected_ready_timeout');

  const video = await Promise.race([firstVideo, sleep(2500).then(() => null)]);
  const h = video?.videoHeight ?? document.querySelector('video')?.videoHeight ?? null;

  if (h) lastHeight = h;
  enforceInitialQuality();
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
    const wasEnabled = settings.enabled;
    settings = s;
    log = createLogger(() => settings.debugMode);
    updatePlayerToggleButton();
    if (!wasEnabled && settings.enabled) activate();
  });
  trackUserInteraction();
  patchHistoryEvents();
  watchForPlayerControls();
  window.addEventListener('locationchange', () => {
    ensurePlayerToggleButton();
    activate();
  });
  activate();
})();
