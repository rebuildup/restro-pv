// PV project entry point. Assembles the production ProjectSpec.
// Executed by Node (type stripping) at build time — never inside After Effects.
//
// Production path: open the material AEP (legacy/pv-2dc99e1.aep), add the
// TS-authored "PV master" comp wiring material scene comps, save as the
// generated AEP. Scene content itself is edited in pv/scenes/*.
import type { ProjectSpec } from './model/types.ts';
import { pvProjectSpec } from './scenes/master.ts';

export function buildSpec(): ProjectSpec {
  return pvProjectSpec();
}
