import React from "react";
import {
  compStrokes,
  StrokeField,
  easeInOutCubic,
  easeOutCubic,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";

// Scene B [3.9, 7.96) per SPEC §5 B (structure protected): ONE large 筆
// stays fixed in place while each processing step adds a different kind of
// geometric information on top of it —
//   01 輪郭を解析      -> merged-contour outline highlights (red)
//   02 輪郭線を延長    -> stroke end tangents extended (green)
//   03 隠れた頂点を推定 -> path vertices marked (blue)
//   04 筆画として再構成 -> strokes separated, individually colored (multi)
// The dumped STEP1-4 comps turned out to be the same glyph recolored, so
// they cannot carry these semantics; masterPatch hides the draft comps,
// the dumped Baseline layer and the dumped Lens magnifier, while the tab
// bands, step borders and 01-04 labels stay. This scene re-renders the
// real Baseline strokes at their dumped comp position and adds the
// per-step geometry plus an authored magnifier lens.

const T0 = 4.2;
const T1 = 7.92;
const STEP_T = [4.25, 5.15, 6.05, 6.95];
const STEP_COLORS = ["#D64520", "#2FA36B", "#2F6FED", "#E8A52F"];

// per-stroke palette for step 04 (same family as SceneC)
const PALETTE = [
  "#D64520", "#2F6FED", "#2FA36B", "#E8A52F", "#8A5FE8", "#D64F8A",
  "#3AA6A6", "#B8860B", "#5B7FE8", "#C0392B", "#4C9A2A", "#7A4FD0",
  "#C46A1B",
];

// magnifier lens: screen position, radius, zoom, and the comp-space point
// it enlarges (a dense stroke junction area of the 筆)
const LENS = { x: 800, y: 800, r: 96, zoom: 2.3, px: 946, py: 640 };

function tintStroke(item: StrokeItem, rgb: string): StrokeItem {
  const [r, g, b] = rgb
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const patch = (n: any): any => {
    if (Array.isArray(n)) return n.map(patch);
    if (n && typeof n === "object") {
      const o: any = {};
      for (const [k, v] of Object.entries(n)) o[k] = patch(v);
      if (o.matchName === "ADBE Vector Fill Color" && "value" in o) {
        o.value = [r, g, b];
      }
      return o;
    }
    return n;
  };
  return {
    ...item,
    layer: { ...item.layer, shapes: patch(item.layer.shapes) },
  };
}

// extended end-tangent segments for step 02: for each stroke, extend the
// first and last path segments outward by `len` comp units.
function extensionSegments(
  strokes: StrokeItem[],
  len: number,
): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of strokes) {
    const p = s.points;
    if (p.length < 2) continue;
    const head = p.slice(0, 3);
    const tail = p.slice(-3);
    const ext = (a: [number, number], b: [number, number], fromEnd: boolean) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const [ex, ey] = fromEnd ? a : b;
      const sgn = fromEnd ? 1 : -1;
      return [ex + sgn * ux * len, ey + sgn * uy * len, ex, ey] as [
        number,
        number,
        number,
        number,
      ];
    };
    out.push(ext(head[0], head[1], true)); // extend backwards past first pt
    out.push(ext(tail[tail.length - 2], tail[tail.length - 1], false));
  }
  return out;
}

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d\d/,
  });
  const ordered = [...strokes].sort((a, b) => a.name.localeCompare(b.name));
  const { strokes: outlines } = compStrokes("Baseline", {
    pattern: /^FUDE outline/,
  });

  const stepP = STEP_T.map((st) => seg(t, st, st + 0.5));
  const activeStep = stepP.reduce(
    (acc, p, i) => (p > 0.5 ? i : acc),
    -1,
  );

  // ---- glyph layer stack ----------------------------------------------
  // ghost of the full character: faint from scene start so the same large
  // 筆 is present before step 04 ("同一の文字を固定")
  const ghostOp = 0.16;
  // step-04 separation: strokes tint + slight outward displacement
  const sep = easeInOutCubic(stepP[3]);
  const glyphCX = 946;
  const glyphCY = 640;

  const strokeItems = ordered.map((s, i) => {
    // displacement direction: away from glyph center
    const dx = s.center[0] - glyphCX;
    const dy = s.center[1] - glyphCY;
    const d = Math.hypot(dx, dy) || 1;
    const mx = (dx / d) * 10 * sep;
    const my = (dy / d) * 10 * sep;
    const colored =
      sep > 0.01 ? tintStroke(s, PALETTE[i % PALETTE.length]) : s;
    return { item: colored, i, mx, my };
  });

  // stroke opacity: ghost until step4, then full (history marks stay)
  const mainOpacity = (item: StrokeItem, i: number) => {
    void item;
    return ghostOp + (1 - ghostOp) * easeOutCubic(stepP[3]);
  };

  // per-stroke transform for step-04 displacement (comp space = screen)
  const strokeTransform = (item: StrokeItem, i: number) => {
    const e = strokeItems[i];
    if (!e || (e.mx === 0 && e.my === 0)) return undefined;
    return `translate(${e.mx}px, ${e.my}px)`;
  };

  // ---- step 01: contour analysis ---------------------------------------
  // the merged contour (outline base+inset) highlights in step-1 red
  const contour = outlines.map((o) => tintStroke(o, STEP_COLORS[0]));
  const contourOp = 0.55 * easeOutCubic(stepP[0]);

  // ---- step 02: contour extension --------------------------------------
  const extSegs = extensionSegments(ordered, 70);
  const extOp = easeOutCubic(stepP[1]);

  // ---- step 03: hidden-vertex inference -------------------------------
  // sample vertices: every 3rd point per stroke, capped for dot count
  const dots: [number, number][] = [];
  for (const s of ordered) {
    const p = s.points;
    const stride = Math.max(1, Math.floor(p.length / 14));
    for (let i = 0; i < p.length; i += stride) dots.push(p[i]);
  }
  const dotOp = easeOutCubic(stepP[2]);

  // history dimming: earlier step marks fade slightly once later steps land
  const hist = (p: number) => p * (1 - 0.35 * easeInOutCubic(stepP[3]));

  // ---- magnifier --------------------------------------------------------
  const lensOp = easeOutCubic(seg(t, STEP_T[2] - 0.2, STEP_T[2] + 0.6));
  const lensColor =
    activeStep >= 0 ? STEP_COLORS[Math.min(activeStep, 2)] : "#888888";
  const lx = LENS.x - LENS.px * LENS.zoom;
  const ly = LENS.y - LENS.py * LENS.zoom;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1080,
        height: 1080,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {/* original merged contour, always faintly present */}
      <StrokeField
        comp={comp}
        strokes={outlines}
        strokeOpacity={() => 0.28}
      />
      {/* step 01: contour analysis highlight */}
      {contourOp > 0.01 && (
        <StrokeField
          comp={comp}
          strokes={contour}
          strokeOpacity={() => hist(contourOp)}
        />
      )}
      {/* the 13 strokes: ghost until step 04 */}
      <StrokeField
        comp={comp}
        strokes={strokeItems.map((e) => e.item)}
        strokeOpacity={mainOpacity}
        strokeTransform={strokeTransform}
      />
      {/* step 02: extended contour lines */}
      {extOp > 0.01 && (
        <svg
          width={1080}
          height={1080}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {extSegs.map((s, i) => (
            <line
              key={i}
              x1={s[0]}
              y1={s[1]}
              x2={s[2]}
              y2={s[3]}
              stroke={STEP_COLORS[1]}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={hist(extOp) * 0.9}
            />
          ))}
        </svg>
      )}
      {/* step 03: inferred vertex dots */}
      {dotOp > 0.01 && (
        <svg
          width={1080}
          height={1080}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {dots.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={4}
              fill={STEP_COLORS[2]}
              opacity={hist(dotOp)}
            />
          ))}
        </svg>
      )}
      {/* magnifier lens (arrives with step 03, per SPEC step mapping) */}
      {lensOp > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: LENS.x - LENS.r,
            top: LENS.y - LENS.r,
            width: LENS.r * 2,
            height: LENS.r * 2,
            borderRadius: "50%",
            overflow: "hidden",
            border: `3px solid ${lensColor}`,
            boxShadow: "0 6px 30px rgba(0,0,0,0.45)",
            opacity: lensOp,
            background: "rgba(250,250,250,0.96)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 1080,
              height: 1080,
              transform: `translate(${lx}px, ${ly}px) scale(${LENS.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <StrokeField
              comp={comp}
              strokes={ordered.map((s, i) =>
                sep > 0.5
                  ? tintStroke(s, PALETTE[i % PALETTE.length])
                  : tintStroke(s, lensColor),
              )}
              strokeOpacity={() => 0.95}
            />
          </div>
          {/* lens crosshair */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 1,
              height: "100%",
              background: lensColor,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              height: 1,
              width: "100%",
              background: lensColor,
              opacity: 0.5,
            }}
          />
        </div>
      )}
    </div>
  );
};
