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
    // Inset the whole ops comp so no window bleeds off the right/bottom
    // frame edge — r10-r12 repeatedly failed the cropped windows. Scale
    // about the comp center keeps the staggered layout intact.
    const opsCompIdx = GENERATED_COMPS.indexOf(ops);
    const opsLayer = m.layers.find((l) => l.sourceCompIndex === opsCompIdx);
    if (opsLayer) {
      const sc = child(opsLayer.transform, "ADBE Scale");
      if (sc) sc.value = [90, 90, 100];
    }
    // Per-window schedule in PV ops comp-local seconds. `src` is the source
    // time shown at `in`; footage plays at stretch 100 so the window covers
    // src..src+(out-in).
    const OPS_WINDOWS: Record<
      string,
      { inP: number; outP: number; src: number; srcFile?: string; instantIn?: boolean; crop?: { pos: [number, number]; scale: number } }
    > = {
      // W1 main window: decompose-ops stroke drawing over "Retro"
      // (40.0-41.7s: red path strokes draw across the letters with visible
      // vertex handles; earlier 38.6-40.3 is nearly static). Retarget the
      // dumped crop — it included a dark UI band right of the comp viewer
      // (source x>~1072); now frames viewer x≈528-1072, y≈180-541.
      // Schedule is staggered so at least two windows are live at any
      // comp-local time — r6 review failed empty single-window gaps.
      // W1 inP 0.0 + instant entrance so the window is fully visible on
      // the D cut frame itself (r10: even a 0.08s fade left f281 blank).
      W1: {
        inP: 0.0,
        outP: 1.9,
        instantIn: true,
        src: 39.9,
        crop: { pos: [956, 459], scale: 110.3 },
      },
      // W2 small window: stroke-animate t≈5.0-6.7s — the generated strokes
      // (small red/green rects) moving across the "Restro" text, the exact
      // operation SPEC §5 D lists for this recording. Distinct phase from
      // W3's 22-24.3s control-point editing; every sampled later segment
      // in all three recordings still shows anchor UI, so operation-phase
      // variety is the achievable distinction.
      W2: {
        inP: 0.0,
        outP: 2.4,
        instantIn: true,
        src: 5.0,
        srcFile: "ae-stroke-animate.mp4",
        crop: { pos: [671, 682], scale: 53.1 },
      },
      // W3 center crop: stroke-animate stroke scribble animation.
      // Segment moved to 22.0-24.3s — the control-point/path-editing
      // motion peak (24.3s) — instead of the 22.2-23.85 slice that ended
      // just before the visible change.
      W3: {
        inP: 1.0,
        outP: 3.72,
        src: 22.0,
        crop: { pos: [1009, 714], scale: 64.9 },
      },
      // W4 wide bottom window: reprocess selection->clean reveal.
      // Delayed to local 2.0 and src 13.9 so the 14.2-15.5s reveal lands at
      // the scene end instead of decaying into a static white result
      // (r8: late frames showed an over-zoomed, near-blank W4).
      W4: {
        inP: 2.0,
        outP: 3.72,
        src: 13.9,
        crop: { pos: [907, 1052], scale: 115.4 },
      },
    };
    for (const l of ops.layers) {
      const wKey = l.name.split(" ")[0];
      const w = OPS_WINDOWS[wKey];
      if (!w) continue;
      l.inPoint = w.inP;
      l.outPoint = w.outP;
      if (l.kind === "footage") {
        if (w.srcFile) l.source = w.srcFile;
        // layerLocalTime = compT - startTime; want source `src` at compT w.inP.
        l.startTime = w.inP - w.src;
        if (w.crop) {
          const pos = child(l.transform, "ADBE Position");
          const scale = child(l.transform, "ADBE Scale");
          if (pos) pos.value = [w.crop.pos[0], w.crop.pos[1], 0];
          if (scale) scale.value = [w.crop.scale, w.crop.scale, 100];
        }
      }
      if (w.instantIn) {
        const opacity = child(l.transform, "ADBE Opacity");
        if (opacity) {
          const k = (t: number, v: number) => ({ t, v, inT: 6612, outT: 6612 });
          opacity.keys = [k(w.inP, 100), k(w.outP - 0.1, 100), k(w.outP, 0)];
          opacity.numKeys = 3;
          opacity.value = 100;
        }
      } else {
        fadeOpacity(l, w.inP, w.outP);
      }
    }
  }

  // Left-column captions (description comp): the dumped C-section copy
  // overlaps the D-section copy that starts at 11.708, so both texts are
  // visible together for ~2 frames at the C->D boundary (f281+). Clamp
  // every caption that starts inside scene C to end at the boundary.
  // Threshold is 11.70, NOT 11.71 — the D captions themselves start at
  // 11.7083 and must not be clamped (r15: they were being killed).
  const desc = GENERATED_COMPS.find((c) => c.name === "description");
  if (desc) {
    for (const l of desc.layers) {
      if (
        l.inPoint !== undefined &&
        l.outPoint !== undefined &&
        l.inPoint >= 7.9 &&
        l.inPoint < 11.7 &&
        l.outPoint > 11.71
      ) {
        l.outPoint = 11.7;
      }
    }
    // SPEC §11 rejected the long essay copy ("長文エッセイは削除または大幅
    // 短縮"). Essay-length description layers render as a single unwrapped
    // line that runs underneath the ops windows and reads as clipped text
    // (r5/r16 reviews). Disable every >150-char layer; headlines and short
    // subs remain.
    for (const l of desc.layers) {
      if ((l.name ?? "").length > 150) {
        l.enabled = false;
      }
    }
    // The D-section English sub ("Decompose and edit text or shapes in
    // After Effects") duplicates the Japanese sub above it and, as point
    // text at 35px, runs ~800px right — underneath the ops windows, where
    // it reads as clipped/broken text (r6). Drop the redundant EN line.
    for (const l of desc.layers) {
      if ((l.name ?? "").startsWith("Decompose and edit text or shapes")) {
        l.enabled = false;
      }
    }
    // D-section copy still overruns the ~460px left column even after
    // center-justify anchoring (r19). Shrink the remaining D text layers'
    // font size to 65% so headline + sub fit left of the ops windows.
    // (Transform scale was rejected: text anchors are not at the position,
    // so scaling teleports the glyphs — r20 fragments.)
    for (const l of desc.layers) {
      if (l.inPoint === undefined || l.inPoint < 11.7 || !l.text) continue;
      const docProp = l.text.properties?.find(
        (p) => p.matchName === "ADBE Text Document",
      );
      const doc = (docProp?.value ?? l.text.value) as
        | { fontSize?: { value?: number } | number; leading?: { value?: number } | number }
        | undefined;
      if (!doc || typeof doc !== "object") continue;
      const fs = typeof doc.fontSize === "object" ? doc.fontSize.value : doc.fontSize;
      const ld = typeof doc.leading === "object" ? doc.leading.value : doc.leading;
      if (typeof fs === "number") {
        if (typeof doc.fontSize === "object" && doc.fontSize) doc.fontSize.value = fs * 0.65;
        else doc.fontSize = fs * 0.65;
      }
      if (typeof ld === "number") {
        if (typeof doc.leading === "object" && doc.leading) doc.leading.value = ld * 0.65;
        else doc.leading = ld * 0.65;
      }
      // The JP sub's dumped anchor sits at comp x≈409 — even at 65% its
      // centered line still reaches ~100px under the ops windows (r21).
      // Re-anchor it left so the whole line stays in the left column.
      if ((l.name ?? "").startsWith("文字もシェイプも")) {
        const pos = child(l.transform, "ADBE Position");
        const v = pos?.value as number[] | undefined;
        if (pos && Array.isArray(v)) pos.value = [300, v[1] ?? 0, v[2] ?? 0];
      }
    }
  }
}

// Replace a layer's opacity keys with a short fade-in at `inP` and a
// fade-out ending at `outP`, keeping full opacity between.
function fadeOpacity(layer: LayerSpec, inP: number, outP: number): void {
  const opacity = child(layer.transform, "ADBE Opacity");
  if (!opacity) return;
  const fin = Math.min(inP + 0.08, outP - 0.2);
  const fout = outP - 0.1;
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
export const A2B_WINDOW: [number, number] = [1.875, 3.62];

// A2 tail: once the authored comparison hold ends (~f85), the giant-解
// ghost would double-image the incoming bunkai A3 bridge. Hide PV A2 for
// the bridge window; the bridge carries the upward scroll into scene B.
export const A2T_HIDDEN = new Set([11]); // PV A2 ghost
export const A2T_WINDOW: [number, number] = [3.55, 4.3];
