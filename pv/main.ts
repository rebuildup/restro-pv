// PV project entry point. Assembles the full ProjectSpec.
// Executed by Node (type stripping) at build time — never inside After Effects.
//
// pv/generated/* is the mechanical port of legacy/pv-2dc99e1.aep.
// Hand-authored scene definitions live in pv/scenes/* and are layered on top
// of the generated data (see docs/analysis/STRUCTURE.md).
import type { ProjectSpec } from './model/types.ts';
import { GENERATED_COMPS, GENERATED_FOOTAGE } from './generated/index.ts';

export function buildSpec(): ProjectSpec {
  return {
    name: 'pv',
    comps: GENERATED_COMPS,
    footage: GENERATED_FOOTAGE,
  };
}
