import React from "react";
import { useCurrentFrame } from "remotion";
import {
  StrokeField,
  easeInOutCubic,
  easeOutCubic,
  clamp01,
  seg,
} from "../../scenes/glyph.tsx";
import { filmField, FIT, BB_CX } from "./glyphData.ts";
import { MUSIC } from "./musicSync.ts";
import type { StrokeItem } from "../../scenes/glyph.tsx";

// Act 4 — application (abs f234-408, local 0-174): two proofs that the
// strokes are independent shapes, not a flat illustration.
//   ex1 (0-68):   strokes burst, then each flips to its mirrored slot —
//                the glyph reforms as its own mirror image, stroke by stroke.
//   ex2 (68-174): strokes travel back while the field crossfades into a
//                vertical-third palette, then every stroke dances with its
//                own direction/speed/phase — no two strokes move alike.

const START = 234;

interface StrokeState {
  ox: number;
  oy: number;
  rot: number;
  scl: number;
  sx: number; // 1 = normal, -1 = mirrored about BB_CX (through 0 mid-flip)
}

export const ApplyAct: React.FC = () => {
  const f = useCurrentFrame() - START;
  const fd = filmField();

  // ex1 explode (local 0-18): radial burst, staggered by writing order
  const explode = (i: number) => {
    const p = easeOutCubic(clamp01((f - fd.rank[i] * 0.8) / 10));
    const dist = 80 + ((i * 47) % 3) * 45;
    const rot = ((i * 23) % 40) - 20;
    return {
      ox: fd.radial[i].x * dist * p,
      oy: fd.radial[i].y * dist * p,
      rot: rot * p,
      scl: 1 + 0.06 * p,
    };
  };

  // ex1 mirror travel (local 20-56): sx 1 -> -1 staggered by rank
  const goMirror = (i: number) =>
    easeInOutCubic(clamp01((f - 20 - fd.rank[i] * 1.4) / 26));
  // ex2 return travel (local 68-102): sx -1 -> 1 staggered
  const backNormal = (i: number) =>
    easeInOutCubic(clamp01((f - 68 - fd.rank[i] * 1.2) / 26));

  // palette sweep centered on the 14.5s section boundary: each stroke
  // crossfades ink->color staggered along the radial direction (top->bottom
  // wave), not a global opacity blend
  const PALETTE_AT = MUSIC.paletteHit - START; // 114
  const paletteMix = (i: number) =>
    seg(f, PALETTE_AT - 10 + fd.radial[i].y * 6 + fd.rank[i] * 0.4, PALETTE_AT + 8 + fd.radial[i].y * 6 + fd.rank[i] * 0.4);

  // per-stroke independent motion on the colored hold: starts on the
  // 14.58s accent, direction mostly tangential with per-stroke spread,
  // unique amplitude, speed and phase per stroke.
  const DANCE_AT = MUSIC.danceHit - START; // 116
  // resolve: last ~20f damp all motion back to the composed glyph so the
  // CTA inherits a clean finished image instead of a hard cut from chaos
  const RESOLVE_AT = 150;
  const resolveP = seg(f, RESOLVE_AT, 172);
  const dance = (i: number): { dx: number; dy: number; rot: number; scl: number } => {
    if (f < DANCE_AT) return { dx: 0, dy: 0, rot: 0, scl: 1 };
    const w = (f - DANCE_AT) / (RESOLVE_AT - DANCE_AT); // 0..1 across the hold
    const ramp = Math.min(1, w * 2.5);
    const spread = ((i * 47) % 5 - 2) * 0.32; // -0.64..+0.64 rad
    const ang = Math.atan2(fd.tangent[i].y, fd.tangent[i].x) + spread;
    const amp = (6 + (i % 4) * 3) * ramp;
    const speed = 1.5 + (i % 3) * 0.5;
    const phase = i * 1.31;
    const s = Math.sin(w * Math.PI * 2 * speed + phase);
    return {
      dx: Math.cos(ang) * amp * s,
      dy: Math.sin(ang) * amp * s,
      rot: (1.5 + (i % 3)) * Math.sin(w * Math.PI * 2 * speed * 0.7 + phase * 1.7),
      scl: 1 + (0.015 + (i % 3) * 0.012) * Math.sin(w * Math.PI * 2 * speed * 0.6 + phase),
    };
  };

  const state = (i: number): StrokeState => {
    const e = explode(i);
    let st: StrokeState = { ox: e.ox, oy: e.oy, rot: e.rot, scl: e.scl, sx: 1 };
    if (f >= 20 && f < 68) {
      const tp = goMirror(i);
      st = {
        ox: e.ox * (1 - tp),
        oy: e.oy * (1 - tp),
        rot: e.rot * (1 - tp),
        scl: 1 + (e.scl - 1) * (1 - tp),
        sx: 1 - 2 * tp,
      };
    } else if (f >= 68) {
      const tp = backNormal(i);
      const d = dance(i);
      const damp = 1 - resolveP; // resolve: motion dies back to the glyph
      st = {
        ox: d.dx * damp,
        oy: d.dy * damp,
        rot: d.rot * damp,
        scl: 1 + (d.scl - 1) * damp,
        sx: -1 + 2 * tp,
      };
    }
    return st;
  };

  // transform order (outermost first): travel offset -> mirror about the
  // glyph centerline -> rotate/scale about the stroke's own center.
  const strokeTransform = (s: StrokeItem, i: number) => {
    const st = state(i);
    const [cx, cy] = s.center;
    return (
      `translate(${st.ox.toFixed(2)}px,${st.oy.toFixed(2)}px) ` +
      `translate(${BB_CX}px,0px) scale(${st.sx.toFixed(4)},1) ` +
      `translate(${-BB_CX}px,0px) ` +
      `translate(${cx}px,${cy}px) rotate(${st.rot.toFixed(2)}deg) ` +
      `scale(${st.scl.toFixed(4)}) translate(${-cx}px,${-cy}px)`
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1080,
        height: 1080,
        transform: FIT,
        transformOrigin: "0 0",
      }}
    >
      {/* ink field — per-stroke fade as the palette sweep passes */}
      <StrokeField
        comp={fd.comp}
        strokes={fd.strokes}
        poseT={0.5}
        strokeTransform={strokeTransform}
        strokeOpacity={(_s, i) => 1 - paletteMix(i)}
      />
      {/* palette field — same motion, colors arrive as a top->bottom wave */}
      <StrokeField
        comp={fd.comp}
        strokes={fd.strokesColor}
        poseT={0.5}
        strokeTransform={strokeTransform}
        strokeOpacity={(_s, i) => paletteMix(i)}
      />
    </div>
  );
};
