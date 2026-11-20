// Scene a2 — scaffold. Replaced by the TypeScript port of the legacy AEP
// structure (see docs/analysis/STRUCTURE.md and analysis/dumps/).
import type { CompSpec } from '../model/types.ts';

export function sceneA2(): CompSpec {
  return {
    name: 'PV-A2',
    width: 1080,
    height: 1080,
    duration: 1,
    frameRate: 24,
    layers: [],
  };
}
