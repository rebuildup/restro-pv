import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import {
  compStrokes,
  tintedStrokes,
  StrokeField,
  easeOutBack,
  easeOutCubic,
  clamp01,
  type StrokeItem,
} from "../../scenes/glyph.tsx";

// Step-1 hook prototypes (Issue #29): two 4s variants built ONLY from real
// Restro stroke geometry (Baseline FUDE S01-S13, the same decompose output
// the product generates). No dummy shapes. Direction test — not final cut.
//
// Variant A "cascade": strokes gather into the glyph on the beat grid,
//   then drift with per-stroke phase offsets (independence readable).
// Variant B "explode":  glyph slams in whole, bursts into 13 separated
//   strokes on a phrase accent, then reassembles with overshoot.

const INK: [number, number, number] = [0.07, 0.07, 0.08];
const ACCENT: [number, number, number] = [0.83, 0.27, 0.13]; // Restro red
const HERO_RANK = 6; // middle of the 13-stroke writing order

// Baseline FUDE rest-pose bbox (comp space, measured — same as SceneC)
const BB = { minX: 583, minY: 283, maxX: 1309, maxY: 997 };
const BB_CX = (BB.minX + BB.maxX) / 2;
const BB_CY = (BB.minY + BB.maxY) / 2;
const FIT_S = 0.72;
const FIT = `translate(${540 - BB_CX * FIT_S}px,${540 - BB_CY * FIT_S}px) scale(${FIT_S})`;

const BGM = "assets/audio/drums-and-somps-background-music-458414.mp3";

// beat grid from tools/analyze-music.ts (beatsSec * 24). Phrase accents land
// on every other beat (~0.558s). Only the 0-4s window is used here.
const BEAT_F = [0, 7, 13, 20, 27, 33, 40, 47, 53, 60, 67, 73, 80, 87, 94];

function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

interface Field {
  comp: ReturnType<typeof compStrokes>["comp"];
  strokes: StrokeItem[];
  rank: number[]; // writing-order rank per strokes[] index
  radial: { x: number; y: number }[]; // unit vector from glyph center
  tangent: { x: number; y: number }[];
}

let cached: Field | null = null;

function field(): Field {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  if (!strokes.length) throw new Error("Baseline FUDE strokes not found");
  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rank = new Array(strokes.length).fill(0);
  order.forEach((o, r) => {
    rank[o.i] = r;
  });
  const radial = strokes.map((s) => {
    const dx = s.center[0] - BB_CX;
    const dy = s.center[1] - BB_CY;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });
  const tangent = radial.map((r) => ({ x: -r.y, y: r.x }));
  cached = { comp, strokes, rank, radial, tangent };
  return cached;
}

function tinted(fieldData: Field): StrokeItem[] {
  return tintedStrokes(fieldData.strokes, (_s, i) =>
    fieldData.rank[i] === HERO_RANK ? ACCENT : INK,
  );
}

// rotate+scale about the stroke's own bbox center, then translate — all in
// comp units so the outer FIT transform scales everything uniformly.
function xform(
  item: StrokeItem,
  dx: number,
  dy: number,
  rot: number,
  scl: number,
): string {
  const [cx, cy] = item.center;
  return (
    `translate(${dx}px,${dy}px) translate(${cx}px,${cy}px) ` +
    `rotate(${rot}deg) scale(${scl}) translate(${-cx}px,${-cy}px)`
  );
}

const GridBg: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: "#f7f7f7",
      backgroundImage:
        "linear-gradient(rgba(17,17,17,0.055) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(17,17,17,0.055) 1px, transparent 1px)," +
        "linear-gradient(rgba(17,17,17,0.09) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(17,17,17,0.09) 1px, transparent 1px)",
      backgroundSize: "54px 54px, 54px 54px, 270px 270px, 270px 270px",
    }}
  />
);

const ProtoAudio: React.FC = () => (
  <Audio src={staticFile(BGM)} />
);

