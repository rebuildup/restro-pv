// "PV master" production project — the semantic authoring surface for the
// 20-second timeline comp (ADR-0002). Compiles through pv/production/compile.ts;
// pv/main.ts consumes the result.
//
// TRANSITIONAL (issue #8): brand/overlay/tracker content is still cloned
// from the legacy master dump (pv/generated/05-master.ts = material comp
// "master" inside legacy/pv-2dc99e1.aep) because the material AEP has no
// stable layer ids yet. This file is the ONLY place allowed to read that
// dump: it lifts each needed layer into a `spec` section layer, converts
// legacy stack-index references (parents, Layer Control "Layer" params,
// thisComp.layer() expressions) into stable ref ids / {{ref:}} markers that
// the compiler resolves against the new comp's own layer table. When the
// material boundary grows stable ids, the clones move to `material-layer`
// content and this file shrinks to pure section/anchor/timing authoring.
//
// Scene wiring (docs/SPEC.md §3/付録A), front-to-back:
//   [0,191f)    A1/A2/A3/B  -> material comp "master"   (legacy 191f section)
//   [191,281f)  C           -> material comp "PV reel C"
//   [281,371f)  D           -> material comp "PV ops"
//   [371,480f)  E           -> material comp "PV end"

import { comp_05 } from "../generated/05-master.ts";
import { compileProduction, layerRef } from "../production/compile.ts";
import type {
  CompProduction,
  ProductionProject,
  SectionLayerSpec,
  SectionSpec,
} from "../production/model.ts";
import type { LayerSpec, ProjectSpec, PropNode } from "../spec/types.ts";

const FPS = 24;
const T_C = 191 / FPS; // 7.958333 — scene C start
const T_D = 281 / FPS; // 11.708333 — scene D start
const T_E = 371 / FPS; // 15.458333 — scene E start
const T_END = 20;

// ---- legacy dump access ------------------------------------------------------

const legacyByIdx = new Map<number, LayerSpec>();
const legacyByName = new Map<string, LayerSpec>();
for (const l of comp_05.layers) {
  legacyByIdx.set(l.index, l);
  legacyByName.set(l.name, l);
}

function legacyLayer(name: string): LayerSpec {
  const l = legacyByName.get(name);
  if (!l) throw new Error('legacy master dump is missing layer "' + name + '"');
  return l;
}

// ---- emitted ref ids ---------------------------------------------------------
//
// Ref ids ARE the legacy layer names during migration (they are already
// unique and stable inside the material comp). Scene comp refs get explicit
// ids so tracker nulls can parent/reference them by name.

const SCENE_REF_IDS = ["PV end", "PV ops", "PV reel C", "master"] as const;

// Explicit clone lists in legacy z-order (index 0 = top).
const COPY_CLONES = ["description"];
const BRAND_CLONES = ["Heading", "AFTER EFFECTS PLUGIN", "Ae.png", "Logo"];
const RIG_CLONES = ["P 9", "P-33", "P 5", "P 3", "P-11", "P 2", "P-6"];
const OVERLAY_CLONES = [
  "Linked Quad 11",
  "Linked Quad 5",
  "Linked Quad 4",
  "Linked Quad 3",
  "Linked Quad 2",
  "Linked Quad",
  "▾ (A) stroke runs4",
];
const GRID_CLONES = ["grid-solid"];
const BOTTOM_CLONES = ["White Solid 1", "lens matte"];
const AUDIO_CLONES = ["drums-and-somps-background-music-458414.mp3"];

const ALL_CLONE_NAMES = [
  ...COPY_CLONES,
  ...BRAND_CLONES,
  ...RIG_CLONES,
  ...OVERLAY_CLONES,
  ...GRID_CLONES,
  ...BOTTOM_CLONES,
  ...AUDIO_CLONES,
];

// ---- legacy index -> stable ref resolution -----------------------------------

/** Collect legacy stack indices referenced by Layer Control "Layer" params. */
function layerControlRefs(layer: LayerSpec, out: Set<number>): void {
  const walk = (node: PropNode | undefined): void => {
    if (!node) return;
    if (node.matchName === "ADBE Layer Control-0001" && typeof node.value === "number") {
      out.add(node.value);
    }
    for (const k of node.properties ?? []) walk(k);
  };
  walk(layer.effects);
}

