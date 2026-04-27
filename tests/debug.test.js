import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../src/debug.js';

describe('createLogger', () => {
  it('does not log when disabled', () => {
    const sink = vi.fn();
    const log = createLogger(() => false, sink);

    log('hello');

    expect(sink).not.toHaveBeenCalled();
  });

  it('logs with prefix when enabled', () => {
    const sink = vi.fn();
    const log = createLogger(() => true, sink);

    log('hello', 1, { a: 2 });

    expect(sink).toHaveBeenCalledWith('[QualityGuard]', 'hello', 1, { a: 2 });
  });

  it('reflects live changes to the predicate', () => {
    const sink = vi.fn();
    let on = false;
    const log = createLogger(() => on, sink);

    log('a');
    on = true;
    log('b');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('[QualityGuard]', 'b');
  });
});
