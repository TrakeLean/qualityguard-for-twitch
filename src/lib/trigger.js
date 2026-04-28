import { QUALITY_HEIGHTS } from './defaults.js';

const FORCED_LOW_THRESHOLD = 200;

export function shouldEnforceCurrentHeight(newHeight, settings) {
  if (!settings.enabled) return false;
  if (newHeight === null || newHeight === undefined) return false;

  switch (settings.trigger) {
    case 'forced160':
      return newHeight <= FORCED_LOW_THRESHOLD;

    case 'anyDrop': {
      const targetH = QUALITY_HEIGHTS[settings.targetQuality];
      if (targetH === null || targetH === undefined) return false;
      return newHeight < targetH;
    }

    default:
      return false;
  }
}

export function shouldReset(prevHeight, newHeight, settings) {
  if (!settings.enabled) return false;
  if (newHeight === null || newHeight === undefined) return false;
  if (prevHeight === newHeight) return false;

  switch (settings.trigger) {
    case 'forced160':
      return shouldEnforceCurrentHeight(newHeight, settings);

    case 'anyDrop': {
      const targetH = QUALITY_HEIGHTS[settings.targetQuality];
      if (targetH === null || targetH === undefined) return prevHeight !== null && prevHeight !== undefined && newHeight < prevHeight;
      return shouldEnforceCurrentHeight(newHeight, settings);
    }

    default:
      return false;
  }
}