// Tracker-null closure: every layer referenced by a Layer Control effect,
// plus its whole parent chain — same rule the legacy master wiring used.
const neededNulls = new Set<string>();
{
  const refs = new Set<number>();
  for (const name of ALL_CLONE_NAMES) layerControlRefs(legacyLayer(name), refs);
  const queue: string[] = [];
  for (const idx of refs) {
    const src = legacyByIdx.get(idx);
    if (src) {
      neededNulls.add(src.name);
      queue.push(src.name);
    }
  }
  while (queue.length) {
    const nm = queue.pop() as string;
    const src = legacyByName.get(nm);
    if (!src?.parentIndex) continue;
    const p = legacyByIdx.get(src.parentIndex);
    if (p && !neededNulls.has(p.name)) {
      neededNulls.add(p.name);
      queue.push(p.name);
    }
  }
}

const explicitCloneSet = new Set(ALL_CLONE_NAMES);
const extraNullNames = [...neededNulls].sort().filter((n) => !explicitCloneSet.has(n));
const emittedCloneNames = new Set([...ALL_CLONE_NAMES, ...neededNulls]);
const allRefIds = new Set([...emittedCloneNames, ...SCENE_REF_IDS]);

/** Legacy stack index -> stable ref id, or the raw number when the target
 *  layer is not part of this comp (same fallback the old wiring used). */
function legacyIndexToRef(idx: number): number | ReturnType<typeof layerRef> {
  const name = legacyByIdx.get(idx)?.name;
  if (name !== undefined && allRefIds.has(name)) return layerRef(name);
  return idx;
}

// ---- clone + reference rewrite -----------------------------------------------

const PROP_TREE_KEYS = [
  "transform",
  "masks",
  "effects",
  "shapes",
  "text",
  "timeRemap",
  "markers",
] as const;

function rewriteNodeRefs(node: PropNode): void {
  if (node.matchName === "ADBE Layer Control-0001") {
    if (typeof node.value === "number") node.value = legacyIndexToRef(node.value);
    for (const k of node.keys ?? []) {
      if (typeof k.v === "number") k.v = legacyIndexToRef(k.v);
    }
  }
  if (typeof node.expression === "string") {
    node.expression = node.expression.replace(/thisComp\.layer\((\d+)\)/g, (m, idx: string) => {
      const name = legacyByIdx.get(Number(idx))?.name;
      // {{ref:}} resolves to `thisComp.layer(<new index>)` at compile time.
      return name !== undefined && allRefIds.has(name) ? "{{ref:" + name + "}}" : m;
    });
  }
  for (const p of node.properties ?? []) rewriteNodeRefs(p);
}

/**
 * Clone a legacy master layer into an authorable spec layer: stale identity
 * fields are dropped, legacy stack-index references become stable-id
 * markers, and `thisComp.layer(N)` expressions are re-pointed through
 * {{ref:}} placeholders (resolved by the compiler to the NEW comp's indices).
 */
function cloneLayer(name: string): LayerSpec {
  const src = legacyLayer(name);
  const c = JSON.parse(JSON.stringify(src)) as LayerSpec;
  c.index = 0;
  delete c.parentIndex;
  delete c.sourceCompIndex;
  for (const k of PROP_TREE_KEYS) {
    const tree = c[k] as PropNode | undefined;
    if (tree) rewriteNodeRefs(tree);
  }
  return c;
}

// ---- timing helpers (ported from the legacy wiring) ---------------------------

function brandTiming(c: LayerSpec): void {
  c.inPoint = T_C;
  c.outPoint = T_END;
  c.startTime = 0;
}

function clipTiming(c: LayerSpec): void {
  c.inPoint = Math.max(c.inPoint ?? 0, T_C);
  c.outPoint = Math.min(c.outPoint ?? T_END, T_END);
}

