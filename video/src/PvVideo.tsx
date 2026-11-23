import React from "react";
import { CompView, type RenderCtx } from "./ae/layer.tsx";
import { masterComp } from "./ae/project.ts";
import { GENERATED_COMPS, GENERATED_FOOTAGE } from "./ae/project.ts";
import { useCurrentFrame, useVideoConfig } from "remotion";

// Top-level PV composition: renders the dumped AE "master" comp through the
// CompSpec interpreter at the current frame.

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: new Map(),
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
