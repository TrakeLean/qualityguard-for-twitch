import { MSG } from './lib/messages.js';

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
  if (target === 'auto') return;

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

window.addEventListener('message', async event => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  const { type, id } = event.data;

  if (type === MSG.AUTOQUALITY_SET) {
    applyProactiveLocalStorage(event.data.target);
    const player = await waitForPlayer();

    if (!player) {
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: false, error: 'player_not_found' }, '*');
      return;
    }

    try {
      player.setQuality(event.data.target);
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, target: event.data.target }, '*');
    } catch (err) {
      window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: false, error: String(err?.message ?? err) }, '*');
    }
    return;
  }

  if (type === MSG.AUTOQUALITY_GET) {
    const player = await waitForPlayer(2000);
    const current = player?.getQuality?.() ?? null;
    window.postMessage({ type: MSG.AUTOQUALITY_RESULT, id, ok: true, current }, '*');
  }
});
