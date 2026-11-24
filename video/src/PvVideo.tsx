import React from "react";
import { CompView, type RenderCtx } from "./ae/layer.tsx";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  masterComp,
  mattePairs,
} from "./ae/project.ts";
import {
  applyMasterPatches,
  LEFT_COLUMN_REPLACED,
  HIDDEN_ALWAYS,
  STEP_REVEAL,
  sceneReplaced,
  sceneHidden,
} from "./ae/masterPatch.ts";
import { compByIndex } from "./ae/project.ts";
import { LeftCopy } from "./scenes/LeftCopy.tsx";
import { SceneE } from "./scenes/SceneE.tsx";
import { SceneA2 } from "./scenes/SceneA2.tsx";
import { SceneC } from "./scenes/SceneC.tsx";
import { SceneB } from "./scenes/SceneB.tsx";
import { useCurrentFrame, useVideoConfig } from "remotion";

applyMasterPatches();

// Top-level PV composition: renders the dumped AE "master" comp through the
// CompSpec interpreter at the current frame. The dumped scene comps
// (PV A2 / PV reel C / PV ops / PV end) render correctly in master context,
// so scenes are not replaced; authored overlays cover only what the dump
// cannot express (per-scene left copy, step reveal timing).

const ctx: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
  layerFilter: (comp, layer, t) => {
    if (comp.name !== "master") return true;
    if (HIDDEN_ALWAYS.has(layer.index)) return false;
    if (LEFT_COLUMN_REPLACED.has(layer.index)) return false;
    if (sceneHidden(layer.index, t)) return false;
    if (layer.kind === "comp") {
      const sub = compByIndex(layer.sourceCompIndex);
      if (sceneReplaced(sub?.name, t)) return false;
    }
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
      <LeftCopy t={t} />
      <SceneA2 t={t} />
      <SceneB t={t} />
      <SceneC t={t} />
      <SceneE t={t} />
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
