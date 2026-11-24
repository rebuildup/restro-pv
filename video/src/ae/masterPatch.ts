import type { CompSpec, LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { GENERATED_COMPS } from "../../../pv/generated/index.ts";
import { masterComp } from "./project.ts";
import { child, children } from "./eval.ts";

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

  // D scene recordings: re-edit the four PV ops windows as an asynchronous
  // multi-window sequence. Each window gets its own [in,out) slot with a
  // short opacity fade-out, and its footage is re-pointed at a verified
  // motion-bearing segment of the source capture (segment picks and crop
  // rationale: verification/wu-d). This resolves the v10 rejection items
  // "表示終了後に退場して切り替わらない" and "動きがない".
  const ops = GENERATED_COMPS.find((c) => c.name === "PV ops");
  if (ops) {
    // Per-window schedule in PV ops comp-local seconds. `src` is the source
    // time shown at `in`; footage plays at stretch 100 so the window covers
    // src..src+(out-in).
    const OPS_WINDOWS: Record<
      string,
      { inP: number; outP: number; src: number; crop?: { pos: [number, number]; scale: number } }
    > = {
      // W1 main window: decompose-ops stroke drawing over "Retro"
      // (40.0-41.7s: red path strokes draw across the letters with visible
      // vertex handles; earlier 38.6-40.3 is nearly static). Retarget the
      // dumped crop — it included a dark UI band right of the comp viewer
      // (source x>~1072); now frames viewer x≈528-1072, y≈180-541.
      W1: {
        inP: 0.1,
        outP: 1.8,
        src: 40.0,
        crop: { pos: [956, 459], scale: 110.3 },
      },
      // W2 small window: decompose-ops Restro plugin panel. The dumped crop
      // framed the Project panel (static list); retarget to the Restro
      // panel (x≈1344-1613, Decompose/Merge/Refine + Layer Contents) and
      // play the ~36.5s moment where the decomposed stroke list appears.
      W2: {
        inP: 0.6,
        outP: 2.3,
        src: 36.4,
        crop: { pos: [212, 675], scale: 81.1 },
      },
      // W3 center crop: stroke-animate stroke scribble animation
      // (22.2-23.85s). Retarget the dumped wide crop to the stroke cluster
      // (source ≈x620-1070,y175-585) so the thin red strokes stay readable
      // inside the 292px window.
      W3: {
        inP: 1.2,
        outP: 2.85,
        src: 22.2,
        crop: { pos: [1009, 714], scale: 64.9 },
      },
      // W4 wide bottom window: reprocess comp switch + "MV" appearing
      // (6.2-7.9s). Slight zoom toward the text area (source ≈x528-1073,
      // y192-428).
      W4: {
        inP: 1.85,
        outP: 3.55,
        src: 6.2,
        crop: { pos: [955, 1146], scale: 110 },
      },
    };
    for (const l of ops.layers) {
      const wKey = l.name.split(" ")[0];
      const w = OPS_WINDOWS[wKey];
      if (!w) continue;
      l.inPoint = w.inP;
      l.outPoint = w.outP;
      if (l.kind === "footage") {
        // layerLocalTime = compT - startTime; want source `src` at compT w.inP.
        l.startTime = w.inP - w.src;
        if (w.crop) {
          const pos = child(l.transform, "ADBE Position");
          const scale = child(l.transform, "ADBE Scale");
          if (pos) pos.value = [w.crop.pos[0], w.crop.pos[1], 0];
          if (scale) scale.value = [w.crop.scale, w.crop.scale, 100];
        }
      }
      fadeOpacity(l, w.inP, w.outP);
    }
  }
}

// Replace a layer's opacity keys with a short fade-in at `inP` and a
// fade-out ending at `outP`, keeping full opacity between.
function fadeOpacity(layer: LayerSpec, inP: number, outP: number): void {
  const opacity = child(layer.transform, "ADBE Opacity");
  if (!opacity) return;
  const fin = Math.min(inP + 0.14, outP - 0.34);
  const fout = outP - 0.16;
  const k = (t: number, v: number) => ({ t, v, inT: 6612, outT: 6612 });
  opacity.keys = [k(inP, 0), k(fin, 100), k(fout, 100), k(outP, 0)];
  opacity.numKeys = 4;
  opacity.value = 0;
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

// Scene-A2 [1.875,3.75): the dumped "PV A2" comp (11) stays visible — its
// FUDE rigs evaluate to opacity 0, so it renders exactly the giant-解
// outline ghost that SPEC §5 A2 wants as the 元輪郭. Only the two
// "kai-zoom" instances (235/236) are hidden: they show stroke pieces
// without the restored-continuous-stroke proof. SceneA2 overlays the real
// bunkai runs4 strokes aligned to the crossing and drives separation +
// accent on the common frame timeline.
export const A2_HIDDEN = new Set([235, 236]); // kai-zoom x2
export const A2_WINDOW: [number, number] = [1.875, 3.75];
// bunkai (232) is the A3 bridge zoom, but it fades in at 3.42s — underneath
// the still-opaque authored strokes that would double-image the character.
// Hide it only until the authored fade has mostly completed (3.6s), then
// let it carry the upward-scroll transition into scene B.
export const A2B_HIDDEN = new Set([232]); // bunkai
export const A2B_WINDOW: [number, number] = [1.875, 3.6];
