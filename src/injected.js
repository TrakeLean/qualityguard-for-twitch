import { MSG } from './lib/messages.js';
import { findSettingsButton, findQualityMenuButton, findQualityOptions, findOptionByLabel } from './lib/selectors.js';

const PROACTIVE_FLAG = '__qualityguard_proactive_done';

window.postMessage({ type: MSG.AUTOQUALITY_READY }, '*');

function findPlayerFromVideo(video) {
  const roots = [
    video,
    document.querySelector('[data-a-target="video-ref"]'),
    document.querySelector('[data-a-target="video-player"]'),
    document.querySelector('.video-player__container')
  ].filter(Boolean);

  for (const root of roots) {
    const fiberKey = Object.getOwnPropertyNames(root).find(k => k.startsWith('__reactFiber$'));
    if (!fiberKey) continue;

    let node = root[fiberKey];
    while (node) {
      const inst = node.stateNode;
      if (inst && typeof inst.setQuality === 'function') {
        return inst;
      }
      if (inst?.player && typeof inst.player.setQuality === 'function') {
        return inst.player;
      }
      node = node.return;
    }
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

function getAvailableQualities(player) {
  if (Array.isArray(player?.props?.availableQualities)) return player.props.availableQualities;

  try {
    const mediaQualities = player?.props?.mediaPlayerInstance?.getQualities?.();
    if (Array.isArray(mediaQualities)) return mediaQualities;
  } catch {
    // Ignore and fall back to empty list.
  }

  return [];
}

function resolveQualityTarget(player, target) {
  const qualities = getAvailableQualities(player);
  if (target === 'auto') return 'auto';

  const exact = qualities.find(q => q.group === target || q.name === target);
  if (exact?.group) return exact.group;

  const partial = qualities.find(q => q.group?.includes(target) || q.name?.includes(target));
  if (partial?.group) return partial.group;

  if (target === 'chunked') {
    const fixed = qualities
      .filter(q => q.group !== 'auto')
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    return fixed[0]?.group ?? target;
  }

  return target;
}

function getPlayerQuality(player) {
  try {
    if (typeof player?.getQuality === 'function') return player.getQuality();
  } catch {
    // Continue to mediaPlayerInstance fallback.
  }

  try {
    const media = player?.props?.mediaPlayerInstance;
    if (media?.isAutoQualityMode?.()) return 'auto';
    return media?.getQuality?.() ?? null;
  } catch {
    return null;
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
      const resolvedTarget = resolveQualityTarget(player, event.data.target);
      player.setQuality(resolvedTarget);
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, target: event.data.target, resolvedTarget, via: 'api' }, '*');
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
    const current = getPlayerQuality(player);
    window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, current }, '*');
  }
});
