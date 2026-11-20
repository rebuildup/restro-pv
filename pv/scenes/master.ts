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

import { comp_05 } from "../generated/05-master.ts";
import { withFoldGroups } from "../production/ae-organization.ts";
import { PV_GRID } from "../production/scene-layout.ts";
import type { CompSpec, LayerSpec, ProjectSpec } from "../model/types.ts";

const FPS = PV_GRID.fps;
const T_C = 191 / FPS; // 7.958333 — scene C start
const T_D = 281 / FPS; // 11.708333 — scene D start
const T_E = 371 / FPS; // 15.458333 — scene E start
const T_END = 20;

function pick(name: string): LayerSpec {
  const l = comp_05.layers.find((x) => x.name === name);
  if (!l) throw new Error('legacy master spec is missing layer "' + name + '"');
  const c = JSON.parse(JSON.stringify(l)) as LayerSpec;
  delete c.sourceCompIndex; // resolve material comps by name, not index
  return c;
}

function xform(): NonNullable<LayerSpec["transform"]> {
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    type: 6213,
    active: true,
    enabled: true,
    propertyIndex: 6,
    numProperties: 5,
    properties: [
      {
        name: "Anchor Point",
        matchName: "ADBE Anchor Point",
        type: 6212,
        numKeys: 0,
        value: [540, 540, 0],
      },
      {
        name: "Position",
        matchName: "ADBE Position",
        type: 6212,
        numKeys: 0,
        value: [540, 540, 0],
      },
      { name: "Scale", matchName: "ADBE Scale", type: 6212, numKeys: 0, value: [100, 100, 100] },
      { name: "Rotation", matchName: "ADBE Rotate Z", type: 6212, numKeys: 0, value: 0 },
      { name: "Opacity", matchName: "ADBE Opacity", type: 6212, numKeys: 0, value: 100 },
    ],
  };
}

function compRef(name: string, inPoint: number, outPoint: number, startTime: number): LayerSpec {
  return {
    index: 0,
    name,
    kind: "comp",
    source: name,
    inPoint,
    outPoint,
    startTime,
    stretch: 100,
    trackMatteType: 5012,
    transform: xform(),
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
  if (name === "description") l.trackMatteType = 5012;
  return l;
}

// Direct overlay layers of the legacy master that stay visible during C/D/E
// (Linked Quads = corner frame, stroke runs4 flourish, lens matte, white
// solid). They sit below the scene comp refs and around grid-solid in the
// original stack; clip their time range to [T_C, T_END] so they don't
// double-render while the nested "master" comp covers [0, T_C).
function clipLayer(name: string): LayerSpec {
  const l = pick(name);
  l.inPoint = Math.max(l.inPoint ?? 0, T_C);
  l.outPoint = Math.min(l.outPoint ?? T_END, T_END);
  return l;
}

// Layer Control effects ("Corner TL/TR/BL/BR" on the Linked Quads) reference
// other layers by legacy stack index. Collect every referenced legacy index
// so the target nulls can be cloned and the values remapped after renumbering.
function layerControlRefs(layer: LayerSpec, out: Set<number>): void {
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.matchName === "ADBE Layer Control-0001" && typeof node.value === "number") {
      out.add(node.value);
    }
    if (Array.isArray(node.keys)) {
      for (const k of node.keys) {
        if (typeof k.v === "number") out.add(k.v);
      }
    }
    for (const key of ["properties", "children"]) {
      const kids = node[key];
      if (Array.isArray(kids)) for (const k of kids) walk(k);
    }
  };
  walk((layer as any).effects);
  walk((layer as any).propertyTree);
}

// Remap Layer Control values from the source master index to the
// generated stack index. Never silently leave an invalid source index.
function remapLayerControlValues(layers: LayerSpec[], byOldIndex: Map<number, number>): void {
  const fix = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const prop = node as {
      matchName?: string;
      value?: unknown;
      keys?: { v: unknown }[];
      properties?: unknown[];
    };
    if (prop.matchName === "ADBE Layer Control-0001") {
      const mapValue = (value: unknown): unknown => {
        if (typeof value !== "number" || value === 0) return value;
        const target = byOldIndex.get(value);
        if (target === undefined) throw new Error("unresolved source Layer Control index " + value);
        return target;
      };
      if (prop.value !== undefined) prop.value = mapValue(prop.value);
      for (const k of prop.keys ?? []) k.v = mapValue(k.v);
    }
    for (const child of prop.properties ?? []) fix(child);
  };
  for (const layer of layers) fix(layer.effects);
}

