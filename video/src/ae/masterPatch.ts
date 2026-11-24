import type { CompSpec, LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { GENERATED_COMPS } from "../../../pv/generated/index.ts";
import { masterComp } from "./project.ts";
import { children } from "./eval.ts";

// Production patches applied to the dumped master CompSpec at module load.
// The dumps stay untouched; these transforms express direction decisions
// that the AEP structure cannot (ADR-0005).
//
// Currently: split "tab backgrounds" (one shape layer holding four named
// Vector Groups "tab 1".."tab 4") into four sibling layers so scene-B step
// progression can reveal each tab at its own time via layerFilter.

const TAB_LAYER_INDEX = 170;
// cloned layers get synthetic indices above the dump range (max 267)
const TAB_CLONE_BASE = 300;

function cloneTabLayer(layer: LayerSpec, tabName: string, index: number): LayerSpec {
  const groups = children(layer.shapes).filter(
    (c) => c.matchName === "ADBE Vector Group" && c.name === tabName,
  );
  if (groups.length !== 1) {
    throw new Error(`tab group not found or ambiguous: ${tabName}`);
  }
  return {
    ...layer,
    index,
    name: `${layer.name} [${tabName}]`,
    shapes: {
      ...layer.shapes!,
      properties: [groups[0]],
    } as PropNode,
  };
}

let applied = false;

export function applyMasterPatches(): void {
  if (applied) return;
  applied = true;
  const m = masterComp();
  const pos = m.layers.findIndex((l) => l.index === TAB_LAYER_INDEX);
  if (pos < 0) return;
  const src = m.layers[pos];
  const clones = [1, 2, 3, 4].map((k) =>
    cloneTabLayer(src, `tab ${k}`, TAB_CLONE_BASE + k),
  );
  m.layers.splice(pos, 1, ...clones);

  // D scene recordings: re-point each PV ops footage window at a meaningful
  // operation segment (verified dialog-free in the source scans). Negative
  // startTime = source in-point, per layerLocalTime((compT - start) * s/100).
  const ops = GENERATED_COMPS.find((c) => c.name === "PV ops");
  if (ops) {
    const OPS_INPOINTS: Record<string, number> = {
      "W1 rec": 34.0, // decompose-ops: 分解実行 → 結果の断片表示
      "W2 rec": 46.0, // decompose-ops: 結果の検査（静止・判読可）
      "W3 rec": 27.0, // stroke-animate: 線画の描画アニメ開始
      "W4 rec": 33.0, // reprocess: 文字の変形・動き付け
    };
    for (const l of ops.layers) {
      const s = OPS_INPOINTS[l.name];
      if (s !== undefined) l.startTime = -s;
    }
  }
}

// Scene-B step reveal schedule (comp seconds). Each step's UI group —
// label, tab, border, card-matted draft, and the Baseline strokes for the
// final step — appears at its slot and persists (cumulative, per SPEC §5 B).
export const STEP_REVEAL: Record<number, number> = {
  // labels "01..04" (master idx 169,168,167,166)
  169: 4.25,
  168: 5.15,
  167: 6.05,
  166: 6.95,
  // borders (177,175,173,171)
  177: 4.25,
  175: 5.15,
  173: 6.05,
  171: 6.95,
  // drafts (178 STEP1 outline, 176 STEP2, 174 STEP3, 172 STEP4)
  178: 4.25,
  176: 5.15,
  174: 6.05,
  172: 6.95,
  // Baseline final strokes join at step 4
  179: 6.95,
  // tab clones (300+k -> step k)
  301: 4.25,
  302: 5.15,
  303: 6.05,
  304: 6.95,
};

// Left column replaced by LeftCopy (SPEC §4 per-scene copy): the persistent
// `description`/`Heading` comps plus the A-scene headline text layers
// ("こんな文字分解…", "Restro for Ae 2"), which duplicated the authored copy.
export const LEFT_COLUMN_REPLACED = new Set([
  10, // description
  15, // Heading
  189, // Ever seen text come apart like this?
  190, // こんな文字分解
  191, // 見たことがありますか？
  192, // After Effects AEGP Plugin & Script
  193, // Restro for Ae 2
]);

// Master layers always hidden: replaced by authored scene content or debug
// leftovers that must never render. The runs5/runs6 stroke groups (195-230)
// only appear inside the E window and collide with the product card; the
// authored SceneE renders its own 筆 hero instead.
export const HIDDEN_ALWAYS = new Set<number>([
  195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209,
  210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224,
  225, 226, 227, 228, 229, 230,
]);

// Dumped scene comps replaced by authored React scenes, by comp name and
// master-time window [t0, t1). master layerFilter suppresses matching
// comp-kind layers while the window is active.
export const SCENE_REPLACED: { comp: string; t0: number; t1: number }[] = [
  // PV end (dumped E): giant glyph collides with product copy; replaced by
  // authored SceneE for the whole E window (SPEC §5 E).
  { comp: "PV end", t0: 15.46, t1: 20.0 },
  // A2: dumped zoom comp does not show the continuous-stroke proof; replaced
  // by authored SceneA2 (SPEC §5 A2). bunkai/kai-zoom are suppressed inside
  // the same window so they do not double-render the strokes.
  { comp: "PV A2", t0: 1.875, t1: 3.79 },
  { comp: "kai-zoom", t0: 1.875, t1: 3.92 },
  { comp: "bunkai", t0: 1.875, t1: 3.79 },
  // C: dumped reel shows indistinct works; replaced by authored SceneC —
  // a scrolling window of three stroke-level works (SPEC §5 C).
  { comp: "PV reel C", t0: 7.96, t1: 11.71 },
];

// Master layers hidden only inside scene windows, by comp name + window.
export const SCENE_HIDDEN: { indices: number[]; t0: number; t1: number }[] = [
  // Scene B: the four STEP draft cards, their borders, tab chips, and the
  // dumped Baseline layer are replaced by the authored cumulative stroke
  // reveal in SceneB. Step labels (166-169) stay — they carry the captions.
  {
    indices: [
      170, 171, 172, 173, 174, 175, 176, 177, 178, 179,
      301, 302, 303, 304,
      // connector lines / guide grid / dumped magnifier lens that clutter
      // the authored glyph (SceneB carries its own push-in instead)
      23, 180, 182, 183, 184, 185, 186, 187,
    ],
    t0: 3.9,
    t1: 7.96,
  },
];

export function sceneReplaced(compName: string | undefined, t: number): boolean {
  if (!compName) return false;
  return SCENE_REPLACED.some((r) => r.comp === compName && t >= r.t0 && t < r.t1);
}

export function sceneHidden(index: number, t: number): boolean {
  return SCENE_HIDDEN.some(
    (r) => r.indices.includes(index) && t >= r.t0 && t < r.t1,
  );
}
