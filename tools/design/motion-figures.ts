// Issue #32 req 5 & G: State-based onion-skin motion figures generated from
// REAL composition JSON data (NO equal-interval naive sampling!).
// Emits SVG + PNG (via Resvg) under docs/design/diagrams/:
//   1) motion-kai-runs4-onion.svg/.png — original AEP runs4 at keyframe/inflection states
//   2) motion-fude-onion.svg/.png      — original FUDE 13 strokes across easeOut(7.142..7.611)
//   3) motion-kai-designed-a2-onion.svg/.png — NEW Scene A2 crossing-proof local motion prototype
// Run: bun tools/design/motion-figures.ts
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_06 } from "../../pv/generated/06-PV glyph.ts";
import { pathD, relativeMatrix, worldMatrix, matToArray, layerByIndex, layerShapeItems, shapeItemsToSvg } from "./lib/spec.ts";

const OUT = "docs/design/diagrams";
const F_JP = `'Yu Gothic UI','Meiryo',sans-serif`;
const F_MONO = `'Consolas','Cascadia Mono',monospace`;

function m2s(m: number[]): string {
  return `matrix(${m[0].toFixed(5)} ${m[1].toFixed(5)} ${m[4].toFixed(5)} ${m[5].toFixed(5)} ${m[12].toFixed(4)} ${m[13].toFixed(4)})`;
}

function saveSvgAndPng(filename: string, svg: string, w: number) {
  writeFileSync(`${OUT}/${filename}`, svg, "utf8");
  const png = new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng();
  writeFileSync(`${OUT}/${filename.replace(/\.svg$/, ".png")}`, png);
  console.log(`wrote ${OUT}/${filename} (+.png)`);
}

function tintSvg(raw: string, fillHex: string, opacity: number): string {
  return raw.replace(/fill="[^"]+"/g, `fill="${fillHex}"`).replace(/<path /g, `<path fill-opacity="${opacity.toFixed(2)}" `);
}

