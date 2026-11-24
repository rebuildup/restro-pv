import React from "react";
import {
  compStrokes,
  tintedStrokes,
  StrokeField,
  ContourField,
  strokeContours,
  strokeRings,
  clamp01,
  easeOutCubic,
  easeOutBack,
  seg,
} from "./glyph.tsx";
import type { StrokeItem, ContourPath } from "./glyph.tsx";
import type { CompSpec } from "../../../pv/model/types.ts";

// Scene B [3.9, 7.96) per SPEC §5 B. Every step now shows a REAL geometric
// addition derived from the dumped Restro output (Baseline comp), not a
// recolor of identical strokes:
//
//   step 0 輪郭を解析     — only the character contour: "FUDE outline base"
//                        (the outline Restro analyzed) as a solid silhouette
//                        + its bezier contour stroked on top.
//   step 1 輪郭線を延長   — the 13 decomposed stroke shells appear as draft
//                        contours (real stroke-boundary geometry) inside the
//                        now-translucent silhouette.
//   step 2 隠れた頂点を推定 — junction markers pop in at REAL stroke-outline
//                        crossing points computed from the stroke polygons
//                        (the observable equivalent of the solver's inferred
//                        vertices), and the lens magnifies that junction zone.
//   step 3 一画ずつに分割 — the strokes fill in staggered, each slightly
//                        displaced from the shared position and individually
//                        tinted, with one stroke selected; analysis layers
//                        recede to ghosts instead of being cut away.
//
// The lens (SPEC: belongs to 頂点を推定) magnifies the same layered scene at
// a focal point chosen among the measured crossings, positioned to avoid the
// step tabs (y197-336) and the left description column.

const T0 = 3.9;
const T1 = 7.96;
const STEP_T = [4.25, 5.15, 6.05, 6.95];
const LENS_IN = 6.0;
const STEP_LABELS = [
  "輪郭を解析",
  "輪郭線を延長",
  "隠れた頂点を推定",
  "一画ずつに分割",
];
const ANALYSIS_RED = "#D64520";
const DRAFT_GREEN = "#2FA36B";
const VERTEX_BLUE = "#2F6FED";

// dumped step-label anchor positions (master layers 169-166). Labels sit on
// the tab bars re-authored below (dumped geometry: white 502x26 bars at
// x546-1048, centers y = 211/249/288/327).
const LABEL_POS = [
  [560, 211],
  [560, 249],
  [560, 288],
  [560, 327],
] as const;
// lens: parked in the free strip under the glyph's bottom edge so it covers
// neither the step tabs, the left-column body text, nor the focal junction
// it magnifies; a thin dashed leader connects it to that junction. The
// focal comp point is the strongest measured junction cluster.
const LENS = { x: 700, y: 1024, r: 42, zoom: 2.6 };
const LENS_FOCAL_HINT: [number, number] = [975, 855];

// Fit the measured stroke bbox into the beats layout: the giant 筆 stays on
// the right with its top BELOW the step-tab strip (bars end at y≈340, labels
// ≈344) so labels never sit on the glyph; the right edge is intentionally
// cropped by the frame. Left edge stays at x≈478, clear of the left-column
// brand/description zone (CMN-1).
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
  // 575px glyph height keeps the right edge inside the frame even after the
  // step-4 outward displacement (right edge lands ~x1070, not cropped)
  const s = 575 / h;
  const tx = 478 - minX * s;
  // stroke top lands at y=404; the outline silhouette extends ~40px higher,
  // keeping ~20px clear of the step labels (which end at y≈344)
  const ty = 404 - minY * s;
  return { tx, ty, s };
}

// ---- junction detection -----------------------------------------------------
// Observable "inferred vertices": points where the outlines of two different
// decomposed strokes cross inside the glyph. Computed only from the real
// stroke polygons — this is geometry the solver actually produced, not an
// algorithm-internal claim.

function segInt(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): [number, number] | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (t < 0.001 || t > 0.999 || u < 0.001 || u > 0.999) return null;
  return [a[0] + t * rx, a[1] + t * ry];
}

interface Junction {
  x: number;
  y: number;
  n: number;
}

