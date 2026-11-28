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
  SCENE_A2,
  SCENE_B_DESIGN,
  createA2Choreo,
  evalFudeStep4ReleaseU,
} from "../../video/src/design/choreography.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

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
// 3. SCENE A2 PRODUCTION CHOREOGRAPHY — same createA2Choreo path as
//    SceneA2.tsx / verify-local-motion / render-scene-a2-prototype.
//    Screen-space onion skin of the REAL hero motion v2: entry frame ->
//    simultaneous jolt attack -> long settle -> bleed giant-hold (crossing
//    trio residual kept) -> fade. comp space == screen space.
// ============================================================================
{
  const { strokes } = compStrokes(SCENE_A2.compName, {
    indices: SCENE_A2.layerIndexRange,
    poseT: SCENE_A2.poseT,
  });
  const geoms = strokes.map((s) => ({
    name: s.name,
    bbox: s.bbox as [number, number, number, number],
    center: s.center as [number, number],
    points: s.points as Array<[number, number]>,
  }));
  const choreo = createA2Choreo(geoms);

  const frameOf = (rel: number) => Math.round((SCENE_A2.t0 + rel) * 24);
  const PHASES: Array<{ rel: number; label: string; col: string; op: number }> = [
    { rel: 0.0, label: `f${frameOf(0)} A1からの接続・エントリー構図`, col: "#94a3b8", op: 0.20 },
    { rel: 0.45, label: `f${frameOf(0.45)} 一斉ジョルト・ピーク分裂`, col: "#3b82f6", op: 0.30 },
    { rel: 1.6, label: `f${frameOf(1.6)} ブリード・ホールド（交差残差保持）`, col: "#18181b", op: 0.85 },
    { rel: 2.2, label: `f${frameOf(2.2)} シーンフェードアウト`, col: "#16a34a", op: 0.25 },
  ];

  const bodies: string[] = [];
  for (const ph of PHASES) {
    const field = choreo.fieldAt(ph.rel);
    for (const g of geoms) {
      const sp = g.points.map((p) => choreo.toScreen(choreo.strokePoint(g.name, p, ph.rel), field));
      const isVert = g.name === SCENE_A2.vertName;
      const col = isVert && ph.rel >= 1.5 ? "#e51515" : ph.col;
      const op = isVert && ph.rel >= 1.5 ? Math.min(0.95, ph.op + 0.1) : ph.op * field.opacity + 0.05;
      bodies.push(
        `<polygon points="${sp.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="${col}" fill-opacity="${op.toFixed(2)}"/>`,
      );
    }
  }

  // Trajectory of stroke centroids across the jolt (screen space)
  const SAMPLE_RELS = [0, 0.45, 0.9, 1.3, 1.6];
  const trajSvg: string[] = [];
  for (const keyName of ["STROKE_015_runs4", "STROKE_017_runs4", "STROKE_016_runs4", "STROKE_004_runs4"]) {
    const g = geoms.find((x) => x.name === keyName);
    if (!g) continue;
    const pts = SAMPLE_RELS.map((rel) => {
      const field = choreo.fieldAt(rel);
      const cp = choreo.strokePoint(g.name, g.center, rel);
      return choreo.toScreen(cp, field);
    });
    trajSvg.push(
      `<polyline points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="4 3"/>`,
    );
  }

  // Crossing points + hold union bbox annotation (screen space at hold)
  const holdField = choreo.fieldAt(1.6);
  const crossScreen = SCENE_A2.crossings.map((c) => choreo.toScreen(c, holdField));
  const holdBoxes = geoms.map((g) => {
    const sp = g.points.map((p) => choreo.toScreen(choreo.strokePoint(g.name, p, 1.6), holdField));
    const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
  });
  const union = holdBoxes.reduce(
    (u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] as const,
    [1e9, 1e9, -1e9, -1e9] as const,
  );

  const legend = PHASES.map((s, i) => `
    <rect x="20" y="${20 + i * 24}" width="16" height="14" rx="2" fill="${s.col}" fill-opacity="${Math.min(1, s.op + 0.2)}"/>
    <text x="44" y="${33 + i * 24}" font-size="13" fill="#18181b" font-family="${F_JP}">${s.label}</text>
  `).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="1140" viewBox="0 0 1140 1140">
  <rect width="1140" height="1140" fill="#f8fafc"/>
  <rect x="20" y="20" width="1100" height="1100" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="40" y="64" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">Scene A2 実制作振付オニオンスキン（createA2Choreo 直結・画面空間）</text>
  <text x="40" y="86" font-size="12" fill="#52525b" font-family="${F_MONO}">compStrokes(master) + fieldTransform + strokePoint(jolt&amp;settle) — SceneA2.tsx / verify / prototype と同一経路</text>
  ${legend}
  <!-- screen frame + left clip boundary -->
  <rect x="40" y="130" width="1080" height="1080" fill="none" stroke="#a1a1aa" stroke-dasharray="6 4"/>
  <line x1="500" y1="130" x2="500" y2="1210" stroke="#d97706" stroke-width="2" stroke-dasharray="8 5"/>
  <text x="508" y="150" font-size="12" font-weight="700" fill="#b45309" font-family="${F_MONO}">x=460 clip (left column guard)</text>
  <g transform="translate(40,130)">
    ${bodies.join("\n")}
    ${trajSvg.join("\n")}
    <!-- hold union bbox + crossing points -->
    <rect x="${union[0].toFixed(1)}" y="${union[1].toFixed(1)}" width="${(union[2] - union[0]).toFixed(1)}" height="${(union[3] - union[1]).toFixed(1)}" fill="none" stroke="#0891b2" stroke-width="2" stroke-dasharray="6 4"/>
    ${crossScreen.map(([cx, cy]) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="none" stroke="#dc2626" stroke-width="3"/>`).join("\n")}
  </g>
</svg>`;
  saveSvgAndPng("motion-kai-designed-a2-onion.svg", svg, 1140);
}
void readFileSync;
