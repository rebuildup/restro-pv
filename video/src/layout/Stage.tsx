import React from "react";
import { SceneA2 } from "../scenes/SceneA2.tsx";
import { SceneB } from "../scenes/SceneB.tsx";
import { SceneC } from "../scenes/SceneC.tsx";
import { SceneD } from "../scenes/SceneD.tsx";
import { SceneE } from "../scenes/SceneE.tsx";

// The explicit connection surface for right-stage content (Issue #30).
// This registry is the ONLY way scene content enters the official PV:
// PV-Master mounts PvChromeBase, then PvStage (this list), then
// PvChromeOverlay — the protected chrome (brand lockup + left column)
// is composited LAST, so scene content cannot obscure or alter the
// confirmed layout pixels. Scenes may still paint anywhere on screen
// (intentional bleed is preserved); what they cannot do is cover the
// protected chrome. Enforced by tests/pv-layout-contract.test.ts and
// tools/verify-layout.ts; see docs/issue30-recovery.md.

export interface StageScene {
  id: string;
  /** comp-time window [from, to) in seconds; the scene mounts only inside it */
  window: readonly [number, number];
  Component: React.FC<{ t: number }>;
}

export const STAGE_SCENES: readonly StageScene[] = [
  // A2+A3 bridge (SPEC §5 A2/A3): [1.875, 4.208)
  { id: "A2", window: [45 / 24, 101 / 24], Component: SceneA2 },
  // B principle scene (SPEC §5 B): overlaps A2 tail intentionally
  { id: "B", window: [3.9, 7.96], Component: SceneB },
  // C works strip (SPEC §5 C): [7.958, 11.708)
  { id: "C", window: [191 / 24, 281 / 24], Component: SceneC },
  // D real-AE-operation proof (SPEC §5 D): [11.708, 15.458)
  // Scene D starts four frames before its nominal boundary so its windows
  // can cross-dissolve with the outgoing gallery strip instead of the
  // stage going empty for a frame at the cut.
  { id: "D", window: [277 / 24, 371 / 24], Component: SceneD },
  // E closing + product card (SPEC §5 E): [15.458, 20)
  { id: "E", window: [371 / 24, 20], Component: SceneE },
];

export const PvStage: React.FC<{ t: number }> = ({ t }) => {
  return (
    <>
      {STAGE_SCENES.map(({ id, window: [from, to], Component }) =>
        t >= from && t < to ? <Component key={id} t={t} /> : null,
      )}
    </>
  );
};