function computeJunctions(rings: [number, number][][][]): Junction[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      for (const ra of rings[i]) {
        const na = ra.length;
        for (const rb of rings[j]) {
          const nb = rb.length;
          for (let a = 0; a < na; a++) {
            const a0 = ra[a];
            const a1 = ra[(a + 1) % na];
            for (let b = 0; b < nb; b++) {
              const p = segInt(a0, a1, rb[b], rb[(b + 1) % nb]);
              if (p) pts.push({ x: p[0], y: p[1] });
            }
          }
        }
      }
    }
  }
  // cluster crossings (each stroke pair crosses twice -> enter/exit)
  const clusters: { x: number; y: number; n: number }[] = [];
  for (const p of pts) {
    let best = -1;
    let bd = 1e9;
    for (let c = 0; c < clusters.length; c++) {
      const d = Math.hypot(p.x - clusters[c].x, p.y - clusters[c].y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best >= 0 && bd < 14) {
      const c = clusters[best];
      c.x = (c.x * c.n + p.x) / (c.n + 1);
      c.y = (c.y * c.n + p.y) / (c.n + 1);
      c.n++;
    } else {
      clusters.push({ x: p.x, y: p.y, n: 1 });
    }
  }
  clusters.sort((a, b) => b.n - a.n);
  // keep a readable subset: strongest first, min separation so markers do
  // not pile up on the same crossing zone
  const picked: Junction[] = [];
  for (const c of clusters) {
    if (picked.length >= 5) break;
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 90)) {
      picked.push(c);
    }
  }
  return picked;
}

