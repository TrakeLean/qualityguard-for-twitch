import { MSG } from './lib/messages.js';
import { findSettingsButton, findQualityMenuButton, findQualityOptions, findOptionByLabel } from './lib/selectors.js';

const PROACTIVE_FLAG = '__qualityguard_proactive_done';

function findPlayerFromVideo(video) {
  if (!video) return null;

  const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;

  let node = video[fiberKey];
  while (node) {
    const inst = node.stateNode;
    if (inst && typeof inst.setQuality === 'function' && typeof inst.getQuality === 'function') {
      return inst;
    }
    if (inst && inst.player && typeof inst.player.setQuality === 'function') {
      return inst.player;
    }
    node = node.return;
  }

  return null;
}

function waitForPlayer(timeoutMs = 10_000) {
  return new Promise(resolve => {
    const start = performance.now();

    function tick() {
      const video = document.querySelector('video');
      const player = findPlayerFromVideo(video);
      if (player) return resolve(player);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    }

    tick();
  });
}

function applyProactiveLocalStorage(target) {
  if (window[PROACTIVE_FLAG]) return;

  window[PROACTIVE_FLAG] = true;

  try {
    const raw = localStorage.getItem('video-quality');
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.default !== target) {
      parsed.default = target;
      localStorage.setItem('video-quality', JSON.stringify(parsed));
    }
  } catch {
    localStorage.setItem('video-quality', JSON.stringify({ default: target }));
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clickElement(el) {
  const target = el.closest?.('button, [role="menuitem"], [role="menuitemradio"]') ?? el;
  target.focus?.();
  target.click?.();
}

async function uiAutomationFallback(target) {
  const button = findSettingsButton();
  if (!button) return { ok: false, error: 'settings_button_not_found' };

  clickElement(button);
  let clickedQualityMenu = false;

  for (let i = 0; i < 40; i++) {
    await sleep(50);

    const opts = findQualityOptions();
    if (opts.length) {
      const targetLabel = target === 'chunked' ? 'Source' : target === 'auto' ? 'Auto' : target;
      const opt = findOptionByLabel(opts, targetLabel) ?? findOptionByLabel(opts, '1080') ?? opts[1] ?? opts[0];
      if (!opt) return { ok: false, error: 'quality_option_not_found' };

      clickElement(opt.element);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true }));
      return { ok: true, target, selected: opt.label };
    }

    if (!clickedQualityMenu) {
      const qualityButton = findQualityMenuButton();
      if (qualityButton) {
        clickElement(qualityButton);
        clickedQualityMenu = true;
        await sleep(150);
      }
    }
  }

  return { ok: false, error: 'quality_menu_timeout' };
}

window.addEventListener('message', async event => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  const { type, id } = event.data;

  if (type === MSG.AUTOQUALITY_SET) {
    applyProactiveLocalStorage(event.data.target);
    const player = await waitForPlayer(1500);

    if (!player) {
      const uiResult = await uiAutomationFallback(event.data.target);
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ...uiResult, via: 'ui' }, '*');
      return;
    }

    try {
      player.setQuality(event.data.target);
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, target: event.data.target }, '*');
    } catch (err) {
      const uiResult = await uiAutomationFallback(event.data.target);
      window.postMessage({
        type: MSG.AUTOQUALITY_RESULT,
        id,
        ...uiResult,
        via: 'ui',
        apiError: String(err?.message ?? err)
      }, '*');
    }
    return;
  }

  if (type === MSG.AUTOQUALITY_GET) {
    const player = await waitForPlayer(2000);
    const current = player?.getQuality?.() ?? null;
    window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, current }, '*');
  }
});
