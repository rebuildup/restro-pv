import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import { PAPER } from "./glyphData.ts";
import { HookAct, HOOK_END } from "./HookAct.tsx";
import { RevealAct } from "./RevealAct.tsx";
import { ProofAct } from "./ProofAct.tsx";
import { ApplyAct } from "./ApplyAct.tsx";
import { CtaAct } from "./CtaAct.tsx";

// PV-Full — the 20s film per docs/step1-plan.md (Issue #29 Step 2).
// 1080x1080 / 24fps / 480f. Acts:
//   f0-96    hook      — real-stroke explode/rejoin (Step-1 direction B)
//   f96-180  reveal    — outline -> 13 independent stroke contours
//   f180-264 proof     — real AE Decompose footage (Executing Script + STROKE)
//   f264-408 apply     — mirror rearrangement + palette/wave (independence)
//   f408-480 cta       — official logo + BOOTH/URL, high contrast

const BGM = "assets/audio/drums-and-somps-background-music-458414.mp3";

const REVEAL_START = 96;
const PROOF_START = 180;
const PROOF_END = 234;
const APPLY_START = 234;
const CTA_START = 408;

const GridBg: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: PAPER,
      backgroundImage:
        "linear-gradient(rgba(17,17,17,0.05) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(17,17,17,0.05) 1px, transparent 1px)," +
        "linear-gradient(rgba(17,17,17,0.085) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(17,17,17,0.085) 1px, transparent 1px)",
      backgroundSize: "54px 54px, 54px 54px, 270px 270px, 270px 270px",
    }}
  />
);

export const PvFull: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "relative", width: 1080, height: 1080 }}>
      <Audio src={staticFile(BGM)} />
      <GridBg />
      {f < REVEAL_START && <HookAct />}
      {f >= REVEAL_START && f < PROOF_START && <RevealAct />}
      {f >= PROOF_START && f < PROOF_END && <ProofAct />}
      {f >= APPLY_START && f < CTA_START && <ApplyAct />}
      {f >= CTA_START && <CtaAct />}
    </div>
  );
};

export { HOOK_END };
