// Scene d — scaffold. Replaced by the TypeScript port of the legacy AEP
// structure (see docs/analysis/STRUCTURE.md and analysis/dumps/).
import type { CompSpec } from '../model/types.ts';

export function sceneD(): CompSpec {
  return {
    name: 'PV-ops',
    width: 1080,
    height: 1080,
    duration: 1,
    frameRate: 24,
    layers: [],
  };
}
