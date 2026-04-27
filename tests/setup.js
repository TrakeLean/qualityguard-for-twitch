import { vi } from 'vitest';

function makeArea() {
  let data = {};
  const listeners = new Set();

  return {
    _data: () => data,
    _listeners: listeners,
    get: vi.fn(keys => {
      if (keys === null || keys === undefined) return Promise.resolve({ ...data });

      const out = {};
      const arr = Array.isArray(keys) ? keys : Object.keys(keys);

      for (const k of arr) {
        out[k] = data[k] ?? (typeof keys === 'object' && !Array.isArray(keys) ? keys[k] : undefined);
      }

      return Promise.resolve(out);
    }),
    set: vi.fn(obj => {
      const changes = {};

      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }

      for (const fn of listeners) fn(changes);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      data = {};
      return Promise.resolve();
    })
  };
}

export function installChromeMock() {
  const sync = makeArea();
  const local = makeArea();
  const onChangedListeners = new Set();

  globalThis.chrome = {
    storage: {
      sync,
      local,
      onChanged: {
        addListener: fn => onChangedListeners.add(fn),
        removeListener: fn => onChangedListeners.delete(fn)
      }
    }
  };

  sync._listeners.add(changes => onChangedListeners.forEach(fn => fn(changes, 'sync')));
  local._listeners.add(changes => onChangedListeners.forEach(fn => fn(changes, 'local')));
}

export function resetChromeMock() {
  globalThis.chrome.storage.sync.clear();
  globalThis.chrome.storage.local.clear();
}