function pvMasterSpec(): CompSpec {
  // AE layer order: index 1 = top. Parent chains are cloned as null layers;
  // parentIndex is remapped after the stack is assembled.
  const layers: LayerSpec[] = [
    brandLayer("description"),
    compRef("PV end", T_E, T_END, T_E),
    compRef("PV ops", T_D, T_E, T_D),
    compRef("PV reel C", T_C, T_D, T_C),
    brandLayer("Heading"),
    brandLayer("AFTER EFFECTS PLUGIN"),
    brandLayer("Ae.png"),
    brandLayer("Logo"),
    pick("P 9"),
    pick("P-33"),
    pick("P 5"),
    pick("P 3"),
    pick("P-11"),
    pick("P 2"),
    pick("P-6"),
    // The legacy "master" comp renders opaque (bgColor + its own grid), so it
    // must sit ABOVE grid-solid — otherwise the opaque grid covers it and the
    // whole A1/B section renders as a blank grid.
    compRef("master", 0, T_C, 0),
    // Legacy-master overlay layers visible during C/D/E, in original z-order:
    // Linked Quads + stroke flourish above grid-solid; White Solid 1 and
    // lens matte below it (legacy indices 257-263).
    clipLayer("Linked Quad 11"),
    clipLayer("Linked Quad 5"),
    clipLayer("Linked Quad 4"),
    clipLayer("Linked Quad 3"),
    clipLayer("Linked Quad 2"),
    clipLayer("Linked Quad"),
    clipLayer("▾ (A) stroke runs4"),
    (() => {
      const g = pick("grid-solid");
      g.inPoint = 0;
      g.outPoint = T_END;
      g.startTime = 0;
      return g;
    })(),
    clipLayer("White Solid 1"),
    clipLayer("lens matte"),
    clipLayer("drums-and-somps-background-music-458414.mp3"),
  ];

  // Corner-bracket quads reference tracker nulls (P-xx) via Layer Control
  // effects. Clone the full ancestor closure of every referenced layer so
  // the brackets keep tracking the same transforms as in the legacy master.
  const legacyByIdx = new Map<number, any>();
  const legacyByName = new Map<string, any>();
  for (const l of comp_05.layers) {
    legacyByIdx.set(l.index, l);
    legacyByName.set(l.name, l);
  }
  const needed = new Set<string>();
  for (const l of layers) {
    const refs = new Set<number>();
    layerControlRefs(l, refs);
    for (const idx of refs) {
      const src = legacyByIdx.get(idx);
      if (src) needed.add(src.name);
    }
  }
  // BFS over parentIndex to pull in the whole tracker-null hierarchy.
  const queue = [...needed];
  while (queue.length) {
    const nm = queue.pop() as string;
    const src = legacyByName.get(nm);
    if (!src) continue;
    if (src.parentIndex !== undefined && src.parentIndex !== null) {
      const p = legacyByIdx.get(src.parentIndex);
      if (p && !needed.has(p.name)) {
        needed.add(p.name);
        queue.push(p.name);
      }
    }
  }
  const present = new Set(layers.map((l) => l.name));
  const extraNulls: LayerSpec[] = [];
  for (const nm of [...needed].sort()) {
    if (present.has(nm)) continue;
    const src = legacyByName.get(nm);
    if (!src) continue;
    extraNulls.push(clipLayer(nm));
  }
  // Insert tracker nulls into the null group (before the master comp ref).
  const insertAt = layers.findIndex((l) => l.kind === "comp" && l.source === "master");
  layers.splice(insertAt, 0, ...extraNulls);

  // Only source layers carry a positive original AE stack index.
  // Synthetic scene refs have index 0. This is an identity mapping at the
  // migration boundary, never a lookup by potentially duplicated names.
  const byOldIndex = new Map<number, number>();
  layers.forEach((layer, i) => {
    if (layer.index > 0) {
      if (byOldIndex.has(layer.index)) throw new Error("duplicate source layer index " + layer.index);
      byOldIndex.set(layer.index, i + 1);
    }
  });
  for (const layer of layers) {
    if (layer.parentIndex === undefined || layer.parentIndex === null) continue;
    const mapped = byOldIndex.get(layer.parentIndex);
    if (mapped === undefined) {
      throw new Error("unresolved source parent index " + layer.parentIndex + " for " + layer.name);
    }
    layer.parentIndex = mapped;
  }
  remapLayerControlValues(layers, byOldIndex);
  layers.forEach((layer, i) => { layer.index = i + 1; });
  return {
    name: "PV master",
    width: PV_GRID.width,
    height: PV_GRID.height,
    label: 13,
    folder: "01 - PV Output",
    pixelAspect: 1,
    duration: T_END,
    frameRate: FPS,
    bgColor: [0, 0, 0],
    layers,
  };
}

export function pvProjectSpec(): ProjectSpec {
  const master = pvMasterSpec();
  // FoldLayers sections use real FD-0 Shape Contents markers and preserve
  // the original stack order. Parent/Layer Control references are remapped.
  master.layers = withFoldGroups(master.layers, master.duration);
  return {
    name: "restro-pv",
    materialAep: "legacy/pv-2dc99e1.aep",
    organizeProject: true,
    comps: [master],
    footage: [],
  };
}
