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

// Scene-B tab reveal schedule (comp seconds): the four tab backgrounds
// (clones 301-304) highlight progressively as each step becomes active.
// Everything else in the B window that the dump cannot render — step
// labels (static "した" text), STEP drafts, Baseline, STEP cards, the
// Lens magnifier comp — is hidden by B_HIDDEN and re-authored by SceneB.
export const STEP_REVEAL: Record<number, number> = {
  301: 4.25,
  302: 5.15,
  303: 6.05,
  304: 6.95,
};

// Master layers hidden only inside the scene-B window [3.9, 7.96):
//   166-169 step labels (dumped text is final-state "した"; SceneB authors
//     the 中->した progression), 172-179 STEP drafts + Baseline (FUDE rigs
//     evaluate to opacity 0 — invisible), 264-267 STEP cards, 23 Lens
//     magnifier comp (children are the same invisible drafts), 9 LENS
//     frame. Step borders 171-177 and tab clones stay visible.
export const B_HIDDEN = new Set([
  9, 23, 166, 167, 168, 169, 172, 174, 176, 178, 179, 264, 265, 266, 267,
]);
export const B_WINDOW: [number, number] = [3.9, 7.96];

// Scene-E: the dumped PV end comp lays its product copy out at x≈124 in the
// left column with no card frame, colliding with the persistent brand
// titles; the beats show a bordered card on the right. Hide the whole comp
// layer and let SceneE author the card. Its "restored character" child is
// a FUDE rig that evaluates to opacity 0 anyway.
export const E_HIDDEN = new Set([12]); // PV end
export const E_WINDOW: [number, number] = [15.46, 20.0];

// Scene-C: the dumped PV reel C chain (reel window/showreel/strip/cells)
// renders the same 13-stroke 筆 in all three works — verified identical
// stroke sets across PV glyph WA/WB/WC/EE — so it cannot satisfy SPEC §5
// C's "内容と動きの異なる複数作品". Hide the master reel layer; SceneC
// authors three distinct works from the same real stroke paths.
export const C_HIDDEN = new Set([14]); // PV reel C
export const C_WINDOW: [number, number] = [7.96, 11.71];
