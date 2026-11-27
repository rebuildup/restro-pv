import React from "react";
import { CompView } from "./ae/layer.tsx";
import { GENERATED_COMPS } from "./ae/project.ts";
import { chromeCtx, PvChrome } from "./layout/Chrome.tsx";
import { PvStage } from "./layout/Stage.tsx";
import { useCurrentFrame, useVideoConfig } from "remotion";

// Top-level PV composition (PV-Master, the official entry — Issue #30):
// PvChrome renders the confirmed common layout (dumped master comp +
// masterPatch + recovered LeftCopy) and PvStage mounts the registered
// right-stage scenes through the explicit slot in layout/Stage.tsx.
// Scene content cannot reach into the chrome layer.

export const PvVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div style={{ position: "relative", width: 1080, height: 1080 }}>
      <PvChrome t={t} />
      <PvStage t={t} />
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
      <CompView comp={comp} ctx={chromeCtx} t={t} isRoot />
    </div>
  );
};

// Debug composition: chrome layer only (no stage scenes). Used to verify
// that right-stage content cannot affect the confirmed layout — diff
// PV-Master against PV-Chrome; differences must be confined to scene
// content (see tests/pv-layout-contract.test.ts and
// docs/issue30-recovery.md).
export const ChromeOnly: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <PvChrome t={frame / fps} />;
};
