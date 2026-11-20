// Scene c — scaffold. Replaced by the TypeScript port of the legacy AEP
// structure (see docs/analysis/STRUCTURE.md and analysis/dumps/).
import type { CompSpec } from '../model/types.ts';

export function sceneC(): CompSpec {
  return {
    name: 'PV-reel-C',
    width: 1080,
    height: 1080,
    duration: 1,
    frameRate: 24,
    layers: [],
  };
}
