// Brand verification comp — original kg_LayoutGrid-driven brand layout
// (Phase B of the scene-structure rebuild on Issue #19).
//
// Grid: the master comp's kg_LayoutGrid effect parameters, verified by
// direct property-tree dump (Adjustment Layer 5):
//   12 columns x 24 rows, margin L/R 32, T/B 80, gutter 12/12.
//   -> cell 73.67 x 26.83px; grid lines x32..1048 step 85.67,
//      y80..1000 step 38.83. See tests/grid-original.test.ts.
//
// The original brand elements are NOT neat cell occupants — they are
// oversized comps anchored on grid intersections and cropped by the
// frame (declared via allowBleed). Decoded from the legacy master dumps
// (P-null rig: anchor[50,50] scale12% -> world = parentPos + 0.12*(child
// - 50)) and confirmed by toComp measurement:
//
//   element      anchor world pos      grid point        display size
//   Heading      (32, 740) -> +155     col0 x row17      3466x550  (833%)
//   Logo         (32, 429) -> -155     col0 x row9       3466x2166 (833%)
//   description  top-left (32, 585)    col0 x row13      416x298   (100%)
//   Ae.png       anchor BL ~(32, 391)  col0 x row8       792x772   (330%)
//
// Drift is anchor-relative: heading-drift / logo-drift nulls sit on grid
// intersections; key values are comp-space OFFSETS (+155 / -155, same
// times and ease speeds as legacy P 9 / P 5). A grid change re-places
// the base AND the whole trajectory.
//
// PLUGIN ("AFTER EFFECTS\rPLUGIN", MeiryoUI ~861%/745% near grid
// col6-7 x row3) is intentionally NOT a layer yet: its TextDocument
// dump is a separate material-extraction task. Its placement rule is
// recorded in docs as region "zone-plugin" below.
//
// Z-order (front-to-back), matching the original backdrop role:
//   stage > description > Heading > Icon(Ae) > Logo > bg-white
//
// Build: bun tools/build-jsx.ts --spec pv/scenes/brandcheck.ts \
//          --out dist/brandcheck.jsx --save .tmp/probe/brandcheck.aep

import { compileProduction } from "../production/compile.ts";
import type { CompProduction, ProductionProject } from "../production/model.ts";
import { ITEM_LABEL_WORK } from "../production/theme.ts";
import type { KeySpec, ProjectSpec } from "../spec/types.ts";
import { materialCompsByName, materialItemLabels, materialKeepSet } from "./production.ts";

const FRAME = {
  width: 1080,
  height: 1080,
  pixelAspect: 1,
  frameRate: 24,
  duration: 20,
  // Comp background; the visible white ground is the bg-white layer below.
  bgColor: [1, 1, 1],
};

// ---- drift keys -------------------------------------------------------------
// Original counter-phase move as comp-space offsets: Heading +155px down,
// Logo -155px up. Key times/eases verbatim from the legacy P 9 / P 5 dump
// (3.875->4.5 move, 15.5->16.1667 return; ease speeds +/-248 / -/+232.5).

function driftKeys(direction: 1 | -1): KeySpec[] {
  const amp = 155 * direction;
  const mk = (t: number, y: number, outSpeed: number): KeySpec => ({
    t,
    v: { x: 0, y, z: 0 },
    inT: 6612,
    outT: 6612,
    inEase: [{ influence: 16.666666667, speed: 0 }],
    outEase: [{ influence: 16.666666667, speed: outSpeed }],
  });
  return [
    mk(3.875, 0, direction * 248),
    mk(4.5, amp, 0),
    mk(15.5, amp, direction * -232.5),
    mk(16.1666666666667, 0, 0),
  ];
}

// ---- comp --------------------------------------------------------------------