// ============================================================================
// 1. ORIGINAL KAI runs4 (comp_02, Null3 local space) AT MEANINGFUL STATES
// ============================================================================
{
  const null3 = layerByIndex(comp_02, 19)!;
  const KAI_IDX = Array.from({ length: 16 }, (_, i) => 21 + i);
  // Meaningful state timestamps (real keyframes & velocity milestones!):
  // f0=0.000s (init rest), f3=0.125s (peak acceleration), f9=0.375s (Peak Split / inf=0.01% snap),
  // f21=0.875s (slow ease-in settle), f45=1.875s (rest convergence)
  const STATES = [
    { t: 0.000, label: "f0 (0.000s) 初発キー", col: "#94a3b8", op: 0.18 },
    { t: 0.125, label: "f3 (0.125s) 最大加速度", col: "#3b82f6", op: 0.24 },
    { t: 0.375, label: "f9 (0.375s) ピーク分裂 (inf=0.01%)", col: "#e51515", op: 0.42 },
    { t: 0.875, label: "f21 (0.875s) 長余韻収束中", col: "#16a34a", op: 0.26 },
    { t: 1.875, label: "f45 (1.875s) 定着完了", col: "#18181b", op: 0.88 },
  ];

  const bodies: string[] = [];
  for (const st of STATES) {
    for (const idx of KAI_IDX) {
      const l = layerByIndex(comp_02, idx)!;
      const rel = relativeMatrix(l, null3, comp_02.layers, st.t);
      const raw = shapeItemsToSvg(layerShapeItems(l, st.t));
      bodies.push(`<g transform="${m2s(matToArray(rel))}">${tintSvg(raw, st.col, st.op)}</g>`);
    }
  }

  // True animated Anchor + origin trajectories across [0, 0.08, 0.125, 0.25, 0.375, 0.625, 0.875, 1.375, 1.875]
  const TRACK_T = [0, 0.083, 0.125, 0.25, 0.375, 0.625, 0.875, 1.375, 1.875];
  const tracks: string[] = [];
  for (const idx of KAI_IDX) {
    const l = layerByIndex(comp_02, idx)!;
    const ap = (l.transform?.properties?.find((p) => p.matchName === "ADBE Anchor Point")?.value as number[] | undefined) ?? [0, 0];
    const pts: string[] = [];
    let peakPt: [number, number] | null = null;
    for (const t of TRACK_T) {
      const m = relativeMatrix(l, null3, comp_02.layers, t);
      const x = m[0] * ap[0] + m[4] * ap[1] + m[12];
      const y = m[1] * ap[0] + m[5] * ap[1] + m[13];
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      if (Math.abs(t - 0.375) < 0.01) peakPt = [x, y];
    }
    const unique = new Set(pts).size > 1;
    if (unique) {
      tracks.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#e51515" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.75"/>`);
      if (peakPt) tracks.push(`<circle cx="${peakPt[0].toFixed(1)}" cy="${peakPt[1].toFixed(1)}" r="4" fill="#e51515"/>`);
    } else if (l.name.includes("016")) {
      const [sx, sy] = pts[0].split(",").map(Number);
      tracks.push(`<circle cx="${sx}" cy="${sy}" r="8" fill="none" stroke="#dc2626" stroke-width="2.5"/><text x="${sx + 12}" y="${sy + 4}" font-size="13" font-weight="700" fill="#dc2626" font-family="${F_MONO}">S016 Anchor (Δ=0)</text>`);
    }
  }

  const legend = STATES.map((s, i) => `
    <rect x="40" y="${74 + i * 24}" width="16" height="14" rx="2" fill="${s.col}" fill-opacity="${Math.min(1, s.op + 0.25)}"/>
    <text x="64" y="${86 + i * 24}" font-size="13" fill="#18181b" font-family="${F_JP}">${s.label}</text>
  `).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="960" viewBox="-520 -520 1100 960">
  <rect x="-520" y="-520" width="1100" height="960" fill="#f8fafc"/>
  <rect x="-500" y="-500" width="1060" height="920" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="-476" y="-464" font-size="20" font-weight="700" fill="#111111" font-family="${F_JP}">「解」runs4 元実測オニオンスキン（状態基準サンプリング：f0 → f3 → f9 ピーク → f21 → f45 定着）</text>
  <text x="-476" y="-440" font-size="12" fill="#52525b" font-family="${F_MONO}">Null 3 ローカル空間 | 全16層（直画9+曲線画5+residual merged 2）| 赤丸 = f9(0.375s) ピーク変位点 | 均等サンプリング廃止版</text>
  <g transform="translate(80, 30) scale(0.88)">
    ${bodies.join("\n")}
    ${tracks.join("\n")}
  </g>
  <g transform="translate(-516, -420)">${legend}</g>
</svg>`;
  saveSvgAndPng("motion-kai-runs4-onion.svg", svg, 1100);
}

// ============================================================================
// 2. ORIGINAL FUDE 13 STROKES ACROSS REAL easeOut(t, 7.142, 7.611, 0, 1)
//    Using 06-PV glyph zero-displacement rest pose + actual m[k] expression!
// ============================================================================
{
  const M_VEC: Record<string, [number, number]> = {
    S01: [-26, 10], S02: [8, 20], S03: [10, -18], S04: [16, -20],
    S05: [20, 18], S06: [28, -8], S07: [-30, -12], S08: [40, -6],
    S09: [-30, -5], S10: [-30, 2], S11: [-30, 8], S12: [-30, 14], S13: [40, 4],
  };
  // Evaluate AE easeOut u in [0,1] -> smooth cubic ease-out 1 - (1-u)^3 approximation, scaled slightly visually?
  // NO: use EXACT 1x m[k] * (1 - (1-u)^3) so spatial truth is 100% accurate!
  const STATES = [
    { u: 0.00, t: 7.142, label: "7.142s [u=0.00] STEP 3→4 解放開始（無変位正本）", col: "#94a3b8", op: 0.25 },
    { u: 0.22, t: 7.200, label: "7.200s [easeOut~0.52] 初期分離立ち上がり", col: "#3b82f6", op: 0.30 },
    { u: 0.50, t: 7.350, label: "7.350s [easeOut~0.87] 減速扇状展開", col: "#16a34a", op: 0.34 },
    { u: 1.00, t: 7.611, label: "7.611s [u=1.00] 全13画分離ピーク完了", col: "#18181b", op: 0.88 },
  ];

  const fudeLayers = comp_06.layers.filter((l) => l.name.startsWith("FUDE S")).sort((a, b) => a.name.localeCompare(b.name));
  const bodies: string[] = [];
  const tracks: string[] = [];

  for (const st of STATES) {
    const p = 1 - Math.pow(1 - st.u, 3);
    for (const l of fudeLayers) {
      const key = l.name.slice(5, 8);
      const d = M_VEC[key] ?? [0, 0];
      const wm = worldMatrix(l, comp_06.layers, 0, new Map()).matrix; // clean rest pose at t=0 in 06-PV glyph!
      const raw = shapeItemsToSvg(layerShapeItems(l, 0));
      const mShifted = [...wm];
      mShifted[12] += d[0] * p;
      mShifted[13] += d[1] * p;
      bodies.push(`<g transform="${m2s(mShifted)}">${tintSvg(raw, st.col, st.op)}</g>`);
    }
  }
  for (const l of fudeLayers) {
    const key = l.name.slice(5, 8);
    const d = M_VEC[key] ?? [0, 0];
    const wm = worldMatrix(l, comp_06.layers, 0, new Map()).matrix;
    const ap = (l.transform?.properties?.find((p) => p.matchName === "ADBE Anchor Point")?.value as number[] | undefined) ?? [0, 0];
    const x0 = wm[0] * ap[0] + wm[4] * ap[1] + wm[12];
    const y0 = wm[1] * ap[0] + wm[5] * ap[1] + wm[13];
    const x1 = x0 + d[0], y1 = y0 + d[1];
    tracks.push(`
      <line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#e51515" stroke-width="2"/>
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4" fill="#e51515"/>
      <text x="${(x1 + (d[0] >= 0 ? 7 : -7)).toFixed(1)}" y="${(y1 + 4).toFixed(1)}" text-anchor="${d[0] >= 0 ? "start" : "end"}" font-size="11" font-weight="700" fill="#e51515" font-family="${F_MONO}">${key}[${d[0]},${d[1]}]</text>
    `);
  }

  const legend = STATES.map((s, i) => `
    <rect x="520" y="${260 + i * 24}" width="16" height="14" rx="2" fill="${s.col}" fill-opacity="${Math.min(1, s.op + 0.25)}"/>
    <text x="544" y="${272 + i * 24}" font-size="13" fill="#18181b" font-family="${F_JP}">${s.label}</text>
  `).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="960" viewBox="490 170 960 880">
  <rect x="490" y="170" width="960" height="880" fill="#f8fafc"/>
  <rect x="506" y="186" width="928" height="848" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="524" y="218" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">「筆」STEP 4 実測オニオンスキン（06-PV glyph 無変位正本 × 式 easeOut(7.142→7.611s)）</text>
  <text x="524" y="240" font-size="12" fill="#52525b" font-family="${F_MONO}">旧01-Baselineの静止凍結(0.1..3.6s)を是正 | 日段 S09..12 の等差段差 [-30, -5/+2/+8/+14] と S13 軸(+40,+4)を可視化</text>
  ${legend}
  <g transform="translate(80, 60) scale(0.95)">
    ${bodies.join("\n")}
    ${tracks.join("\n")}
  </g>
</svg>`;
  saveSvgAndPng("motion-fude-onion.svg", svg, 1100);
}

