import React from "react";
import { CompView, type RenderCtx } from "./ae/layer.tsx";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  masterComp,
  mattePairs,
} from "./ae/project.ts";
import { applyMasterPatches, STEP_REVEAL } from "./ae/masterPatch.ts";
import { useCurrentFrame, useVideoConfig } from "remotion";

applyMasterPatches();

// Top-level PV composition: renders the dumped AE "master" comp through the
// CompSpec interpreter at the current frame. The dumped scene comps
// (PV A2 / PV reel C / PV ops / PV end) carry the authored AE direction and
// reproduce the beat references; the only Remotion-side intervention is the
// scene-B step reveal schedule and the dialog-free D in-points (ADR-0005).

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
  layerFilter: (comp, layer, t) => {
    if (comp.name !== "master") return true;
    const reveal = STEP_REVEAL[layer.index];
    if (reveal !== undefined) return t >= reveal;
    return true;
  },
};

export const PvVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const comp = masterComp();
  return (
    <div style={{ position: "relative", width: comp.width, height: comp.height }}>
      <CompView comp={comp} ctx={ctx} t={t} isRoot />
    </div>
  );
};

// Debug composition: renders a single dumped comp full-frame.
export const CompOnly: React.FC<{ compName?: string }> = ({ compName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const comp = GENERATED_COMPS.find((c) => c.name === (compName ?? "description"));
  if (!comp) return null;
  return (
    <div style={{ position: "relative", width: comp.width, height: comp.height }}>
      <CompView comp={comp} ctx={ctx} t={t} isRoot />
    </div>
  );
};
