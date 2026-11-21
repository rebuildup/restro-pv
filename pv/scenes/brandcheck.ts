// Brand verification comp — original kg_LayoutGrid-driven brand layout
// (Phase B of the scene-structure rebuild on Issue #19).
//
// Grid: the master comp's kg_LayoutGrid effect parameters, verified by
// direct property-tree dump (Adjustment Layer 5):
//   12 columns x 24 rows, margin L/R 32, T/B 80, gutter 12/12.
//   -> cell 73.67 x 26.83px; grid lines x32..1048 step 85.67,
//      y80..1000 step 38.83. See tests/grid-original.test.ts.
//
// EFFECTIVE TRANSFORMS — the critical correction: the legacy brand
// elements are NOT giant crops. Their 833%/330% leaf scales sit under
// 12% P-null rig parents, so the composed world scale is ~100%/39.6%.
// This comp authors the FLATTENED effective transform (layout anchor +
// metrics.scale = world scale); the parent-chain math lives in
// pv/production/transform.ts and is shared by compile + layoutCheck.
// Original chains (pv/generated/05-master.ts):
//
//   Heading  P 9(12%,anchor50,pos26/734+155drift) → P-33(100%) → Heading(833.33%)
//            world anchor (32,740), world scale ~1.0
//   Logo     P 5(12%,anchor50,pos26/423-155drift) → Logo(833.33%)
//            world anchor (32,429), world scale ~1.0
//   Ae.png   P 3(12%,pos26,268) → P-11(100%,anchor0,100) → Ae.png(330%)
//            world anchor (32,262), world scale 0.396
//   description: no parent, pos (32,585) — a grid intersection itself
//
// Drift is anchor-relative: heading-drift / logo-drift nulls sit on grid
// intersections; key values are comp-space OFFSETS (+155 / -155, same
// times and ease speeds as legacy P 9 / P 5). A grid change re-places
// the base AND the whole trajectory.
//
// PLUGIN ("AFTER EFFECTS\rPLUGIN", MeiryoUI, effective ~103%x89% text at
// world anchor ~(448,196) = col~4.9 x row3) is intentionally NOT a
// layer yet: its TextDocument is a separate material-extraction task.
// Its placement rule is recorded as region "zone-plugin" below.
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
// The rig parents translate 1:1 in comp space, so world amplitude = 155px.

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
    // Single-cell spans below resolve to grid intersections — the
    // original Heading/Logo/description anchors sit ON grid lines.
    "anchor-heading": { span: [0, 17, 0, 17] }, // (32, ~740)
    "anchor-logo": { span: [0, 9, 0, 9] }, // (32, ~429)
    // Ae.png's original rig (P 3, pos [26,268]) was NOT grid-derived;
    // its anchor lands ~12px above the row5 line — preserved via offset.
    "anchor-icon": { span: [0, 5, 0, 5] }, // (32, ~274) + offset -> (32,262)
    // PLUGIN text placement rule (layer deferred — see header):
    // original world anchor ~(448,196) -> between col4/5 x row3.
    "zone-plugin": { span: [5, 3, 7, 5] },
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
  // as backdrop, the white ground last. The stage section is disabled
  // for this brand-only verification comp (placeholder would occlude).
  sections: [
    {
      id: "stage",
      role: "stage",
      enabled: false,
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
          // description renders above Heading/Logo in the original
          // (master idx 10 vs 15/18); their rects overlap like the master.
          allowOverlap: {
            reason: "description overlays heading/logo band, as in master",
            with: ["Heading", "Logo"],
          },
        },
        {
          id: "heading",
          name: "Heading",
          content: { kind: "material-comp", comp: "Heading" },
          layout: { region: "anchor-heading", align: "top-left" },
          parent: "heading-drift",
          // Effective world transform: 0.12 rig x 833.333% leaf ~= 100%.
          // Alpha bbox: glyphs occupy x0-329 of the 416px comp.
          metrics: {
            width: 416,
            height: 66,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 329, height: 66 },
            scale: 1,
          },
        },
        {
          id: "icon",
          name: "Icon (Ae)",
          content: { kind: "footage", asset: "ae-icon" },
          layout: {
            region: "anchor-icon",
            align: "top-left",
            // Original P-3 rig placed the anchor ~12px above row5.
            offset: { x: 0, y: -12.2 },
          },
          // Effective world transform: 0.12 rig x 330% leaf = 39.6%.
          // Anchor [0,234] (bottom-left) lands at world (32,262), so the
          // 240x234 PNG displays as ~95x93 at (32,169)-(127,262).
          metrics: {
            width: 240,
            height: 234,
            anchor: { x: 0, y: 234 },
            bounds: { x: 0, y: 0, width: 240, height: 234 },
            scale: 0.396,
          },
        },
        {
          id: "logo",
          name: "Logo",
          content: { kind: "material-comp", comp: "Logo" },
          layout: { region: "anchor-logo", align: "top-left" },
          parent: "logo-drift",
          // Effective world transform: 0.12 rig x 833.333% leaf ~= 100%.
          metrics: {
            width: 416,
            height: 260,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 416, height: 260 },
            scale: 1,
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
  // Minimal material AEP: extracted once from legacy (only the comps this
  // spec references + their dependency closure). Regenerate by building
  // against legacy/pv-2dc99e1.aep and copying the saved project.
  materialAep: "materials/brand-materials.aep",
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
