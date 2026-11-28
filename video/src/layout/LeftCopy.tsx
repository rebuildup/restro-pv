import React from "react";
import {
  GridRef,
  MASTER_GRID,
  buildLeftChromeRig,
  leftChromeOpenProgress,
} from "../design/rig.ts";

// Left-column copy owned by the chrome layer (Issue #30 + Issue #32 structural restore).
// Anchored inside the L2/L4 `descMatteSlot` of our 4-layer decoupled rig so Scene D's
// left copy strictly tracks Logo/Heading aperture (y=546..883 matte window) instead of
// colliding with static top:648/706 values.
// During Scene E (t >= 371/24), the matte closes (h=337->27) and restored Heading [15]
// (y=746..812) + Logo [18] (y=435..695) return cleanly via P 5..12 without overlay collision.

const JP = "'Noto Sans JP', 'Hiragino Sans', sans-serif";
const T0_D = 281 / 24;
const T1_D = 371 / 24;

const grid = new GridRef(MASTER_GRID);

const ramp = (t: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

export const LeftCopy: React.FC<{ t: number }> = ({ t }) => {
  const dActive = t >= T0_D && t < T1_D;
  if (!dActive) return null;

  const dIn = smooth(ramp(t, T0_D, T0_D + 0.3));
  if (dIn <= 0) return null;

  const { nodes } = buildLeftChromeRig(grid, { openProgress: leftChromeOpenProgress(t) });
  const matte = nodes.get("descMatteSlot")!.worldRect!;

  return (
    <div
      style={{
        position: "absolute",
        left: matte.x,
        top: matte.y,
        width: matte.w,
        height: matte.h,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 6,
          top: 32,
          width: matte.w - 12,
          opacity: dIn,
          transform: `translateY(${(1 - dIn) * 10}px)`,
          fontFamily: JP,
          color: "#111",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2.6,
            marginBottom: 14,
            color: "#111",
          }}
        >
          AE WORKFLOW
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.4 }}>
          After Effectsで、
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.4 }}>
          そのまま動かせる。
        </div>
        <div style={{ marginTop: 14, fontSize: 18, fontWeight: 500, color: "#444", lineHeight: 1.5 }}>
          分解した筆画がレイヤーとして動く
        </div>
      </div>
    </div>
  );
};
