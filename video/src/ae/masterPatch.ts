import type { CompSpec, LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { GENERATED_COMPS } from "../../../pv/generated/index.ts";
import { masterComp } from "./project.ts";
import { child, children } from "./eval.ts";
import { SCENE_B_DESIGN } from "../design/choreography.ts";

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

  // D scene recordings: the dumped "PV ops" comp baked four footage windows
  // into a fixed layout whose crops and timing failed review (left-column
  // typography collision, distorted windows, brand lockup hidden). SceneD
  // now authors the whole scene — left copy plus four asynchronous footage
  // windows fed from assets/rec — so the dumped comp is hidden for the
  // scene window and its D-section description copy is clamped below.
  // See verification/wu-d-mat/SEGMENTS.md for the chosen source ranges.

  // A2->A3 bridge: bunkai (232) has no opacity keys in the dump, so it
  // pops in fully opaque the frame A2B_HIDDEN releases it (3.62s) —
  // under the still-fading authored strokes that read as a dark mass at
  // f88-95. Give it a short fade-in so it arrives as a bridge, not a cut.
  {
    const bridge = m.layers.find((l) => l.index === 232);
    const bop = bridge && child(bridge.transform, "ADBE Opacity");
    if (bridge && bop) {
      const k = (t: number, v: number) => ({ t, v, inT: 6612, outT: 6612 });
      // Seam fix (WU-INT r1): the bridge used to hard-cut at outPoint
      // 4.125 (f99), one beat before the nominal A3->B boundary, leaving
      // f100/f101 visually identical mid-fade frames; r2 then showed a
      // too-slow fade still ghosting at f101. Fade the 解 out across
      // f97-f101 so it is FULLY gone on the first B frame (f101 = 4.2083s)
      // while still reading as a receding bridge on the last A3 frames.
      // v15 (WU-A M3 whole-film FAIL): the bridge used to fade in at
      // 3.55-3.78 — underneath the still-opaque authored stroke cluster,
      // producing a double-hero at f87-94 that the reviewer read as
      // 主役二重化. The authored A2 cluster now holds solo through ~f90
      // and exits by ~f94, so the bridge fade is delayed to arrive AS
      // the cluster leaves: invisible until 3.9 (A2B_WINDOW), fading
      // 3.92-4.1, gone by outPoint 4.2 on the first B frames.
      bop.keys = [
        k(3.55, 0), k(3.9, 0), k(4.1, 100), k(4.16, 100), k(4.2, 0),
      ];
      bop.numKeys = 5;
      bop.value = 0;
      bridge.outPoint = 4.2;
    }
    // A3 bridge framing: the dumped bunkai zoom places the giant 解 with
    // its left tail crossing x<480 into the left copy column (r1 review:
    // glyph collided with brand/question copy at f90-95). The layer is
    // only visible during the A3 bridge window [3.42,4.13), so re-frame
    // it statically: shift right ~+110px and shrink ~10% — the glyph's
    // comp-space left ink edge (~x215) then lands at screen x≈500+.
    if (bridge) {
      const pos = child(bridge.transform, "ADBE Position");
      const scale = child(bridge.transform, "ADBE Scale");
      if (pos && Array.isArray(pos.value)) {
        pos.value = [890, (pos.value as number[])[1] ?? 495.1, 0];
      }
      if (scale) {
        const shrink = (v: unknown) =>
          Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n * 0.9 : n)) : v;
        scale.value = shrink(scale.value);
        if (Array.isArray(scale.keys)) {
          for (const key of scale.keys) key.v = shrink(key.v);
        }
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
      if (l.inPoint === undefined || l.outPoint === undefined) continue;
      // WU-A r2/r4: the "2"-suffixed A-scene variants ("HOW IT WORKS 2" /
      // "Rebuild strokes from a connected outline" + JP headline 「…筆画を
      // 復元する」, in 0.5-4.15) collide with the surrounding copy through
      // the WHOLE A scene — r4 showed the same text-on-text overlap at
      // f30/f44 (A1) that r2 showed at f45-95 (A2/A3). They are
      // B-headline early-teasers duplicating the B-section copy that
      // starts at 4.25; the A-scene authored copy is the question set
      // (master texts 189-191) plus the giant Heading. Disable them
      // entirely (zero-length window) rather than moving shared layout.
      if (
        l.inPoint >= 0.4 &&
        l.inPoint < 1.0 &&
        / 2$/.test(l.name)
      ) {
        l.outPoint = l.inPoint;
        continue;
      }
      // B-section EN body sub ("Hidden vertices and edges are inferred..."):
      // the v13 left column carries the JP headline + body only; this fs13
      // English sub is unreadable over the grid and reads as ghost text
      // (wu-b-r19/r20 reviews). Disable cleanly for the B window.
      if (
        l.inPoint !== undefined &&
        l.inPoint >= 4.2 &&
        l.inPoint < 4.3 &&
        l.name.startsWith("Hidden vertices")
      ) {
        l.outPoint = l.inPoint;
        continue;
      }
      if (
        l.inPoint >= 7.9 &&
        l.inPoint < 11.7 &&
        l.outPoint > 11.71
      ) {
        l.outPoint = 11.7;
      } else if (
        // D-section dumped copy ("After Effectsでの操作と機能" block,
        // in 11.71-15.46) overflows the 416px description column and
        // collides with the authored windows. SceneD authors the left
        // column instead, so the dumped layers end at the D cut. The E
        // block starts at 15.46+ and is untouched.
        l.inPoint >= 11.7 &&
        l.inPoint < 15.46 &&
        l.outPoint > 11.708
      ) {
        l.outPoint = 11.708;
      }
      // WU-INT r2: the six B-section captions carry dumped expressions
      // that our expression subset cannot parse (`var`/`thisLayer.name`/
      // `indexOf`), so they silently fell back to static full opacity and
      // popped in at f102 — the bottom caption's last line then collided
      // with the persistent tagline 「文字の輪郭から、筆画ごとのシェイプへ。」
      // through f102-f104. The real AE behavior is a staggered fade+rise:
      //   i = HOW->0, つなが->1, 線が->2, else->3 ; t0 = 4.35 + i*0.12
      //   opacity: ease(time,t0,t0+0.35,0,100)
      //   position: value + [0, ease(time,t0,t0+0.45,12,0)]  (slides up 12px)
      // Bake those envelopes into plain keys so the captions arrive
      // gradually exactly like the dumped intent.
      if (l.inPoint !== undefined && l.inPoint >= 4.2 && l.inPoint < 4.3) {
        // WU-B r20 (v13 art direction: left column = headline + 1-2 body
        // lines max): the dumped B-section stack was kicker + JP headline
        // + 3-line JP body + EN body + persistent tagline — five text
        // elements, several unreadable over the grid (r20 review FAIL).
        // Disable the EN body layer outright and tighten the JP body to
        // two lines; the fit pass below re-measures the edited text.
        const bdoc = l.text?.properties?.find(
          (p) => p.matchName === "ADBE Text Document",
        )?.value as { text?: string } | undefined;
        if (typeof bdoc?.text === "string") {
          if (bdoc.text.startsWith("Hidden vertices and edges")) {
            l.outPoint = l.inPoint;
            continue;
          }
          if (bdoc.text.startsWith("線が交わると")) {
            bdoc.text =
              "線が交わると、文字の輪郭はひとつにつながる。\rRestroは輪郭を延長し、隠れた頂点まで推定して筆画を分け直す。";
          }
        }
        const op = child(l.transform, "ADBE Opacity");
        const pos = child(l.transform, "ADBE Position");
        if (op?.expression?.includes("t0=4.35")) {
          const nm = l.name;
          const i = nm.startsWith("HOW") ? 0 : nm.startsWith("つなが") ? 1 : nm.startsWith("線が") ? 2 : 3;
          // r20: the dumped stagger (t0=4.35+i*0.12, 0.35s fade, 12px rise)
          // left captions mid-fade at f110, where the half-visible lines
          // read as残像 over the grid (two consecutive review FAILs).
          // Compress: earlier start, tighter stagger, shorter envelopes —
          // the group still arrives in reading order but is decisive by
          // ~f112 instead of smearing across f104-f116.
          const t0 = 4.3 + i * 0.06;
          const k = (t: number, v: number) => ({ t, v, inT: 6612, outT: 6612 });
          op.keys = [k(t0, 0), k(t0 + 0.34, 100)];
          op.numKeys = 2;
          op.value = 0;
          op.expression = "";
          if (pos?.expression?.includes("t0=4.35") && Array.isArray(pos.value)) {
            const [x, y, z] = pos.value as number[];
            const kp = (t: number, yy: number) => ({ t, v: [x, yy, z ?? 0], inT: 6612, outT: 6612 });
            pos.keys = [kp(t0, y + 10), kp(t0 + 0.42, y)];
            pos.numKeys = 2;
            pos.expression = "";
          }
        }
      }
      // Dumped E-block captions (in >=15.44): SceneE authors the product
      // card/lockup itself, so these leftovers double the product name and
      // sales info (v11 rejection: 製品名の重複 / 販売表示の階層不足).
      // i30/i31 are already disabled in the dump; zero the rest.
      if (l.inPoint !== undefined && l.inPoint >= 15.44) {
        l.outPoint = l.inPoint;
        continue;
      }
    }

    // Caption fit pass (v11 rejection: 説明文の切断). Several dumped
    // point-text captions were authored against a wider canvas: center-
    // justified anchors parked near the comp's right edge (x≈332-409 in a
    // 416px comp) with fontSize 35-40 clip mid-sentence at the comp
    // boundary. Shrink fontSize (floor 12px) until the longest line fits
    // the available width; when the anchor itself leaves no room, recenter
    // it on the comp first. Width estimate: CJK/full-width = 1em,
    // ASCII = 0.55em, space = 0.3em, with a 16px safety margin.
    const DW = desc.width ?? 416;
    const MARGIN = 16;
    const emOf = (ch: string): number => {
      const c = ch.codePointAt(0) ?? 0;
      if (ch === " ") return 0.3;
      if (c < 0x80) return 0.55;
      return 1;
    };
    for (const l of desc.layers) {
      if (l.enabled === false) continue;
      if (
        l.inPoint === undefined ||
        l.outPoint === undefined ||
        l.outPoint <= l.inPoint
      ) {
        continue;
      }
      const tdoc = l.text?.properties?.find(
        (p) => p.matchName === "ADBE Text Document",
      );
      const doc = tdoc?.value as
        | {
            fontSize?: number;
            text?: string;
            justification?: number;
            boxText?: boolean;
          }
        | undefined;
      if (
        !doc ||
        doc.boxText ||
        typeof doc.fontSize !== "number" ||
        typeof doc.text !== "string"
      ) {
        continue;
      }
      const em = Math.max(
        ...doc.text
          .split(/\r\n|\r|\n/)
          .map((s) => [...s].reduce((a, ch) => a + emOf(ch), 0)),
        0,
      );
      if (em <= 0) continue;
      const pos = child(l.transform, "ADBE Position");
      const ax = Array.isArray(pos?.value) ? (pos.value[0] as number) : 0;
      const availFor = (x: number) =>
        doc.justification === 7415
          ? 2 * Math.min(x, DW - x)
          : doc.justification === 7414
            ? x
            : DW - x;
      let avail = availFor(ax) - MARGIN;
      let need = avail / em;
      if (need >= doc.fontSize) continue;
      if (need < 12 && doc.justification === 7415 && pos && pos.numKeys === 0 && Array.isArray(pos.value)) {
        // Center-anchored caption whose anchor sits at the comp edge:
        // recenter on the comp, then re-fit.
        pos.value = [DW / 2, pos.value[1], pos.value[2] ?? 0];
        avail = DW - MARGIN;
        need = avail / em;
      }
      doc.fontSize = Math.max(12, Math.min(doc.fontSize, need));
    }
  }

  // Confirmed common layout restoration (Issue #32):
  // Original AEP (05-master.ts) keeps persistent Heading (`43-Heading.ts`)
  // and brand lockup [15..18] visible across 0..20s, and keeps `grid-solid`
  // [257] continuous without global window dimming or 17.35s fade-out.
  // Heading smoothly returns via P 5..12 to y=746..812 during 15.50..16.167s;
  // LeftCopy yields its E-scene overlay so Heading [15] never collides.

  // Scene-A hero column clearance (WU-A r9/r10/r12 / pv-art-direction v13):
  // the dumped A1 giant-解 stroke group (master layers 239-254, window
  // [0,1.5)) reaches x≈357-420 and its ズレ excursion dips to ~x391, both
  // colliding with the left copy column (Restro / 筆画復元 ends ~x455).
  // The art direction reserves x<~460 for brand+copy and wants the hero
  // cropped by the RIGHT/BOTTOM frame edges instead. Shift the whole hero
  // group +130px right — a uniform translation that preserves the
  // protected A1 choreography (ズレ・復帰 untouched) while clearing the
  // column (post-shift excursion min ~x521; r12 review still saw the
  // left edge inside the column zone at f10/f36, so +40 over r11's +90).
  // SceneA2 re-renders the same layers, so it inherits the shift through
  // worldMatrix automatically; its comp-space constants (CROSSINGS,
  // GHOST_ZONE, REG_TX) are bumped by the same +40 to stay registered.
  {
    const HERO_SHIFT = 130;
    for (const l of m.layers) {
      if (l.index < 239 || l.index > 254) continue;
      // Some stroke layers use a single ADBE Position vector, others use
      // separated dimensions (ADBE Position_0/_1/_2 scalars with keys).
      for (const mn of ["ADBE Position", "ADBE Position_0"]) {
        const pos = child(l.transform, mn);
        if (!pos) continue;
        if (Array.isArray(pos.value) && typeof pos.value[0] === "number") {
          pos.value = pos.value.map((v, i) =>
            i === 0 ? (v as number) + HERO_SHIFT : v,
          );
        } else if (typeof pos.value === "number") {
          pos.value = (pos.value as number) + HERO_SHIFT;
        }
        if (Array.isArray(pos.keys)) {
          for (const k of pos.keys) {
            const kv = (k as { v?: unknown }).v;
            if (Array.isArray(kv) && typeof kv[0] === "number") {
              (k as { v: number[] }).v = kv.map((v, i) =>
                i === 0 ? (v as number) + HERO_SHIFT : v,
              );
            } else if (typeof kv === "number") {
              (k as { v: number }).v = (kv as number) + HERO_SHIFT;
            }
          }
        }
      }
    }
  }

  // Scene-A PV A2 ghost (master layer 11, window [1.5,3.79)): the dumped
  // "outline ghost state" that carries the A1 tail into the A2 cut. Its
  // reconstruction glyph reaches x≈431 — inside the left copy column
  // (wu-a-r10 FAIL at f40). It is invisible during the authored A2
  // (verified: hiding it at f60 produces a zero-pixel diff — SceneA2's
  // own hero+ghost cover the window), so a static +80px x shift only
  // affects the visible A1-tail frames and cannot desync the A2 ghost
  // registration (REG2 is measured against SceneA2's own ghost source,
  // not this layer).
  {
    const l = m.layers.find((x) => x.index === 11);
    const pos = l ? child(l.transform, "ADBE Position") : undefined;
    if (pos && Array.isArray(pos.value)) {
      pos.value = pos.value.map((v, i) => (i === 0 ? (v as number) + 80 : v));
    }
  }

  // Scene-A kai-zoom rig (master layers 233-236, window [1.5,3.92)): the
  // dumped A1 tail zoom that flies the giant 解 in from off-screen left
  // (Null 234 Position_0 keys 0->896 over t 1.5-1.708) and then keeps
  // rendering the zoomed glyph UNDER SceneA2 until f94 — the "old hero
  // residue / double image" flagged in wu-a-r10. Two fixes:
  //  1. shift the two child comp instances right so the entrance sweep
  //     and the resting glyph clear the left copy column (same zone rule);
  //  2. clamp the rig's outPoint to SceneA2's T0 (45/24 = 1.875s) so the
  //     authored SceneA2 hero is the ONLY giant-解 on screen from the A2
  //     cut onward — SceneA2's own driftUp carries the A3 bridge.
  // Note: the null's Pos0 lives in pre-scale space (~8.3x attenuation —
  // a +160 key shift moved the rig only ~19 screen px), and child
  // Position offsets apply 1:1 in comp space, so the clearance uses a
  // modest static child offset plus the outPoint clamp.
  {
    const KZ_CHILD_POS_X = 50; // +50 screen px margin on the resting glyph (r12: r11's +20 still read as column bleed at f36)
    const kzOut = 45 / 24;
    for (const l of m.layers) {
      if (l.index < 233 || l.index > 236) continue;

      l.outPoint = Math.min(l.outPoint ?? kzOut, kzOut);
      if (l.index !== 235 && l.index !== 236) continue;
      const pos = child(l.transform, "ADBE Position");
      if (Array.isArray(pos?.value)) {
        pos.value = pos.value.map((v, i) =>
          i === 0 ? (v as number) + KZ_CHILD_POS_X : v,
        );
      }
    }
  }
}

