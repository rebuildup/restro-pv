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