const comp: CompProduction = {
  id: "brand-check",
  name: "brand-check",
  label: ITEM_LABEL_WORK,
  // kg_LayoutGrid verified parameters (Adjustment Layer 5 dump).
  grid: { columns: 12, rows: 24, margin: { x: 32, y: 80 }, gutter: { x: 12, y: 12 } },
  regions: {
    // Right ~55% content stage (original scene comps occupy this area).
    stage: { span: [5, 0, 11, 23] },
    // Brand rail: material comps are 416px wide -> cols 0-4 (428px).
    "zone-copy": { span: [0, 13, 4, 21] }, // description top-left @ row13
    // Single-cell spans below resolve to exact grid intersections —
    // the original anchor positions sit ON grid lines, not inside cells.
    "anchor-heading": { span: [0, 17, 0, 17] }, // (32, ~740)
    "anchor-logo": { span: [0, 9, 0, 9] }, // (32, ~429)
    "anchor-icon": { span: [0, 8, 0, 8] }, // (32, ~391) bottom-left
    // PLUGIN text placement rule (layer deferred — see header):
    // original ~(554,202) -> cols 6-7 x rows 3-5.
    "zone-plugin": { span: [6, 3, 8, 5] },
  },
  anchors: [
    {
      id: "heading-drift",
      layout: { region: "anchor-heading", align: "top-left" },
      keys: driftKeys(1),
    },
    {
      id: "logo-drift",
      layout: { region: "anchor-logo", align: "top-left" },
      keys: driftKeys(-1),
    },
  ],
  // Front-to-back like the original: scene content on top, brand stack
  // as backdrop, the white ground last.
  sections: [
    {
      id: "stage",
      role: "stage",
      layers: [
        {
          id: "main-panel",
          name: "Main (stage)",
          content: { kind: "footage", asset: "main-panel" },
          layout: { region: "stage", align: "center" },
          metrics: { width: 588, height: 920, anchor: { x: 294, y: 460 } },
        },
      ],
    },
    {
      id: "brand",
      role: "brand",
      layers: [
        {
          id: "description",
          name: "description",
          content: { kind: "material-comp", comp: "description" },
          layout: { region: "zone-copy", align: "top-left" },
          // Original top-left (32,585) == grid point (col0,row13).
          // Content bbox measured from material renders (fills comp).
          metrics: {
            width: 416,
            height: 298,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 416, height: 298 },
          },
          // description renders above Heading in the original (idx 10
          // vs 15); their rects overlap y740-883 like the master.
          allowOverlap: {
            reason: "description overlays the heading brush band, as in master",
            with: ["Heading"],
          },
        },
        {
          id: "heading",
          name: "Heading",
          content: { kind: "material-comp", comp: "Heading" },
          layout: { region: "anchor-heading", align: "top-left" },
          parent: "heading-drift",
          // Verbatim original: 416x66 comp, anchor [0,0], scale 833.333%.
          // Alpha bbox: glyphs occupy x0-329 of the 416px comp.
          metrics: {
            width: 416,
            height: 66,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 329, height: 66 },
            scale: 8.333333333333,
          },
          // 3466x550 display rect anchored at (32,740) — mostly off-frame
          // by design, exactly like the master crop. +155 drift extends
          // the bleed further; both are the original behavior.
          allowBleed: "833% brand brush comp cropped by frame, as in master",
          allowOverlap: {
            reason: "heading band renders below stage panel, as backdrop",
            with: ["Main (stage)"],
          },
        },
        {
          id: "icon",
          name: "Icon (Ae)",
          content: { kind: "footage", asset: "ae-icon" },
          layout: { region: "anchor-icon", align: "bottom-left" },
          // Original: 240x234 PNG at 330%, anchor bottom-left, visible
          // band y0-~368. Bottom-left of cell (0,8) ~= (32,391).
          metrics: {
            width: 240,
            height: 234,
            anchor: { x: 0, y: 234 },
            bounds: { x: 0, y: 0, width: 240, height: 234 },
            scale: 3.3,
          },
          allowBleed: "330% icon extends above frame top, as in master",
          allowOverlap: {
            reason: "icon top band overlaps stage region edge; renders below scene",
            with: ["Main (stage)"],
          },
        },
        {
          id: "logo",
          name: "Logo",
          content: { kind: "material-comp", comp: "Logo" },
          layout: { region: "anchor-logo", align: "top-left" },
          parent: "logo-drift",
          // Verbatim original: 416x260 comp, anchor [0,0], scale 833.333%.
          metrics: {
            width: 416,
            height: 260,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 416, height: 260 },
            scale: 8.333333333333,
          },
          // 3466x2166 backdrop anchored at (32,429) — the master crops it
          // to the left ~2/3 of frame; -155 drift lifts it further.
          allowBleed: "833% logo backdrop cropped right/bottom, as in master",
          // Deepest backdrop: sits under every other layer by design.
          allowOverlap: {
            reason: "giant logo brush backdrop renders under all content",
            with: ["*"],
          },
        },
      ],
    },
    {
      id: "background",
      role: "guide",
      layers: [
        {
          id: "bg-white",
          name: "bg-white",
          content: { kind: "footage", asset: "bg-white" },
          // Real rendered layer (not just comp bgColor) so the ground is
          // part of the authored structure and survives bgColor changes.
          layout: { rect: { x: 0, y: 0, width: 1080, height: 1080 } },
          metrics: { width: 1080, height: 1080, anchor: { x: 540, y: 540 } },
          allowOverlap: {
            reason: "full-frame ground sits under every layer",
            with: ["*"],
          },
        },
      ],
    },
  ],
};

const project: ProductionProject = {
  name: "restro-pv-brandcheck",
  frame: FRAME,
  comps: [comp],
  assets: [
    {
      id: "main-panel",
      kind: "solid",
      name: "Main panel",
      color: [0.93, 0.93, 0.93],
      width: 588,
      height: 920,
    },
    {
      id: "bg-white",
      kind: "solid",
      name: "White Ground",
      color: [1, 1, 1],
      width: 1080,
      height: 1080,
    },
    {
      id: "ae-icon",
      kind: "file",
      name: "Ae.png",
      file: "assets/images/Ae.png",
    },
  ],
  materialAep: "legacy/pv-2dc99e1.aep",
};

export function brandCheckSpec(): ProjectSpec {
  const spec = compileProduction(project, { materialComps: materialCompsByName() });
  spec.itemLabels = materialItemLabels();
  spec.pruneMaterial = materialKeepSet(spec);
  return spec;
}

export function buildSpec(): ProjectSpec {
  return brandCheckSpec();
}

/** Authored project (exported so tests can inspect grid/region wiring). */
export { project as brandCheckProject };