// Confirmed AEP structural restoration keeps grid-solid continuous at 100%
// and brand lockup [15..18] visible through 0..20s (dimGridForWindows &
// hideBrandLockupForEndCard intentionally retired per Issue #32 layout fix).
export const D_HIDDEN = new Set([13]); // PV ops
export const D_WINDOW: [number, number] = [11.71, 15.46];

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
// Step times are single-sourced from SCENE_B_DESIGN.stepTimes (the same
// spec SceneB.tsx consumes); the dumped tab clones reveal at those times.
const [STEP1_T, STEP2_T, STEP3_T, STEP4_T] = SCENE_B_DESIGN.stepTimes;
export const STEP_REVEAL: Record<number, number> = {
  301: STEP1_T,
  302: STEP2_T,
  303: STEP3_T,
  304: STEP4_T,
};

// Master layers hidden only inside the scene-B window [3.9, 7.96):
//   166-169 step labels (dumped text is final-state "した"; SceneB authors
//     the 中->した progression), 172-179 STEP drafts + Baseline (FUDE rigs
//     evaluate to opacity 0 — invisible), 264-267 STEP cards, 23 Lens
//     magnifier comp (children are the same invisible drafts), 9 LENS
//     frame. The tab bars (borders 171/173/175/177 + tab clones 301-304)
//     are hidden too: they are master layers that would render UNDER the
//     authored glyph, so SceneB re-draws them above the glyph to keep the
//     step strip readable (white bars + black keylines, same geometry).
export const B_HIDDEN = new Set([
  9, 23, 166, 167, 168, 169, 171, 172, 173, 174, 175, 176, 177, 178, 179,
  264, 265, 266, 267, 301, 302, 303, 304,
]);
export const B_WINDOW: [number, number] = [3.9, 7.96];

