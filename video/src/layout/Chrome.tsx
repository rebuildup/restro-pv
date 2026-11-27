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

// The authoritative common composition (Issue #30): background grid,
// brand lockup, left information column (dumped description/Heading plus
// the recovered LeftCopy overlays), dumped stage material that remains
// part of the baseline, and all masterPatch production patches.
//
// This component takes NO scene input — it cannot be influenced by
// right-stage content, which is what makes the fixed layout a structural
// guarantee rather than a convention. Right-stage scenes mount above it
// through Stage.tsx.

applyMasterPatches();

export const chromeCtx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
  layerFilter: (comp, layer, t) => {
    if (comp.name !== "master") return true;
    const reveal = STEP_REVEAL[layer.index];
    if (reveal !== undefined) return t >= reveal;
    if (B_HIDDEN.has(layer.index) && t >= B_WINDOW[0] && t < B_WINDOW[1])
      return false;
    if (E_HIDDEN.has(layer.index) && t >= E_WINDOW[0] && t < E_WINDOW[1])
      return false;
    if (C_HIDDEN.has(layer.index) && t >= C_WINDOW[0] && t < C_WINDOW[1])
      return false;
    if (D_HIDDEN.has(layer.index) && t >= D_WINDOW[0] && t < D_WINDOW[1])
      return false;
    if (A2_HIDDEN.has(layer.index) && t >= A2_WINDOW[0] && t < A2_WINDOW[1])
      return false;
    if (A2B_HIDDEN.has(layer.index) && t >= A2B_WINDOW[0] && t < A2B_WINDOW[1])
      return false;
    if (A2T_HIDDEN.has(layer.index) && t >= A2T_WINDOW[0] && t < A2T_WINDOW[1])
      return false;
    return true;
  },
};

export const PvChrome: React.FC<{ t: number }> = ({ t }) => {
  const comp = masterComp();
  return (
    <div style={{ position: "relative", width: comp.width, height: comp.height }}>
      <CompView comp={comp} ctx={chromeCtx} t={t} isRoot />
      <LeftCopy t={t} />
    </div>
  );
};