// ---- per-stroke step-4 presentation -----------------------------------------

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const STEP_RGB = [ANALYSIS_RED, DRAFT_GREEN, VERTEX_BLUE, "#E8A52F"].map(
  (h) => {
    const [r, g, b] = hexToRgb(h);
    return `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
  },
);

// stroke writing order = the S-number in the dumped layer name
function strokeOrderIndex(name: string): number {
  const m = /S(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : 99;
}

interface BData {
  comp: CompSpec;
  strokes: StrokeItem[];
  outline: StrokeItem;
  outlineRed: StrokeItem;
  strokeContours: ContourPath[][];
  outlineContours: ContourPath[];
  junctions: Junction[];
  lensFocal: [number, number];
  finalItems: StrokeItem[];
  edgeColors: string[]; // darker per-stroke edge tone matching finalItems
  selIndex: number;
  rankOf: number[]; // strokes[] index -> writing-order rank
  displace: [number, number][]; // strokes[] index -> comp-space offset at full reveal
  glyphCenter: [number, number];
  strokeBBox: [number, number, number, number]; // comp-space union of stroke points
}

let cached: BData | null = null;

function glyphData(): BData {
  if (cached) return cached;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  const outlineRes = compStrokes("Baseline", {
    pattern: /^FUDE outline base/,
    poseT: 0.5,
  });
  const outline = outlineRes.strokes[0];
  if (!outline) throw new Error("FUDE outline base not found");

  const contours = strokes.map((s) => strokeContours(comp, s));
  const outlineContours = strokeContours(comp, outline);
  const rings = strokes.map((s) => strokeRings(comp, s));
  const junctions = computeJunctions(rings);
  // lens focal: strongest junction in the LOWER half of the glyph so the
  // leader line from the bottom lens stays in the free strip under the
  // strokes instead of crossing the character body
  const jys = junctions.map((j) => j.y).sort((a, b) => a - b);
  const jMidY = jys.length ? jys[Math.floor(jys.length / 2)] : 0;
  const lower = junctions.filter((j) => j.y > jMidY);
  const pool = lower.length ? lower : junctions;
  const focalJ: Junction | undefined = pool[0]; // picked[] is n-sorted
  const lensFocalPt: [number, number] = focalJ
    ? [focalJ.x, focalJ.y]
    : LENS_FOCAL_HINT;

  // glyph centroid from stroke bbox centers
  let cx = 0;
  let cy = 0;
  for (const s of strokes) {
    cx += s.center[0];
    cy += s.center[1];
  }
  cx /= strokes.length;
  cy /= strokes.length;
  const glyphCenter: [number, number] = [cx, cy];

  // selected stroke: widest bbox (a long horizontal reads clearly)
  let selIndex = 0;
  let selW = -1;
  strokes.forEach((s, i) => {
    const w = s.bbox[2] - s.bbox[0];
    if (w > selW) {
      selW = w;
      selIndex = i;
    }
  });

  // writing-order rank per strokes[] index
  const order = strokes
    .map((s, i) => ({ i, k: strokeOrderIndex(s.name) }))
    .sort((a, b) => a.k - b.k);
  const rankOf = new Array(strokes.length).fill(0);
  order.forEach((o, r) => {
    rankOf[o.i] = r;
  });

  // outward displacement per stroke (comp units)
  const displace: [number, number][] = strokes.map((s, i) => {
    const dx = s.center[0] - glyphCenter[0];
    const dy = s.center[1] - glyphCenter[1];
    const d = Math.hypot(dx, dy) || 1;
    const dist = 5 + (rankOf[i] % 3) * 3;
    return [(dx / d) * dist, (dy / d) * dist];
  });

  // per-stroke yellow-family palette; selected stroke gets a brighter tint.
  // Wider hue/lightness spread + darker matching edge tone keep the 13
  // strokes distinguishable as strokes (not one yellow blob) at 1080p.
  const tintOf = (i: number): [number, number, number] => {
    if (i === selIndex) return hslToRgb(52, 0.95, 0.62); // bright selected yellow
    const hue = 47 + ((i * 37) % 11); // ~47..57, clear yellows not oranges
    const light = 0.53 + (((i * 11) % 5) - 2) * 0.02;
    return hslToRgb(hue, 0.8, light);
  };
  const finalItems = tintedStrokes(strokes, (_item, i) => tintOf(i));
  const edgeColors = strokes.map((_s, i) => {
    const [r, g, b] = tintOf(i);
    return `rgb(${Math.round(r * 100)},${Math.round(g * 100)},${Math.round(
      b * 100,
    )})`;
  });

  // union bbox of all stroke points (comp space) — bounds the step-4 stage
  // frame so it hugs the real reconstructed stroke set.
  let bbx0 = 1e9, bby0 = 1e9, bbx1 = -1e9, bby1 = -1e9;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      if (x < bbx0) bbx0 = x;
      if (x > bbx1) bbx1 = x;
      if (y < bby0) bby0 = y;
      if (y > bby1) bby1 = y;
    }
  }
  const strokeBBox: [number, number, number, number] = [bbx0, bby0, bbx1, bby1];

  // red-tinted silhouette clone for the outline fill
  const outlineRed = tintedStrokes([outline], () => {
    const n = parseInt(ANALYSIS_RED.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  })[0];

  cached = {
    comp,
    strokes,
    outline,
    outlineRed,
    strokeContours: contours,
    outlineContours,
    junctions,
    lensFocal: lensFocalPt,
    finalItems,
    edgeColors,
    selIndex,
    rankOf,
    displace,
    glyphCenter,
    strokeBBox,
  };
  return cached;
}

// per-step scalar blend: target values per step, eased over 0.3s after each
// step boundary
function stepBlend(t: number, vals: number[]): number {
  const step = Math.max(
    0,
    STEP_T.reduce((acc, st, i) => (t >= st ? i : acc), 0),
  );
  if (step === 0) return vals[0];
  const prev = STEP_T[step - 1];
  const p = easeOutCubic(clamp01((t - prev) / 0.3));
  return vals[step - 1] * (1 - p) + vals[step] * p;
}

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const d = glyphData();
  if (!d.strokes.length) return null;

  const appear = easeOutCubic(seg(t, T0 + 0.05, T0 + 0.5));
  const step = Math.max(
    0,
    STEP_T.reduce((acc, st, i) => (t >= st ? i : acc), 0),
  );
  const fit = glyphFit(d.strokes);
  const tf = `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.s})`;

  // ---- analysis layer visibility -------------------------------------------
  // Each analysis layer recedes as the NEXT step takes over, so frames never
  // stack every previous step's geometry at full strength.
  // Hard gate: the moment reconstruction (step4) begins, every analysis
  // layer — silhouette, drafts, junction markers, lens, leader — is gone.
  // The last step shows only the reconstructed strokes.
  const analysisGate = t < STEP_T[3] ? 1 : 0;
  // red analysis layer is exclusive to step0: it drops to a barely-there
  // ghost right after 輪郭を解析 so later steps read as their own filter
  const outlineFillOp = stepBlend(t, [0.92, 0.05, 0.02, 0]) * appear * analysisGate;
  const outlineContourOp = stepBlend(t, [0.95, 0.07, 0.03, 0]) * appear * analysisGate;

  // draft contours: staggered reveal in writing order at step1, hold as
  // context through early step2 (markers sit on them), then recede to a
  // faint ghost once the real strokes are reconstructed at step3.
  const draftHold =
    1 - 0.88 * easeOutCubic(clamp01((t - STEP_T[2]) / 0.45));
  // hard fade to zero once reconstruction starts — step4 must show only
  // the real strokes, no ghost analysis lines
  const draftClear =
    1 - easeOutCubic(clamp01((t - STEP_T[3]) / 0.35));
  const draftGlobal = draftHold * draftClear * analysisGate;
  const draftOp = (i: number) => {
    const r = d.rankOf[i];
    const p = easeOutCubic(
      clamp01((t - (STEP_T[1] + r * 0.04)) / 0.3),
    );
    return p * draftGlobal * appear;
  };

  // junction markers: pop in at step2, fade during step3
  const markerGlobal =
    (step < 3 ? 1 : 1 - easeOutCubic(clamp01((t - STEP_T[3]) / 0.3))) *
    analysisGate;
  const markerOp = (j: number) => {
    const p = easeOutCubic(
      clamp01((t - (STEP_T[2] + j * 0.05)) / 0.25),
    );
    return p * markerGlobal * appear;
  };

  // final strokes: staggered fill+separation at step3
  const strokeP = (i: number) =>
    easeOutCubic(clamp01((t - (STEP_T[3] + d.rankOf[i] * 0.025)) / 0.28));
  const finalOp = (i: number) => strokeP(i) * appear;
  const selOp = strokeP(d.selIndex) * appear;

  // all four step items list from the start of B; state tracks progress
  const labelStates = STEP_T.map((st, i) => {
    const active = t >= st && (i === 3 || t < STEP_T[i + 1]);
    const done = t >= st + 0.95 || i < step;
    return { active, done };
  });

  const lensPop = easeOutBack(clamp01((t - LENS_IN) / 0.18));
  // lens + leader belong to the vertex-estimation step only; they cut out
  // with the other analysis layers when reconstruction begins
  const showLens = t >= LENS_IN && t < STEP_T[3];
  // focal junction in screen space (same fit as the glyph layer)
  const focalSX = d.lensFocal[0] * fit.s + fit.tx;
  const focalSY = d.lensFocal[1] * fit.s + fit.ty;
  // leader line: from the lens rim to the focal point, so the magnifier is
  // anchored to a real junction instead of floating over empty space
  const leadDX = focalSX - LENS.x;
  const leadDY = focalSY - LENS.y;
  const leadLen = Math.hypot(leadDX, leadDY) || 1;
  const leadX0 = LENS.x + (leadDX / leadLen) * (LENS.r + 6);
  const leadY0 = LENS.y + (leadDY / leadLen) * (LENS.r + 6);

  // shared comp-space layer stack (main view and lens magnifier).
  // lensBoost>1 raises the faint analysis layers inside the magnifier so
  // the lens actually shows the contours the junctions were measured on.
  const glyphLayers = (lensBoost: number) => (
    <>
      {/* step0+: character silhouette (contour region) */}
      <StrokeField
        comp={d.comp}
        strokes={[d.outlineRed]}
        poseT={0.5}
        opacity={Math.min(1, outlineFillOp * lensBoost)}
      />
      <ContourField
        comp={d.comp}
        contours={[d.outlineContours]}
        color={ANALYSIS_RED}
        width={5}
        opacity={Math.min(1, outlineContourOp * lensBoost)}
      />
      {/* step1+: per-stroke draft contours */}
      <ContourField
        comp={d.comp}
        contours={d.strokeContours}
        color={DRAFT_GREEN}
        width={3.4}
        itemOpacity={(i) => Math.min(1, draftOp(i) * lensBoost)}
      />
      {/* step2+: junction markers at real stroke crossings */}
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {d.junctions.map((j, ji) => {
          const p = markerOp(ji);
          if (p <= 0) return null;
          const r = 8 + 5 * p;
          return (
            <g key={ji} opacity={p}>
              <circle
                cx={j.x}
                cy={j.y}
                r={r}
                fill="none"
                stroke={VERTEX_BLUE}
                strokeWidth={3.2}
              />
              <circle cx={j.x} cy={j.y} r={3} fill={VERTEX_BLUE} />
            </g>
          );
        })}
      </svg>
      {/* step3: separated strokes on the same character */}
      <StrokeField
        comp={d.comp}
        strokes={d.finalItems}
        poseT={0.5}
        strokeTransform={(item, i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
        strokeOpacity={(_item, i) => finalOp(i)}
      />
      {/* matching darker edge per stroke so the fills read as strokes, not
          flat rectangles; same reveal + displacement as the fills */}
      <ContourField
        comp={d.comp}
        contours={d.strokeContours}
        color="#4a3a12"
        width={2.6}
        itemColor={(i) => d.edgeColors[i]}
        itemOpacity={(i) => strokeP(i) * appear * 0.95}
        itemTransform={(i) => {
          const p = strokeP(i);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[i];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
      {/* selected stroke: dark contour + center dot mark it as the
          inspected one */}
      <ContourField
        comp={d.comp}
        contours={[d.strokeContours[d.selIndex]]}
        color="#111"
        width={4}
        opacity={selOp}
        itemTransform={() => {
          const p = strokeP(d.selIndex);
          if (p >= 1) return undefined;
          const [dx, dy] = d.displace[d.selIndex];
          return `translate(${dx * p}px, ${dy * p}px)`;
        }}
      />
      <svg
        width={d.comp.width}
        height={d.comp.height}
        viewBox={`0 0 ${d.comp.width} ${d.comp.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        <g
          opacity={selOp}
          transform={(() => {
            const p = strokeP(d.selIndex);
            if (p >= 1) return undefined;
            const [dx, dy] = d.displace[d.selIndex];
            return `translate(${dx * p}px, ${dy * p}px)`;
          })()}
        >
          <circle
            cx={d.strokes[d.selIndex].center[0]}
            cy={d.strokes[d.selIndex].center[1]}
            r={9}
            fill="#111"
          />
        </g>
      </svg>
    </>
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* character: same giant 筆, analysis layers accumulate per step */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1,
          transform: tf,
          transformOrigin: "0 0",
        }}
      >
        {glyphLayers(1)}
      </div>

      {/* step tabs: white bars revealed progressively (dumped geometry) */}
      {LABEL_POS.map(([x, cy], i) => {
        const revealed = t >= STEP_T[i];
        const p = easeOutCubic(clamp01((t - STEP_T[i]) / 0.25));
        const active = labelStates[i].active && !labelStates[i].done;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 14,
              top: cy - 13,
              width: 502,
              height: 26,
              borderRadius: 7,
              background: "#fff",
              border: "1.5px solid #111",
              opacity: revealed ? p * appear : 0,
              transform: `scaleX(${0.6 + 0.4 * p})`,
              transformOrigin: "left center",
            }}
          >
            {active && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 6,
                  background: `rgba(${STEP_RGB[i]},0.16)`,
                }}
              />
            )}
          </div>
        );
      })}

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
              top: y - 17,
              fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
              fontSize: 30,
              fontWeight: 700,
              color: s.active ? "#111" : future ? "#b5b5b5" : "#555",
              whiteSpace: "nowrap",
              textShadow: "0 0 5px #fff, 0 0 5px #fff",
              // WU-A r3: labels were fully opaque from t=3.9 even though the
              // whole scene fades in over 3.95-4.4 — during the A3 bridge
              // they floated over the incoming bunkai glyph. Gate with the
              // same `appear` envelope as glyph/tabs.
              opacity: appear,
            }}
          >
            {String(i + 1).padStart(2, "0")} {STEP_LABELS[i]}
            {state ? ` ${state}` : ""}
          </div>
        );
      })}

      {/* lens leader: thin line from lens rim to the focal junction */}
      {showLens && (
        <svg
          width={1080}
          height={1080}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        >
          <line
            x1={leadX0}
            y1={leadY0}
            x2={focalSX}
            y2={focalSY}
            stroke={VERTEX_BLUE}
            strokeWidth={2.5}
            strokeDasharray="7 6"
            opacity={0.75 * Math.min(1, lensPop)}
          />
          <circle
            cx={focalSX}
            cy={focalSY}
            r={7}
            fill="none"
            stroke={VERTEX_BLUE}
            strokeWidth={2.5}
            opacity={Math.min(1, lensPop)}
          />
        </svg>
      )}

      {/* lens: magnifies the junction zone where inferred vertices appear;
          parked in the empty bottom-left column — covers neither the tabs,
          the body text, nor the focal point itself */}
      {showLens && (
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
            opacity: Math.min(1, lensPop),
            transform: `scale(${0.85 + 0.15 * Math.min(1, lensPop)})`,
            transformOrigin: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: d.comp.width,
              height: d.comp.height,
              // comp-space -> lens-local: the focal comp point lands on the
              // circle center, magnified by zoom. Algebra: screen =
              // comp*s + t, so translate = r - focalComp*s*zoom (the fit
              // offsets cancel out).
              transform: `translate(${LENS.r - d.lensFocal[0] * fit.s * LENS.zoom}px, ${LENS.r - d.lensFocal[1] * fit.s * LENS.zoom}px) scale(${fit.s * LENS.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {glyphLayers(5)}
          </div>
        </div>
      )}
    </div>
  );
};
