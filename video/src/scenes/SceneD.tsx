import React from "react";

// Scene D [281,371) per SPEC §5 D: the dumped "PV ops" comp already
// renders the four recording windows (patched in masterPatch.ts); this
// overlay only adds small content labels so the async windows read as
// distinct operations rather than four similar AE screens. Window
// geometry is the PV ops comp layout, which maps 1:1 to screen
// (master layer pos [540,540], scale 100).
//
//   W1 (top, 600x400)  decompose-ops 40s  — inferred anchors on "Restro"
//   W2 (mid-left)      stroke-animate 5s  — generated strokes moving
//   W3 (mid-right)     stroke-animate 22s — control-point editing
//   W4 (bottom, 600x260) reprocess 14s   — anchors clear, result resolves

const T0 = 281 / 24;
const T1 = 371 / 24;

// Master-comp seconds. PV ops local time = master t - 11.7083; each label
// fades in/out with its window's schedule (masterPatch OPS_WINDOWS) so a
// caption never outlives its footage — r7 review failed orphaned labels.
// Positions assume the PV ops comp is inset to 90% about center (540,540)
// per masterPatch — window coords *0.9 + 54 offset equivalent.
const LABELS: { x: number; y: number; text: string; t0: number; t1: number }[] = [
  { x: 491, y: 88, text: "頂点の推定", t0: 11.5, t1: 13.6 }, // W1 local 0.0-1.9, instant in
  { x: 491, y: 462, text: "筆画の生成", t0: 11.5, t1: 14.1 }, // W2 local 0.0-2.4, instant in
  { x: 769, y: 462, text: "筆画の編集", t0: 12.71, t1: 15.4 }, // W3 local 1.0-3.72
  { x: 491, y: 716, text: "分解結果の確定", t0: 13.71, t1: 15.4 }, // W4 local 2.0-3.72
];

const ramp = (t: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

export const SceneD: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {LABELS.map((l) => {
        const opacity = smooth(ramp(t, l.t0, l.t0 + 0.15)) * (1 - smooth(ramp(t, l.t1 - 0.15, l.t1)));
        if (opacity <= 0) return null;
        return (
          <div
            key={l.text}
            style={{
              position: "absolute",
              left: l.x,
              top: l.y,
              opacity,
              fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              fontSize: 20,
              fontWeight: 700,
              color: "#111",
              background: "rgba(247,247,247,0.85)",
              padding: "1px 8px",
            }}
          >
            {l.text}
          </div>
        );
      })}
    </div>
  );
};
