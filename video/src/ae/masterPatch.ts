import type { CompSpec, LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { GENERATED_COMPS } from "../../../pv/generated/index.ts";
import { masterComp } from "./project.ts";
import { children } from "./eval.ts";

// Production patches applied to the dumped master CompSpec at module load.
// The dumps stay untouched; these transforms express direction decisions
// that the AEP structure cannot (ADR-0005).
//
// Currently:
//  - split "tab backgrounds" (one shape layer holding four named Vector
//    Groups "tab 1".."tab 4") into four sibling layers so scene-B step
//    progression can reveal each tab at its own time via layerFilter.
//  - re-point the PV ops footage windows at dialog-free operation segments.

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
// The dump carries the per-step geometry (STEP1 outline / STEP2 extend /
// STEP3 infer / STEP4 split drafts plus the Baseline rig); this schedule
// reproduces the AE-side reveal timing the dump does not encode.
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