// Scene-E: the dumped PV end comp lays its product copy out at x≈124 in the
// left column with no card frame, colliding with the persistent brand
// titles; the beats show a bordered card on the right. Hide the whole comp
// layer and let SceneE author the card. Its "restored character" child is
// a FUDE rig that evaluates to opacity 0 anyway.
export const E_HIDDEN = new Set([12]); // PV end
// Window starts at 15.44 (not the dumped inPoint 15.4583): the authored E
// tiles begin fading in at the same moment, and the dumped PV end comp must
// already be hidden on the first E frame (f371) — WU-INT r1.
export const E_WINDOW: [number, number] = [15.44, 20.0];

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
// WU-A revision: SceneA2 now re-renders the ghost itself from the same
// Restro material (PV glyph A2 FUDE layers) through the shared field
// transform, so the dumped ghost (11) is hidden for the whole authored
// window to avoid a dark double-image. The hide window extends to 3.92 —
// the kai-zoom outPoint — because the pieces reappeared over the A3
// bunkai bridge at f90-94 (the "dark mass" anomaly).
// WU-A r1: master texts 192/193 ("After Effects AEGP Plugin & Script",
// "Restro for Ae") were kai-zoom callouts — they label the plugin UI that
// the hidden kai-zoom comps (235/236) used to zoom into. Orphaned, they
// collide with the A-scene headline 「こんな文字分解」 and the giant
// Heading at the top of the frame (f57-89). Hide them with the rest of
// the replaced A2 material; their window [2.38,3.71] sits inside A2.
export const A2_HIDDEN = new Set([11, 192, 193, 235, 236]); // PV A2 ghost + kai-zoom x2 + orphaned callouts
export const A2_WINDOW: [number, number] = [1.875, 3.92];
// bunkai (232) is the A3 bridge zoom. v15: hidden until 3.9s — its
// opacity fade was retimed to 3.92-4.1 above so it arrives exactly as
// the authored A2 stroke cluster exits (~f94), giving a sequential
// handoff instead of the f87-94 double-hero the M3 critique flagged.
export const A2B_HIDDEN = new Set([232]); // bunkai
export const A2B_WINDOW: [number, number] = [1.875, 3.9];

// A2 tail: once the authored comparison hold ends (~f85), the giant-解
// ghost would double-image the incoming bunkai A3 bridge. Hide PV A2 for
// the bridge window; the bridge carries the upward scroll into scene B.
export const A2T_HIDDEN = new Set([11]); // PV A2 ghost
export const A2T_WINDOW: [number, number] = [3.55, 4.3];
