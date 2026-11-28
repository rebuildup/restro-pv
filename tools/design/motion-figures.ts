// Issue #32 req 5 & G: State-based onion-skin motion figures generated from
// the SAME Single-Source-of-Truth design specs (choreography.ts + rig.ts)
// used by numerical verification and Remotion video prototypes.
// Run: bun tools/design/motion-figures.ts
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { comp_02 } from "../../pv/generated/02-bunkai.ts";
import { comp_06 } from "../../pv/generated/06-PV glyph.ts";
import { relativeMatrix, worldMatrix, matToArray, layerByIndex, layerShapeItems, shapeItemsToSvg } from "./lib/spec.ts";
import {
  SCENE_A2_DESIGN,
  SCENE_B_DESIGN,
  evalFudeStep4ReleaseU,
  evalSceneA2StrokePose,
} from "../../video/src/design/choreography.ts";
import { AE_DEFAULT_CAMERA, GridRef, cameraViewProjScreen } from "../../video/src/design/rig.ts";
import { transformPoint } from "../../video/src/ae/mat4.ts";

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
// 1. ORIGINAL KAI runs4 (comp_02, Null3 local space) AT KEYFRAME/INFLECTION STATES
// ============================================================================
{
  const null3 = layerByIndex(comp_02, 19)!;
  const KAI_IDX = Array.from({ length: 16 }, (_, i) => 21 + i);
  const STATES = [
    { t: 0.000, label: "f0 (0.000s) 初発キー", col: "#94a3b8", op: 0.18 },
    { t: 0.125, label: "f3 (0.125s) 最大加速度付近", col: "#3b82f6", op: 0.24 },
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
    if (new Set(pts).size > 1) {
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
  <text x="-476" y="-440" font-size="12" fill="#52525b" font-family="${F_MONO}">Null 3 ローカル空間 | 全16層（直画9+曲線画5+residual merged 2）| 赤丸 = f9(0.375s) ピーク変位点</text>
  <g transform="translate(80, 30) scale(0.88)">
    ${bodies.join("\n")}
    ${tracks.join("\n")}
  </g>
  <g transform="translate(-516, -420)">${legend}</g>
</svg>`;
  saveSvgAndPng("motion-kai-runs4-onion.svg", svg, 1100);
}

// ============================================================================
// 2. ORIGINAL FUDE 13 STROKES (06-PV glyph rest + SCENE_B_DESIGN easeOut window)
// ============================================================================
{
  const M_VEC: Record<string, [number, number]> = {
    S01: [-26, 10], S02: [8, 20], S03: [10, -18], S04: [16, -20],
    S05: [20, 18], S06: [28, -8], S07: [-30, -12], S08: [40, -6],
    S09: [-30, -5], S10: [-30, 2], S11: [-30, 8], S12: [-30, 14], S13: [40, 4],
  };
  const [t0, t1, t2, t3] = SCENE_B_DESIGN.fudeReleaseMilestones;
  const STATES = [
    { t: t0, label: `${t0.toFixed(3)}s [u=0.00] STEP 3→4 解放開始（無変位正本）`, col: "#94a3b8", op: 0.25 },
    { t: t1, label: `${t1.toFixed(3)}s [easeOut~0.52] 初期分離立ち上がり`, col: "#3b82f6", op: 0.30 },
    { t: t2, label: `${t2.toFixed(3)}s [easeOut~0.87] 減速扇状展開`, col: "#16a34a", op: 0.34 },
    { t: t3, label: `${t3.toFixed(3)}s [u=1.00] 全13画分離ピーク完了`, col: "#18181b", op: 0.88 },
  ];

  const fudeLayers = comp_06.layers.filter((l) => l.name.startsWith("FUDE S")).sort((a, b) => a.name.localeCompare(b.name));
  const bodies: string[] = [];
  const tracks: string[] = [];

  for (const st of STATES) {
    const p = evalFudeStep4ReleaseU(st.t);
    for (const l of fudeLayers) {
      const key = l.name.slice(5, 8);
      const d = M_VEC[key] ?? [0, 0];
      const wm = worldMatrix(l, comp_06.layers, 0, new Map()).matrix;
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
    const dyLabel = key === "S13" ? 16 : 4; // offset S13 label slightly clear of horizontal bar S10
    tracks.push(`
      <line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#e51515" stroke-width="2"/>
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4" fill="#e51515"/>
      <text x="${(x1 + (d[0] >= 0 ? 7 : -7)).toFixed(1)}" y="${(y1 + dyLabel).toFixed(1)}" text-anchor="${d[0] >= 0 ? "start" : "end"}" font-size="11" font-weight="700" fill="#e51515" font-family="${F_MONO}">${key}[${d[0]},${d[1]}]</text>
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
  <text x="524" y="218" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">「筆」STEP 4 設計同期オニオンスキン（SCENE_B_DESIGN × 06-PV glyph）</text>
  <text x="524" y="240" font-size="12" fill="#52525b" font-family="${F_MONO}">choreography.ts 単一データ直結 | S09..12 段差[-30, -5/+2/+8/+14] &amp; S13(+40,+4)</text>
  ${legend}
  <g transform="translate(80, 60) scale(0.95)">
    ${bodies.join("\n")}
    ${tracks.join("\n")}
  </g>
</svg>`;
  saveSvgAndPng("motion-fude-onion.svg", svg, 1100);
}

// ============================================================================
// 3. NEW DESIGNED SCENE A2: DRIVEN DIRECTLY BY SCENE_A2_DESIGN + GridRef
// ============================================================================
{
  const null3 = layerByIndex(comp_02, 19)!;
  const KAI_IDX = Array.from({ length: 16 }, (_, i) => 21 + i);
  const grid = new GridRef();
  const safeXInLocal = grid.safetyZone.stageMinX - 764; // master Null3 x=764 -> screen x=480 boundary

  const m = SCENE_A2_DESIGN.milestones;
  const PHASES: Array<{ frame: number; label: string; col: string; op: number }> = [
    { frame: m.entryFrame, label: `f${m.entryFrame} (1.875s) A1からの無空白接続`, col: "#94a3b8", op: 0.22 },
    { frame: m.openEndFrame, label: `f${m.openEndFrame} (2.333s) 交差開門完了・安全帯停止`, col: "#2563eb", op: 0.30 },
    { frame: m.holdMidFrame, label: `f${m.holdMidFrame} (2.750s) ホールド＋主軸016(#e51515)無傷露出`, col: "#18181b", op: 0.85 },
    { frame: m.exitSampleFrame, label: `f${m.exitSampleFrame} (3.500s) A3橋渡し上方離脱フロー`, col: "#16a34a", op: 0.35 },
  ];

  const bodies: string[] = [];
  const vp = cameraViewProjScreen(AE_DEFAULT_CAMERA);
  void vp;
  for (const ph of PHASES) {
    for (const idx of KAI_IDX) {
      const l = layerByIndex(comp_02, idx)!;
      const rel = relativeMatrix(l, null3, comp_02.layers, 1.875);
      const p = evalSceneA2StrokePose(l.name, ph.frame);
      const isHold = ph.frame === m.holdMidFrame;
      const col = isHold && (p.accent ?? 0) > 0.5 ? "#e51515" : isHold && /015|017/.test(l.name) ? "#2563eb" : ph.col;
      const op = isHold && (p.accent ?? 0) > 0.5 ? 0.96 : ph.op;
      const ap = (l.transform?.properties?.find((pr) => pr.matchName === "ADBE Anchor Point")?.value as number[] | undefined) ?? [0, 0];
      const raw = shapeItemsToSvg(layerShapeItems(l, 1.875));
      bodies.push(
        `<g transform="translate(${p.dx.toFixed(1)} ${p.dy.toFixed(1)}) translate(${ap[0]} ${ap[1]}) rotate(${p.rotDeg.toFixed(2)}) translate(${-ap[0]} ${-ap[1]}) ${m2s(matToArray(rel))}">${tintSvg(raw, col, op)}</g>`,
      );
    }
  }

  // Also plot trajectory arrows for key strokes across [f45, f50, f56, f66, f76, f84]
  const SAMPLE_F = [45, 50, 56, 66, 76, 84];
  const trajSvg: string[] = [];
  for (const keyName of ["STROKE_015_runs4", "STROKE_017_runs4", "STROKE_016_runs4", "STROKE_004_runs4"]) {
    const l = comp_02.layers.find((x) => x.name === keyName)!;
    const rel = relativeMatrix(l, null3, comp_02.layers, 1.875);
    const ap = (l.transform?.properties?.find((pr) => pr.matchName === "ADBE Anchor Point")?.value as number[] | undefined) ?? [0, 0];
    const ax0 = rel[0] * ap[0] + rel[4] * ap[1] + rel[12];
    const ay0 = rel[1] * ap[0] + rel[5] * ap[1] + rel[13];
    const pts = SAMPLE_F.map((f) => {
      const p = evalSceneA2StrokePose(keyName, f);
      return `${(ax0 + p.dx).toFixed(1)},${(ay0 + p.dy).toFixed(1)}`;
    });
    trajSvg.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="4 3"/>`);
  }

  const legend = PHASES.map((s, i) => `
    <rect x="-480" y="${-410 + i * 24}" width="16" height="14" rx="2" fill="${s.col}" fill-opacity="${Math.min(1, s.op + 0.2)}"/>
    <text x="-456" y="${-398 + i * 24}" font-size="13" fill="#18181b" font-family="${F_JP}">${s.label}</text>
  `).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="960" viewBox="-520 -520 1100 960">
  <rect x="-520" y="-520" width="1100" height="960" fill="#f8fafc"/>
  <rect x="-500" y="-500" width="1060" height="920" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="-476" y="-464" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">【設計データ同期版】Scene A2「解」交差開門ホールド→A3上流離脱 (f45..f84)</text>
  <text x="-476" y="-440" font-size="12" fill="#52525b" font-family="${F_MONO}">choreography.ts &amp; rig.ts から直接生成 | hold=f56..76 | x=${grid.safetyZone.stageMinX} 安全帯以左不侵</text>
  ${legend}
  <g transform="translate(80, 40) scale(0.84)">
    <line x1="${safeXInLocal}" y1="-420" x2="${safeXInLocal}" y2="420" stroke="#d97706" stroke-width="2" stroke-dasharray="8 5"/>
    <text x="${safeXInLocal + 8}" y="-395" font-size="12" font-weight="700" fill="#b45309" font-family="${F_MONO}">x=${grid.safetyZone.stageMinX} Safe Stage Edge</text>
    ${bodies.join("\n")}
    ${trajSvg.join("\n")}
  </g>
</svg>`;
  saveSvgAndPng("motion-kai-designed-a2-onion.svg", svg, 1100);
}
void readFileSync;
