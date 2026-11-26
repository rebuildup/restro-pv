import React from "react";
import { useCurrentFrame } from "remotion";
import { StrokeField, easeOutBack, easeOutCubic, clamp01, seg } from "../scenes/glyph.tsx";
import { filmField, xform, FIT } from "./glyphData.ts";

// Act 1 — hook (f0-96): whole-glyph slam on the first accent, radial burst
// into 13 separated strokes on the phrase hit, held as an exploded proof,
// then reassembled with overshoot. Direction chosen in Step 1 review.

export const HOOK_END = 96;

export const HookAct: React.FC = () => {
  const f = useCurrentFrame();
  const fd = filmField();

  // glyph is present from f0 (no empty first frame); fast scale settle only
  const enterP = clamp01(f / 10);
  const enterScale = 1.12 - 0.12 * easeOutCubic(enterP);
  const enterOp = 1;

  const EXPLODE_AT = 14;
  const punchP = clamp01((f - EXPLODE_AT) / 5);
  const punch = punchP > 0 && punchP < 1 ? Math.sin(punchP * Math.PI) : 0;
  const shakeAmp = punchP > 0 && punchP < 1 ? 2.5 * (1 - punchP) : 0;
  const shX = Math.sin(f * 12.9898) * shakeAmp;
  const shY = Math.cos(f * 7.233) * shakeAmp;

  const explode = (i: number) => {
    const dur = 8 + (i % 4) * 2;
    const p = easeOutCubic(clamp01((f - EXPLODE_AT - fd.rank[i] * 1.2) / dur));
    const dist = 110 + ((i * 41) % 4) * 45;
    const rot = ((i * 29) % 44) - 22;
    const dx = (fd.radial[i].x * 0.85 + fd.tangent[i].x * 0.25) * dist * p;
    const dy = (fd.radial[i].y * 0.85 + fd.tangent[i].y * 0.25) * dist * p;
    return { dx, dy, rot: rot * p, scl: 1 + 0.07 * p };
  };

  const REJOIN_AT = 60;
  const rejoin = (i: number) => {
    const p = easeOutBack(clamp01((f - REJOIN_AT - fd.rank[i] * 1.6) / 16));
    const e = explode(i);
    return {
      dx: e.dx * (1 - p),
      dy: e.dy * (1 - p),
      rot: e.rot * (1 - p),
      scl: 1 + (e.scl - 1) * (1 - p),
    };
  };

  const state = (i: number) => {
    if (f < EXPLODE_AT) return { dx: 0, dy: 0, rot: 0, scl: 1 };
    if (f < REJOIN_AT) return explode(i);
    return rejoin(i);
  };

  // handoff: composed glyph holds f88-96 with a slight push-in so the reveal
  // act can continue the same object without a visible cut
  const push = f > 88 ? 1 + 0.04 * easeOutCubic(clamp01((f - 88) / 8)) : 1;

  // proposition caption: appears as the strokes separate, holds through the
  // exploded proof, exits before the rejoin
  const capOp = seg(f, 20, 28) * (1 - seg(f, 84, 92));

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1080,
        height: 1080,
        transform: `translate(${540 + shX}px,${540 + shY}px) scale(${push}) translate(${-540}px,${-540}px)`,
        transformOrigin: "0 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1080,
          transform: `${FIT} scale(${enterScale * (1 + 0.035 * punch)})`,
          transformOrigin: "540px 540px",
          opacity: enterOp,
        }}
      >
        <StrokeField
          comp={fd.comp}
          strokes={fd.strokes}
          poseT={0.5}
          strokeTransform={(s, i) => {
            const st = state(i);
            return xform(s, st.dx, st.dy, st.rot, st.scl);
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 84,
          textAlign: "center",
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          fontSize: 42,
          fontWeight: 800,
          color: "#111",
          letterSpacing: 2,
          opacity: capOp,
          transform: `translateY(${(1 - capOp) * 16}px)`,
        }}
      >
        1文字を、13の独立したストロークに。
      </div>
    </div>
  );
};
