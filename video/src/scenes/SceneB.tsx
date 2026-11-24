import React from "react";
import {
  compStrokes,
  StrokeField,
  clamp01,
  easeOutCubic,
  seg,
} from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";
import type { CompSpec, PropNode } from "../../../pv/model/types.ts";

// Scene B [3.9, 7.96) per SPEC §5 B, rebuilt against the beat references
// (verification/beats, real AEP output):
//   - ONE large 筆 stays fixed on the right, cropped by the frame edge.
//   - Each processing step applies its own color filter to the whole
//     character — red (輪郭を解析) -> green (輪郭線を延長) -> blue (隠れた
//     頂点を推定) -> yellow (一画ずつに分割). This is the "step filter"
//     the beats show; the dumped STEP1-4 draft comps carry only fill-color
//     variants of the same glyph and cannot render under the interpreter
//     (FUDE opacity is expression/mask driven), so the character is
//     re-rendered here from the real Baseline stroke paths.
//   - Right column: four step labels; the active step reads "中", finished
//     steps read "した". Tab backgrounds and step borders stay dumped.
//   - Bottom: circular lens magnifying a stroke junction of the same
//     character (the dumped Lens magnifier comp shows the same strokes
//     through its draft children, which cannot render).

const T0 = 3.9;
const T1 = 7.96;
const STEP_T = [4.25, 5.15, 6.05, 6.95];
const STEP_COLORS = ["#D64520", "#2FA36B", "#2F6FED", "#E8A52F"];
const STEP_LABELS = [
  "輪郭を解析",
  "輪郭線を延長",
  "隠れた頂点を推定",
  "一画ずつに分割",
];

// dumped step-label anchor positions (master layers 169-166)
const LABEL_POS = [
  [560, 220],
  [560, 258],
  [560, 297],
  [560, 336],
] as const;

// lens: center/radius on screen, comp-space focal point, zoom
const LENS = { x: 690, y: 800, r: 104, zoom: 2.4, px: 950, py: 620 };

// Fit the measured stroke bbox into the beats layout: tall glyph on the
// right, right edge cropped past the frame, vertical center near 545.
function glyphFit(strokes: StrokeItem[]): { tx: number; ty: number; s: number } {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const h = maxY - minY || 1;
  const s = 800 / h;
  const tx = 1150 - maxX * s;
  const ty = 545 - (minY + maxY) / 2 * s;
  return { tx, ty, s };
}

function tintShapes(
  node: PropNode | undefined,
  rgb: [number, number, number],
): PropNode | undefined {
  if (!node) return node;
  const out: PropNode = { ...node };
  if (out.matchName === "ADBE Vector Fill Color" && "value" in out) {
    out.value = rgb;
  }
  if (out.properties) {
    out.properties = out.properties.map(
      (p) => tintShapes(p, rgb) ?? p,
    ) as PropNode[];
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

let cached: {
  comp: CompSpec;
  strokes: StrokeItem[];
  tinted: StrokeItem[][];
} | null = null;

function glyphData() {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  const tinted = STEP_COLORS.map((c) => {
    const rgb = hexToRgb(c);
    return strokes.map((s) => ({
      ...s,
      layer: {
        ...s.layer,
        shapes: tintShapes(s.layer.shapes, rgb) as PropNode,
      },
    }));
  });
  cached = { comp, strokes, tinted };
  return cached;
}

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, tinted } = glyphData();
  if (!tinted[0]?.length) return null;

  const appear = easeOutCubic(seg(t, T0 + 0.05, T0 + 0.5));
  const step = Math.max(
    0,
    STEP_T.reduce((acc, st, i) => (t >= st ? i : acc), 0),
  );
  // color crossfade into each step's filter color
  const prev = step > 0 ? STEP_T[step - 1] : T0;
  const colorMix = easeOutCubic(clamp01((t - prev) / 0.35));

  // pick tinted set for current step; blend handled by opacity of two fields
  const cur = tinted[step];
  const prv = step > 0 ? tinted[step - 1] : tinted[0];
  const fit = glyphFit(tinted[0]);
  const tf = `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.s})`;

  // all four step items list from the start of B; state tracks progress
  const labelStates = STEP_T.map((st, i) => {
    const active = t >= st && (i === 3 || t < STEP_T[i + 1]);
    const done = t >= st + 0.95 || i < step;
    return { active, done };
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* character: previous step color fading into current step color */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: appear,
          transform: tf,
          transformOrigin: "0 0",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: 1 - colorMix }}>
          <StrokeField comp={comp} strokes={prv} poseT={0.5} />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: colorMix }}>
          <StrokeField comp={comp} strokes={cur} poseT={0.5} />
        </div>
      </div>

      {/* step labels: active reads 中, completed reads した */}
      {labelStates.map((s, i) => {
        const [x, y] = LABEL_POS[i];
        const future = i > step && !s.active;
        const state = s.active && !s.done ? "中" : s.done ? "した" : "";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - 14,
              fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              fontSize: 30,
              fontWeight: 700,
              color: s.active ? "#111" : future ? "#b5b5b5" : "#555",
              whiteSpace: "nowrap",
            }}
          >
            {String(i + 1).padStart(2, "0")} {STEP_LABELS[i]}
            {state ? ` ${state}` : ""}
          </div>
        );
      })}

      {/* lens: circular magnifier over a stroke junction */}
      {t >= STEP_T[1] && (
        <div
          style={{
            position: "absolute",
            left: LENS.x - LENS.r,
            top: LENS.y - LENS.r,
            width: LENS.r * 2,
            height: LENS.r * 2,
            borderRadius: "50%",
            overflow: "hidden",
            border: "5px solid #111",
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            background: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: comp.width,
              height: comp.height,
              // comp-space -> lens-local: focal comp point lands on the
              // circle center, magnified by zoom on top of the glyph fit.
              transform: `translate(${LENS.r - (LENS.px * fit.s + fit.tx) * LENS.zoom}px, ${LENS.r - (LENS.py * fit.s + fit.ty) * LENS.zoom}px) scale(${fit.s * LENS.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <StrokeField comp={comp} strokes={cur} poseT={0.5} />
          </div>
        </div>
      )}
    </div>
  );
};
