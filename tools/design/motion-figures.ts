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
import { GridRef, MASTER_GRID, buildSceneBAccordionRig } from "../../video/src/design/rig.ts";

const B_GRID = new GridRef(MASTER_GRID);

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

// ============================================================================
// 4. SCENE C WORKS — the three gallery pieces' REAL stroke sources.
//    Same compStrokes geometry path SceneC.tsx consumes; shows each work's
//    rest-pose polygons, measured char bbox, per-stroke centroids, and the
//    source provenance (comp / layer pattern / poseT) so the figure proves
//    the works differ in content, not only finish.
// ============================================================================
{
  // keep in sync with video/src/scenes/SceneC.tsx WORK_SOURCES
  const SOURCES: {
    comp: string;
    pattern?: RegExp;
    indices?: [number, number];
    poseT: number;
    title: string;
    sub: string;
    mode: string;
    col: string;
  }[] = [
    { comp: "PV glyph", pattern: /^FUDE S\d+/, poseT: 2, title: "作例01 墨帖", sub: "06-PV glyph / FUDE S01..S13", mode: "書き順ドローオン・印", col: "#18181b" },
    { comp: "bunkai", indices: [21, 36] as [number, number], poseT: 3, title: "作例02 深解", sub: "02-bunkai / runs4 group idx21-36 (16層・別分解)", mode: "3層深度パララックス・暗部", col: "#8b93a8" },
    { comp: "Logo", pattern: /(STROKE|Ae_Restro)/, poseT: 1, title: "作例03 紋章", sub: "46-Logo / 公式ロックアップ45層", mode: "構築スイープ・左右から合体", col: "#1d1d20" },
  ];
  const PANEL_W = 330;
  const bodies: string[] = [];
  SOURCES.forEach((src, w) => {
    const { strokes } = compStrokes(src.comp, {
      pattern: src.pattern,
      indices: src.indices,
      poseT: src.poseT,
    });
    const px = 40 + w * (PANEL_W + 20);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const s of strokes)
      for (const [x, y] of s.points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    // normalize: fit char bbox into ~260x300 box centered in the panel
    const s = Math.min(260 / Math.max(1, maxX - minX), 300 / Math.max(1, maxY - minY));
    const tx = px + PANEL_W / 2 - ((minX + maxX) / 2) * s;
    const ty = 210 + 160 - ((minY + maxY) / 2) * s;
    const panelStrokes = strokes
      .map((s2) => `<polygon points="${s2.points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="${src.col}" fill-opacity="0.82"/>`)
      .join("\n");
    const dots = strokes
      .map((s2) => `<circle cx="${(s2.center[0] * s + tx).toFixed(1)}" cy="${(s2.center[1] * s + ty).toFixed(1)}" r="3.5" fill="#e51515"/>`)
      .join("");
    bodies.push(`
      <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${s.toFixed(4)})">${panelStrokes}</g>
      ${dots}
      <text x="${px + PANEL_W / 2}" y="70" text-anchor="middle" font-size="20" font-weight="700" fill="#111111" font-family="${F_JP}">${src.title}</text>
      <text x="${px + PANEL_W / 2}" y="94" text-anchor="middle" font-size="11" fill="#52525b" font-family="${F_MONO}">${src.sub}</text>
      <text x="${px + PANEL_W / 2}" y="114" text-anchor="middle" font-size="12" fill="#b45309" font-family="${F_JP}">${src.mode}</text>
      <text x="${px + PANEL_W / 2}" y="560" text-anchor="middle" font-size="12" fill="#52525b" font-family="${F_MONO}">${strokes.length} strokes | poseT=${src.poseT} | char ${Math.round(maxX - minX)}×${Math.round(maxY - minY)}px</text>
    `);
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="640" viewBox="0 0 1140 640">
  <rect width="1140" height="640" fill="#f8fafc"/>
  <rect x="20" y="20" width="1100" height="600" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="40" y="56" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">Scene C 3作例 — 実ストロークソース比較（compStrokes rest pose・正規化表示）</text>
  <text x="40" y="76" font-size="12" fill="#52525b" font-family="${F_MONO}">SceneC.tsx WORK_SOURCES と同一データ | 赤点 = 各筆画重心 | 3作例は内容（分解・文字）が異なる</text>
  ${bodies.join("\n")}
</svg>`;
  saveSvgAndPng("motion-scene-c-works.svg", svg, 1140);
}

// ============================================================================
// 5. SCENE B ACCORDION — the recovered AEP structure as an evaluated rig.
//    Four panels (S1..S4) render buildSceneBAccordionRig node worldRects:
//    stage band, per-step tabs (top stack vs bottom waiting stack), the
//    660px active slot, and the 140->420px (300%) lens chain. Geometry comes
//    from the same rig verify-local-motion.ts checks — not hand-drawn.
// ============================================================================
{
  const PW = 252; // panel width
  const PH = 400; // panel height
  const GX = 31; // horizontal gap: 4*252 + 3*31 = 1101
  const OX = 40; const OY = 140;
  const COMP = { x0: 520, y0: 170, w: 560, h: 820 }; // covers x520-1080, y170-990
  const panels: string[] = [];
  const labels = ["S1 輪郭を解析", "S2 輪郭線を延長", "S3 隠れた頂点を推定", "S4 一画ずつに分割"];
  for (let s = 0; s < 4; s++) {
    const rig = buildSceneBAccordionRig(B_GRID, { activeStep: s });
    const sc = Math.min(PW / COMP.w, PH / COMP.h);
    const px = OX + s * (PW + GX);
    const py = OY;
    const map = (x: number, y: number) => [px + (x - COMP.x0) * sc, py + (y - COMP.y0) * sc] as const;
    const rect = (r: { x: number; y: number; w: number; h: number }, fill: string, stroke = "#3f3f46", dash = "") => {
      const [ax, ay] = map(r.x, r.y);
      return `<rect x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${(r.w * sc).toFixed(1)}" height="${(r.h * sc).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    };
    const parts: string[] = [];
    const stage = rig.nodes.get("bStage")!.worldRect!;
    parts.push(rect(stage, "#fafafa", "#a1a1aa"));
    // tabs: top-stack (k<=s) vs bottom-stack
    for (let k = 0; k < 4; k++) {
      const r = rig.nodes.get(`stepTab_${k}`)!.worldRect!;
      const inTop = k <= s;
      parts.push(rect(r, inTop ? "#dbeafe" : "#fef3c7", inTop ? "#2563eb" : "#d97706"));
      const [tx, ty] = map(r.x + 6, r.y + r.h / 2);
      parts.push(`<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" font-size="9" fill="#18181b" font-family="${F_MONO}">STEP${k + 1}</text>`);
    }
    const slot = rig.nodes.get("bActiveSlot")!.worldRect!;
    parts.push(rect(slot, "rgba(37,99,235,0.10)", "#2563eb", "5 3"));
    const content = rig.nodes.get("bActiveContent")!.worldRect!;
    parts.push(rect(content, "rgba(37,99,235,0.05)", "none"));
    // lens chain: display circle (420) + source circle (140) + focal cross
    const lensD = rig.nodes.get("lensDisplay")!.worldRect!;
    const [lx, ly] = map(lensD.x + lensD.w / 2, lensD.y + lensD.h / 2);
    const lr = (lensD.w / 2) * sc;
    parts.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${lr.toFixed(1)}" fill="rgba(214,69,32,0.06)" stroke="#D64520" stroke-width="1.4"/>`);
    const focal = rig.nodes.get("lensDisplay")!.def.meta as { focalPoint?: [number, number] } | undefined;
    const fp = focal?.focalPoint ?? [757, 422];
    const [fx2, fy2] = map(fp[0], fp[1]);
    parts.push(`<circle cx="${fx2.toFixed(1)}" cy="${fy2.toFixed(1)}" r="${(70 * sc).toFixed(1)}" fill="none" stroke="#D64520" stroke-width="1" stroke-dasharray="3 3"/>`);
    const [sx2, sy2] = map(660 - 70, 810 - 70);
    parts.push(`<rect x="${sx2.toFixed(1)}" y="${sy2.toFixed(1)}" width="${(140 * sc).toFixed(1)}" height="${(140 * sc).toFixed(1)}" fill="none" stroke="#D64520" stroke-width="1"/>`);
    parts.push(`<text x="${(px + PW / 2).toFixed(1)}" y="${(py + PH + 14).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#111111" font-family="${F_JP}">${labels[s]}</text>`);
    parts.push(`<text x="${(px + PW / 2).toFixed(1)}" y="${(py + PH + 30).toFixed(1)}" text-anchor="middle" font-size="10" fill="#52525b" font-family="${F_MONO}">slotH=${rig.invariants.activeSlotHeight.toFixed(0)}px | lens ${rig.invariants.lensDisplayDiameter}/${rig.invariants.lensSourceDiameter}px = ${rig.invariants.lensDisplayDiameter / rig.invariants.lensSourceDiameter}x</text>`);
    panels.push(`<g>${parts.join("\n")}</g>`);
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="720" viewBox="0 0 1140 720">
  <rect width="1140" height="720" fill="#f8fafc"/>
  <rect x="20" y="20" width="1100" height="680" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
  <text x="40" y="56" font-size="19" font-weight="700" fill="#111111" font-family="${F_JP}">Scene B アコーディオン — buildSceneBAccordionRig 実評価（4状態・comp座標を縮尺表示）</text>
  <text x="40" y="76" font-size="12" fill="#52525b" font-family="${F_MONO}">青=上段スタック済タブ / 黄=下段待機タブ / 青破線=660px展開スロット / 赤=140→420px(300%)レンズ鎖（ソース円・焦点）</text>
  ${panels.join("\n")}
</svg>`;
  saveSvgAndPng("motion-scene-b-accordion.svg", svg, 1140);
}
void readFileSync;
