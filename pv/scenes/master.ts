// "PV master" — the production timeline comp (1080x1080 @24fps, 20s).
//
// Layout mirrors the legacy master wiring (see docs/SPEC.md §3/付録A):
//   [0,191f)    A1/A2/A3/B  -> nested reference to the material comp "master"
//   [191,281f)  C           -> material comp "PV reel C"
//   [281,371f)  D           -> material comp "PV ops"
//   [371,480f)  E           -> material comp "PV end"
//
// Brand/left-column layers (description, Heading, Logo, Ae.png,
// AFTER EFFECTS PLUGIN, grid-solid) are cloned from the faithful generated
// spec of the legacy master (pv/generated/05-master.ts) so transforms,
// expressions, parents and keyframes are preserved exactly. Their visibility
// is trimmed to the post-legacy range because the nested "master" comp
// already renders them for [0,191f).
//
// Material comps/footage resolve by name inside the opened material AEP
// (spec.materialAep); sourceCompIndex is cleared so name lookup is used.
import type { CompSpec, LayerSpec, ProjectSpec } from '../model/types.ts';
import { comp_05 } from '../generated/05-master.ts';

const FPS = 24;
const T_C = 191 / FPS;    // 7.958333 — scene C start
const T_D = 281 / FPS;    // 11.708333 — scene D start
const T_E = 371 / FPS;    // 15.458333 — scene E start
const T_END = 20;

function pick(name: string): LayerSpec {
  const l = comp_05.layers.find((x) => x.name === name);
  if (!l) throw new Error('legacy master spec is missing layer "' + name + '"');
  const c = JSON.parse(JSON.stringify(l)) as LayerSpec;
  delete c.sourceCompIndex; // resolve material comps by name, not index
  return c;
}

function xform(): NonNullable<LayerSpec['transform']> {
  return {
    name: 'Transform', matchName: 'ADBE Transform Group', type: 6213,
    active: true, enabled: true, propertyIndex: 6, numProperties: 5,
    properties: [
      { name: 'Anchor Point', matchName: 'ADBE Anchor Point', type: 6212, numKeys: 0, value: [540, 540, 0] },
      { name: 'Position', matchName: 'ADBE Position', type: 6212, numKeys: 0, value: [540, 540, 0] },
      { name: 'Scale', matchName: 'ADBE Scale', type: 6212, numKeys: 0, value: [100, 100, 100] },
      { name: 'Rotation', matchName: 'ADBE Rotate Z', type: 6212, numKeys: 0, value: 0 },
      { name: 'Opacity', matchName: 'ADBE Opacity', type: 6212, numKeys: 0, value: 100 },
    ],
  };
}

function compRef(name: string, inPoint: number, outPoint: number, startTime: number): LayerSpec {
  return {
    index: 0, name, kind: 'comp', source: name,
    inPoint, outPoint, startTime, stretch: 100,
    trackMatteType: 5012, transform: xform(),
  };
}

// Brand layers cloned from the legacy master, trimmed to [T_C, T_END].
// Their transforms/keyframes are master-clock timed, so startTime stays 0
// and the comp/footage source follows the timeline clock exactly like the
// original master layers did.
function brandLayer(name: string): LayerSpec {
  const l = pick(name);
  l.inPoint = T_C;
  l.outPoint = T_END;
  l.startTime = 0;
  // description consumed "LENS frame" (index above it) as an alpha matte in
  // the legacy master; that layer is absent after 7.92s so the matte was
  // already inert in the C/D/E range — drop the dependency explicitly.
  if (name === 'description') l.trackMatteType = 5012;
  return l;
}

export function pvMasterSpec(): CompSpec {
  // AE layer order: index 1 = top. Parent chains are cloned as null layers;
  // parentIndex is remapped after the stack is assembled.
  const layers: LayerSpec[] = [
    brandLayer('description'),
    compRef('PV end', T_E, T_END, T_E),
    compRef('PV ops', T_D, T_E, T_D),
    compRef('PV reel C', T_C, T_D, T_C),
    brandLayer('Heading'),
    brandLayer('AFTER EFFECTS PLUGIN'),
    brandLayer('Ae.png'),
    brandLayer('Logo'),
    pick('P 9'),
    pick('P-33'),
    pick('P 5'),
    pick('P 3'),
    pick('P-11'),
    pick('P 2'),
    pick('P-6'),
    // The legacy "master" comp renders opaque (bgColor + its own grid), so it
    // must sit ABOVE grid-solid — otherwise the opaque grid covers it and the
    // whole A1/B section renders as a blank grid.
    compRef('master', 0, T_C, 0),
    (() => { const g = pick('grid-solid'); g.inPoint = 0; g.outPoint = T_END; g.startTime = 0; return g; })(),
  ];
  // renumber and remap parentIndex (old master index -> new stack index)
  const oldIndexByName = new Map<string, number>();
  for (const l of comp_05.layers) oldIndexByName.set(l.name, l.index);
  const newIndexByName = new Map<string, number>();
  layers.forEach((l, i) => { l.index = i + 1; newIndexByName.set(l.name, i + 1); });
  for (const l of layers) {
    if (l.parentIndex === undefined || l.parentIndex === null) continue;
    const parentName = comp_05.layers.find((x) => x.index === l.parentIndex)?.name;
    const ni = parentName ? newIndexByName.get(parentName) : undefined;
    if (ni === undefined) throw new Error('unmapped parent ' + parentName + ' for ' + l.name);
    l.parentIndex = ni;
  }
  void oldIndexByName;
  return {
    name: 'PV master', width: 1080, height: 1080, pixelAspect: 1,
    duration: T_END, frameRate: FPS, bgColor: [0, 0, 0], layers,
  };
}

export function pvProjectSpec(): ProjectSpec {
  return {
    name: 'restro-pv',
    materialAep: 'legacy/pv-2dc99e1.aep',
    comps: [pvMasterSpec()],
    footage: [],
  };
}
