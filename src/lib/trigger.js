import { QUALITY_HEIGHTS } from './defaults.js';

const FORCED_LOW_THRESHOLD = 200;

export function shouldReset(prevHeight, newHeight, settings) {
  if (!settings.enabled) return false;
  if (prevHeight === newHeight) return false;

  switch (settings.trigger) {
    case 'forced160':
      return newHeight !== null && newHeight <= FORCED_LOW_THRESHOLD;

    case 'anyDrop': {
      if (prevHeight === null) return false;
      const targetH = QUALITY_HEIGHTS[settings.targetQuality];
      if (targetH === null || targetH === undefined) return newHeight < prevHeight;
      return newHeight < targetH;
    }

    default:
      return false;
  }
}
