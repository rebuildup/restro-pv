// Brand verification comp — grid-driven layout of the brand block
// (Step 2 layout-system work on Issue #19).
//
// Goal: establish the production layout system — GridSpec + named regions
// + anchor-relative motion — and place Icon / Logo / Description / Heading
// / Main from those rules. Absolute coordinates appear nowhere; every
// placement is a region + align rule, and every motion is an offset key on
// a grid-anchored null.
//
// Composition read from the original master (verified renders + dumps):
//   - left ~40% column carries the brand stack, bottom-weighted
//   - Logo sits above Description/Heading; description overlays lower area
//   - scene content occupies the right ~60% ("Main" stage)
//   - brand drift: Heading moves down / Logo moves up during 4.5-15.5s
//
// Grid: 12x16 cells, margin 48, gutter 16 -> cell pitch ~83.3x62.5px.
//   rail  cols 0-4  (~417px) — brand column, matches material width 416
//   stage cols 5-11 (~567px) — main content area
//
// Vertical budget (the reason for 16 rows): the drift amplitudes are
// fixed at +/-155px, so each zone must leave that clearance INSIDE the
// frame at both rest and peak:
//   zone-icon    rows 0-2   y 48-235    Ae.png app icon (~70% scale)
//   zone-logo    rows 3-6   y 235-485   Logo 416x260, drifts UP 155
//   zone-copy    rows 7-11  y 485-798   description 416x298, static
//   zone-heading rows12-15  y 798-1032  Heading 416x66, drifts DOWN 155
//                                       -> peak bottom 1019.5 <= 1032
//
// Motion is anchor-relative: two shy null anchors sit on their layout
// zones; key values are Vec3 OFFSETS from the grid-derived base, so a
// grid change re-places both the rest position and the whole trajectory.
// pv/production/layoutCheck.ts verifies statically that rest AND swept
// (all key deltas) display rects stay inside the frame — the heading
// zone used to sit on the last row, which put its +155px drift off-screen.
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
// Original counter-phase move reproduced as comp-space offsets: Heading
// +155px down, Logo -155px up, same key times and ease speeds as the
// legacy P 9 / P 5 rig (the 12% rig compresses 155px of travel into its
// own units; in comp space the amplitude is simply 155px).

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
  grid: { columns: 12, rows: 16, margin: { x: 48, y: 48 }, gutter: { x: 16, y: 16 } },
  regions: {
    stage: { span: [5, 0, 11, 15] },
    // Brand rail zones, top->bottom (see header for the drift budget).
    "zone-icon": { span: [0, 0, 4, 2] },
    "zone-logo": { span: [0, 3, 4, 6] },
    "zone-copy": { span: [0, 7, 4, 11] },
    "zone-heading": { span: [0, 12, 4, 15] },
  },
  anchors: [
    {
      id: "heading-drift",
      layout: { region: "zone-heading", align: "top-left" },
      keys: driftKeys(1),
    },
    {
      id: "logo-drift",
      layout: { region: "zone-logo", align: "center" },
      keys: driftKeys(-1),
    },
  ],
  // Front-to-back like the original: scene content on top, the brand
  // stack as backdrop, the white ground last.
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
          metrics: { width: 567, height: 984, anchor: { x: 283.5, y: 492 } },
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
          // Content bbox measured from material renders (fills the comp).
          metrics: {
            width: 416,
            height: 298,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 416, height: 298 },
          },
        },
        {
          id: "heading",
          name: "Heading",
          content: { kind: "material-comp", comp: "Heading" },
          layout: { region: "zone-heading", align: "top-left" },
          // Alpha bbox: glyphs occupy x0-328 of the 416px comp.
          metrics: {
            width: 416,
            height: 66,
            anchor: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 329, height: 66 },
          },
          parent: "heading-drift",
        },
        {
          id: "logo",
          name: "Logo",
          content: { kind: "material-comp", comp: "Logo" },
          layout: { region: "zone-logo", align: "center" },
          metrics: {
            width: 416,
            height: 260,
            anchor: { x: 208, y: 130 },
            bounds: { x: 0, y: 0, width: 416, height: 260 },
          },
          parent: "logo-drift",
          // Backdrop like the original: its bottom edge tucks 5px under
          // the description zone; the description renders above it.
          allowOverlap: "backdrop edge tucks under description zone top",
        },
        {
          id: "icon",
          name: "Icon (Ae)",
          content: { kind: "footage", asset: "ae-icon" },
          layout: { region: "zone-icon", align: "center" },
          // 240x234 PNG at 70% -> 168x164 display, centered in the slot.
          metrics: {
            width: 240,
            height: 234,
            anchor: { x: 120, y: 117 },
            bounds: { x: 0, y: 0, width: 240, height: 234 },
            scale: 0.7,
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
          allowOverlap: "full-frame ground sits under every layer",
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
      width: 567,
      height: 984,
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