// ---------------------------------------------------------------- Variant A
// Staggered gathering on the beat grid, then a per-stroke drift phase that
// keeps the glyph alive without breaking its silhouette.
export const ProtoHookA: React.FC = () => {
  const f = useCurrentFrame();
  const fd = field();
  const strokes = tinted(fd);

  // assembly: stroke i departs at frame delay_i, flight ~16f, easeOutBack
  const fly = (i: number) => {
    const delay = 2 + fd.rank[i] * 3.6;
    const p = clamp01((f - delay) / 16);
    if (p <= 0) return { dx: 0, dy: 0, rot: 0, scl: 0.55, op: 0, p: 0 };
    const ePos = easeOutCubic(p);
    const eRot = easeOutBack(p);
    const dist = 430 + ((i * 53) % 3) * 70;
    const dirx = fd.radial[i].x + fd.tangent[i].x * 0.3;
    const diry = fd.radial[i].y + fd.tangent[i].y * 0.3;
    const dl = Math.hypot(dirx, diry) || 1;
    const rot0 = ((i * 37) % 60) - 30;
    return {
      dx: (dirx / dl) * dist * (1 - ePos),
      dy: (diry / dl) * dist * (1 - ePos),
      rot: rot0 * (1 - eRot),
      scl: 0.55 + 0.45 * ePos,
      op: Math.min(1, p * 4),
      p,
    };
  };

  // drift (f>=74): slow per-stroke tangential float + rotation only, so the
  // glyph silhouette stays centered while each stroke stays independently
  // alive. Amplitude ramps in over ~10f.
  const drift = (i: number) => {
    if (f < 74) return { dx: 0, dy: 0, rot: 0 };
    const w = (f - 74) / 22; // 0..1
    const amp = 7 * Math.min(1, w * 2.5);
    const ph = fd.rank[i] * 0.9;
    return {
      dx: fd.tangent[i].x * amp * Math.sin(w * Math.PI * 2 + ph),
      dy: fd.tangent[i].y * amp * Math.sin(w * Math.PI * 2 + ph),
      rot: 2.5 * Math.sin(w * Math.PI * 2 + ph + 1.2),
    };
  };

  return (
    <div style={{ position: "relative", width: 1080, height: 1080 }}>
      <ProtoAudio />
      <GridBg />
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
        <StrokeField
          comp={fd.comp}
          strokes={strokes}
          poseT={0.5}
          strokeOpacity={(_s, i) => fly(i).op}
          strokeTransform={(s, i) => {
            const a = fly(i);
            const d = drift(i);
            return xform(s, a.dx + d.dx, a.dy + d.dy, a.rot + d.rot, a.scl);
          }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Variant B
// Whole-glyph impact on the first phrase accent, radial burst into 13
// separated strokes, held as an "exploded" proof, then reassembled.
export const ProtoHookB: React.FC = () => {
  const f = useCurrentFrame();
  const fd = field();
  const strokes = tinted(fd);

  // entrance: whole glyph scale/opacity settle f0-f8
  const enterP = clamp01(f / 8);
  const enterScale = 1.14 - 0.14 * easeOutCubic(enterP);
  const enterOp = Math.min(1, enterP * 3);

  // impact punch on the explode accent (f14): squash-and-release over 5f so
  // the burst reads as a hit, not a drift.
  const EXPLODE_AT_PUNCH = 14;
  const punchP = clamp01((f - EXPLODE_AT_PUNCH) / 5);
  const punch = punchP > 0 && punchP < 1 ? Math.sin(punchP * Math.PI) : 0;

  // explode f14 -> staggered by rank (1.2f each), per-stroke flight 8-14f
  // (velocity variance so fragments do not move as one rigid body)
  const EXPLODE_AT = 14;
  const explode = (i: number) => {
    const dur = 8 + (i % 4) * 2;
    const p = easeOutCubic(clamp01((f - EXPLODE_AT - fd.rank[i] * 1.2) / dur));
    const dist = 110 + ((i * 41) % 4) * 45;
    const rot = ((i * 29) % 44) - 22;
    // mostly radial, slight tangential swirl
    const dx = (fd.radial[i].x * 0.85 + fd.tangent[i].x * 0.25) * dist * p;
    const dy = (fd.radial[i].y * 0.85 + fd.tangent[i].y * 0.25) * dist * p;
    return { dx, dy, rot: rot * p, scl: 1 + 0.07 * p };
  };

  // reassemble f60 -> staggered, easeOutBack, done ~f88
  const REJOIN_AT = 60;
  const rejoin = (i: number) => {
    const p = easeOutBack(clamp01((f - REJOIN_AT - fd.rank[i] * 1.6) / 16));
    return { dx: explode(i).dx * (1 - p), dy: explode(i).dy * (1 - p), rot: explode(i).rot * (1 - p), scl: 1 + (explode(i).scl - 1) * (1 - p) };
  };

  const state = (i: number) => {
    // explode progress is monotonic in f; rejoin subtracts it back out.
    if (f < EXPLODE_AT) return { dx: 0, dy: 0, rot: 0, scl: 1 };
    if (f < REJOIN_AT) return explode(i);
    return rejoin(i);
  };

  return (
    <div style={{ position: "relative", width: 1080, height: 1080 }}>
      <ProtoAudio />
      <GridBg />
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
          strokes={strokes}
          poseT={0.5}
          strokeTransform={(s, i) => {
            const st = state(i);
            return xform(s, st.dx, st.dy, st.rot, st.scl);
          }}
        />
      </div>
    </div>
  );
};
