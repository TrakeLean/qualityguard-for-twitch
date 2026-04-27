export function createLogger(isEnabled, sink = console.log) {
  return (...args) => {
    if (isEnabled()) sink('[QualityGuard]', ...args);
  };
}
