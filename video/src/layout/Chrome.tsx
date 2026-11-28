import React from "react";
import { CompView, type RenderCtx } from "../ae/layer.tsx";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  masterComp,
  mattePairs,
} from "../ae/project.ts";
import {
  applyMasterPatches,
  STEP_REVEAL,
  B_HIDDEN,
  B_WINDOW,
  E_HIDDEN,
  E_WINDOW,
  C_HIDDEN,
  C_WINDOW,
  D_HIDDEN,
  D_WINDOW,
  A2_HIDDEN,
  A2_WINDOW,
  A2B_HIDDEN,
  A2B_WINDOW,
  A2T_HIDDEN,
  A2T_WINDOW,
} from "../ae/masterPatch.ts";
import { LeftCopy } from "./LeftCopy.tsx";
import { LEFT_COLUMN_MAX_X } from "./zones.ts";
import { AE_RENDER_CAMERA } from "../design/rig.ts";

// The authoritative common composition (Issue #30): background grid,
// brand lockup, left information column (dumped description/Heading plus
// the recovered LeftCopy overlays), dumped stage material that remains
// part of the baseline, and all masterPatch production patches.
//
// Protection model — three compositing planes:
//   PvChromeBase    renders master MINUS the protected chrome layers.
//                   Stage scenes paint above it (bleed preserved).
//   PvLeftGuard     repaints ONLY the confirmed background (grid solid,
//                   white solid, linked quads) clipped to the left
//                   column, so stage content cannot damage the confirmed
//                   backdrop left of the column edge. The 460-480 gap
//                   stays unguarded so intentional bleed is preserved.
//   PvChromeOverlay renders ONLY the protected chrome layers
//                   (brand lockup + description column + their matte
//                   source) plus LeftCopy, composited ABOVE the stage.
// Because the guard and overlay are painted last, scene content cannot
// obscure or alter the confirmed brand/left-column pixels — the
// boundary is compositing order, not clipping, so intentional
// out-of-zone bleed in the stage area is unaffected. The remaining
// layout surface is guarded by tools/verify-layout.ts pixel diffs;
// see docs/issue30-recovery.md.

applyMasterPatches();

// Master layer indices that make up the protected chrome: the left
// information column (description comp, index 10), the persistent brand
// lockup (Heading 15 / AFTER EFFECTS PLUGIN 16 / Ae.png 17 / Logo 18),
// and layer 8 — the alpha-matte source for description (isTrackMatte,
// consumed via mattePairs [10,8]; it is not drawn itself).
export const PROTECTED_MASTER_LAYERS: ReadonlySet<number> = new Set([
  8, 10, 15, 16, 17, 18,
]);

// Confirmed background layers (bottom of the master stack): the grid
// solid, the white solid, and the linked-quad perspective planes.
// Disabled siblings (bunkai 255, base folder 256, Linked Quad 7 259,
// GRID guide 187) are excluded; matte-only layers 263-267 belong to
// stage content and stay in the base plane.
export const BACKGROUND_MASTER_LAYERS: ReadonlySet<number> = new Set([
  257, 258, 260, 261, 262,
]);

const sceneWindowFilter =
  (hide: [Set<number>, [number, number]][]) =>
  (comp: { name: string }, layer: { index: number }, t: number): boolean => {
    if (comp.name !== "master") return true;
    const reveal = STEP_REVEAL[layer.index];
    if (reveal !== undefined) return t >= reveal;
    for (const [set, [a, b]] of hide) {
      if (set.has(layer.index) && t >= a && t < b) return false;
    }
    return true;
  };

const HIDE_WINDOWS: [Set<number>, [number, number]][] = [
  [B_HIDDEN, B_WINDOW],
  [E_HIDDEN, E_WINDOW],
  [C_HIDDEN, C_WINDOW],
  [D_HIDDEN, D_WINDOW],
  [A2_HIDDEN, A2_WINDOW],
  [A2B_HIDDEN, A2B_WINDOW],
  [A2T_HIDDEN, A2T_WINDOW],
];

const windowFilter = sceneWindowFilter(HIDE_WINDOWS);

export const chromeBaseCtx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: AE_RENDER_CAMERA,
  matteMap: mattePairs(),
  layerFilter: (comp, layer, t) => {
    if (comp.name === "master" && PROTECTED_MASTER_LAYERS.has(layer.index))
      return false;
    return windowFilter(comp, layer, t);
  },
};

export const chromeOverlayCtx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: AE_RENDER_CAMERA,
  matteMap: mattePairs(),
  layerFilter: (comp, layer) => {
    if (comp.name !== "master") return true;
    return PROTECTED_MASTER_LAYERS.has(layer.index);
  },
};

// Background-only context for the left-column guard: keeps just the
// confirmed backdrop layers so they can be repainted over stage paint
// inside the left column. Everything else (including stage mattes) is
// filtered out; the backdrop layers have no mattes of their own.
export const chromeBgCtx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: AE_RENDER_CAMERA,
  matteMap: mattePairs(),
  layerFilter: (comp, layer) => {
    if (comp.name !== "master") return true;
    return BACKGROUND_MASTER_LAYERS.has(layer.index);
  },
};

// Backward-compatible alias: full chrome context for single-comp debug
// viewers that render one dumped comp (non-master comps are unaffected
// by the master-only filters).
export const chromeCtx: RenderCtx = chromeBaseCtx;

export const PvChromeBase: React.FC<{ t: number }> = ({ t }) => {
  const comp = masterComp();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: comp.width, height: comp.height }}>
      <CompView comp={comp} ctx={chromeBaseCtx} t={t} isRoot />
    </div>
  );
};

export const PvChromeOverlay: React.FC<{ t: number }> = ({ t }) => {
  const comp = masterComp();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: comp.width, height: comp.height }}>
      {/* not isRoot: this plane must stay transparent outside the
          protected layers — an opaque comp background would cover the
          stage below it */}
      <CompView comp={comp} ctx={chromeOverlayCtx} t={t} />
      <LeftCopy t={t} />
    </div>
  );
};

// Repaints the confirmed background inside the left column only, over
// any stage paint that reached x < LEFT_COLUMN_MAX_X. Clipped, not
// scaled — pixels are identical to the base plane's backdrop.
export const PvLeftGuard: React.FC<{ t: number }> = ({ t }) => {
  const comp = masterComp();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: LEFT_COLUMN_MAX_X,
        height: comp.height,
        overflow: "hidden",
      }}
    >
      {/* not isRoot: transparent outside the background layers */}
      <CompView comp={comp} ctx={chromeBgCtx} t={t} />
    </div>
  );
};

// Chrome-only composition content (no stage): base + left guard + overlay.
export const PvChrome: React.FC<{ t: number }> = ({ t }) => (
  <>
    <PvChromeBase t={t} />
    <PvLeftGuard t={t} />
    <PvChromeOverlay t={t} />
  </>
);
