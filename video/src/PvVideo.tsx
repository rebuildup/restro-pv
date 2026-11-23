import React from "react";
import { CompView, type RenderCtx } from "./ae/layer.tsx";
import { masterComp, mattePairs } from "./ae/project.ts";
import { GENERATED_COMPS, GENERATED_FOOTAGE } from "./ae/project.ts";
import { useCurrentFrame, useVideoConfig } from "remotion";

// Top-level PV composition: renders the dumped AE "master" comp through the
// CompSpec interpreter at the current frame.

// Ending starts at frame 371 (15.4583s). From there the "PV end" scene owns
// the product message; the persistent caption column ("description") and the
// C-scene tagline bar ("Heading") would collide with its staggered copy, so
// they are retired for the ending only. This is a Remotion-side direction
// decision layered on the dumped AEP structure, not an AEP reproduction.
const END_T = 371 / 24;
const RETIRED_IN_ENDING = new Set([10, 15]); // master layer.index: description, Heading

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
  layerFilter: (comp, layer, t) => {
    if (comp.name !== "master" || t < END_T) return true;
    return !RETIRED_IN_ENDING.has(layer.index);
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
