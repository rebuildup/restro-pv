// PV project entry point. Assembles the full ProjectSpec from scene builders.
// Executed by Node (type stripping) at build time — never inside After Effects.
import type { ProjectSpec } from './model/types.ts';
import { timeline } from './timeline.ts';

export function buildSpec(): ProjectSpec {
  return timeline();
}