/** Parent ref for a cloned layer: legacy parentIndex -> parent layer name. */
function parentRefOf(name: string): string | undefined {
  const src = legacyLayer(name);
  if (src.parentIndex === undefined || src.parentIndex === null) return undefined;
  const parentName = legacyByIdx.get(src.parentIndex)?.name;
  if (parentName === undefined) {
    throw new Error(`legacy layer "${name}" has parentIndex ${src.parentIndex} outside the dump`);
  }
  if (!allRefIds.has(parentName)) {
    throw new Error(`legacy layer "${name}" parents to "${parentName}", which is not emitted`);
  }
  return parentName;
}

function cloneSectionLayer(name: string, time?: (c: LayerSpec) => void): SectionLayerSpec {
  const layer = cloneLayer(name);
  if (time) time(layer);
  if (name === "description") layer.trackMatteType = 5012;
  const parent = parentRefOf(name);
  return { id: name, content: { kind: "spec", layer }, ...(parent ? { parent } : {}) };
}

// ---- comp + project ------------------------------------------------------------

function sceneRefContent(compName: string, inPoint: number, outPoint: number): SectionLayerSpec {
  return {
    id: compName,
    content: { kind: "material-comp", comp: compName },
    timing: { inPoint, outPoint, startTime: inPoint, stretch: 100 },
    patch: { trackMatteType: 5012 },
  };
}

function pvMasterComp(): CompProduction {
  const sections: SectionSpec[] = [
    {
      id: "copy",
      role: "copy",
      layers: COPY_CLONES.map((n) => cloneSectionLayer(n, brandTiming)),
    },
    {
      id: "scenes-cde",
      role: "scene",
      layers: [
        sceneRefContent("PV end", T_E, T_END),
        sceneRefContent("PV ops", T_D, T_E),
        sceneRefContent("PV reel C", T_C, T_D),
      ],
    },
    {
      id: "brand",
      role: "brand",
      layers: BRAND_CLONES.map((n) => cloneSectionLayer(n, brandTiming)),
    },
    {
      id: "rig-tracker",
      role: "guide",
      layers: [
        ...RIG_CLONES.map((n) => cloneSectionLayer(n)),
        // Ancestor-closure nulls the legacy stack carried for the corner
        // quads' Layer Control tracking — sorted for deterministic order.
        ...extraNullNames.map((n) => cloneSectionLayer(n, clipTiming)),
      ],
    },
    {
      id: "scene-ab",
      role: "scene",
      layers: [
        {
          id: "master",
          content: { kind: "material-comp", comp: "master" },
          timing: { inPoint: 0, outPoint: T_C, startTime: 0, stretch: 100 },
          patch: { trackMatteType: 5012 },
        },
      ],
    },
    {
      id: "overlay-quads",
      role: "overlay",
      layers: OVERLAY_CLONES.map((n) => cloneSectionLayer(n, clipTiming)),
    },
    {
      id: "grid",
      role: "guide",
      layers: GRID_CLONES.map((n) => {
        const l = cloneSectionLayer(n);
        if (l.content.kind === "spec") {
          l.content.layer.inPoint = 0;
          l.content.layer.outPoint = T_END;
          l.content.layer.startTime = 0;
        }
        return l;
      }),
    },
    {
      id: "overlay-bottom",
      role: "overlay",
      layers: BOTTOM_CLONES.map((n) => cloneSectionLayer(n, clipTiming)),
    },
    {
      id: "audio",
      role: "audio",
      layers: AUDIO_CLONES.map((n) => cloneSectionLayer(n, clipTiming)),
    },
  ];
  return {
    id: "pv-master",
    name: "PV master",
    sections,
  };
}

function pvProductionProject(): ProductionProject {
  return {
    name: "restro-pv",
    frame: {
      width: 1080,
      height: 1080,
      pixelAspect: 1,
      frameRate: FPS,
      duration: T_END,
      bgColor: [0, 0, 0],
    },
    comps: [pvMasterComp()],
    materialAep: "legacy/pv-2dc99e1.aep",
  };
}

export function pvProductionSpec(): ProjectSpec {
  return compileProduction(pvProductionProject());
}