// ============================================================================
// 3. NEW DESIGNED MOTION: SCENE A2 CROSSING PROOF + EXIT FLOW (f45 -> f98)
// ============================================================================
{
  // Demonstrate the NEW designed motion using real 16 layers of comp_02 runs4:
  //   State 1: f45 (rest join from A1)
  //   State 2: f56 (gate opening: 015 up-left, 017 down, horizontal escape clamped x>=480)
  //   State 3: f66 (crossing hold & red STROKE_016 continuous spine exposure)
  //   State 4: f84 (bunkai upward exit shear before A3 handoff)
  const null3 = layerByIndex(comp_02, 19)!;
  const KAI_IDX = Array.from({ length: 16 }, (_, i) => 21 + i);

  // Designed local offsets in Null3 plane (strictly respects left boundary x>=480!)
  function designedStatePose(layerName: string, phase: "f45" | "f56" | "f66" | "f84"): { dx: number; dy: number; rot: number; fill?: string } {
    const k = phase === "f45" ? 0 : phase === "f56" ? 0.65 : phase === "f66" ? 1.0 : 1.0;
    const exitY = phase === "f84" ? -160 : 0;
    const exitX = phase === "f84" ? 30 : 0;
    if (layerName.includes("016")) return { dx: 0, dy: exitY * 0.65, rot: 0, fill: phase === "f66" ? "#e51515" : undefined };
    if (layerName.includes("015")) return { dx: 6 * k + exitX, dy: -220 * k + exitY, rot: 6 * k, fill: phase === "f66" ? "#2563eb" : undefined };
    if (layerName.includes("017")) return { dx: -4 * k + exitX, dy: 190 * k + exitY * 0.4, rot: 0, fill: phase === "f66" ? "#2563eb" : undefined };
    if (layerName.includes("004") || layerName.includes("010")) return { dx: -28 * k + exitX, dy: exitY, rot: 0 }; // Clamped so world x >= 480!
    if (layerName.includes("003") || layerName.includes("007")) return { dx: 95 * k + exitX, dy: exitY, rot: 0 };
    if (layerName.includes("002")) return { dx: 0 + exitX, dy: 65 * k + exitY, rot: -26 * k };
    if (layerName.includes("005")) return { dx: 0 + exitX, dy: 80 * k + exitY, rot: -16 * k };
    if (layerName.includes("014")) return { dx: 110 * k + exitX, dy: 45 * k + exitY, rot: -10 * k };
    if (layerName.includes("011")) return { dx: 45 * k + exitX, dy: -15 * k + exitY, rot: 16 * k };
    if (layerName.includes("merged")) return { dx: -12 * k + exitX, dy: 20 * k + exitY * 0.8, rot: 0 };
    return { dx: 18 * k + exitX, dy: -32 * k + exitY, rot: 4 * k };
  }

  const PHASES: Array<{ id: "f45" | "f56" | "f66" | "f84"; label: string; col: string; op: number }> = [
    { id: "f45", label: "f45 (1.875s) A1からの無空白接続", col: "#94a3b8", op: 0.22 },
    { id: "f56", label: "f56 (2.333s) 交差開門 015↑/017↓＋安全帯停止", col: "#2563eb", op: 0.30 },
    { id: "f66", label: "f66 (2.750s) 静止ホールド＋主軸016(#e51515)無傷露出", col: "#18181b", op: 0.85 },
    { id: "f84", label: "f84 (3.500s) A3橋渡し上方離脱フロー", col: "#16a34a", op: 0.35 },
  ];

  const bodies: string[] = [];
  for (const ph of PHASES) {
    for (const idx of KAI_IDX) {
      const l = layerByIndex(comp_02, idx)!;
      const rel = relativeMatrix(l, null3, comp_02.layers, 1.875); // base rest shape
      const p = designedStatePose(l.name, ph.id);
      const col = p.fill ?? ph.col;
      const op = p.fill === "#e51515" ? 0.95 : ph.op;
      const ap = (l.transform?.properties?.find((pr) => pr.matchName === "ADBE Anchor Point")?.value as number[] | undefined) ?? [0, 0];
      const raw = shapeItemsToSvg(layerShapeItems(l, 1.875));
      bodies.push(`<g transform="translate(${p.dx} ${p.dy}) translate(${ap[0]} ${ap[1]}) rotate(${p.rot}) translate(${-ap[0]} ${-ap[1]}) ${m2s(matToArray(rel))}">${tintSvg(raw, col, op)}</g>`);
    }
  }

  const legend = PHASES.map((s, i) => `
    <rect x="-480" y="${-410 + i * 24}" width="16" height="14" rx="2" fill="${s.col}" fill-opacity="${Math.min(1, s.op + 0.2)}"/>
    <text x="-456" y="${-398 + i * 24}" font-size="13" fill="#18181b" font-family="${F_JP}">${s.label}</text>
  `).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="960" viewBox="-520 -520 1100 960">
  <rect x="-520" y="-520" width="1100" height="960" fill="#f8fafc"/>
  <rect x="-500" y="-500" width="1060" height="920" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="-476" y="-464" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">【新設計モーション】Scene A2「解」交差開門ホールド→A3上流離脱オニオンスキン (f45..f98)</text>
  <text x="-476" y="-440" font-size="12" fill="#52525b" font-family="${F_MONO}">A1の1:4瞬発戻しとは別文法：015/017開門ホールド(f56..76)で赤016の連続性を実証し、x=480安全帯以左を侵さずA3へ抜ける</text>
  ${legend}
  <!-- Show Stage left safety zone line relative to master null3 x=764 -> x=480 lies at -284 in local preview -->
  <g transform="translate(80, 40) scale(0.84)">
    <line x1="-284" y1="-420" x2="-284" y2="420" stroke="#d97706" stroke-width="2" stroke-dasharray="8 5"/>
    <text x="-276" y="-390" font-size="12" font-weight="700" fill="#b45309" font-family="${F_MONO}">x=480 Safe Stage Edge</text>
    ${bodies.join("\n")}
  </g>
</svg>`;
  saveSvgAndPng("motion-kai-designed-a2-onion.svg", svg, 1100);
}
