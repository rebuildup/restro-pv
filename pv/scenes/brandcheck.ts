// Brand verification comp — grid-driven layout of the brand block
// (Step 2 layout-system work on Issue #19).
//
// Goal changed vs Step 2-B: this comp no longer reproduces the legacy
// master's absolute coordinates. It establishes the production layout
// system — a GridSpec + named regions + anchor-relative motion — and
// places Heading / Description / Logo / Main from those rules, keeping
// the original composition's characteristics (left brand rail, stacked
// brand elements, counter-phase drift, white ground, 1080x1080@24fps).
//
// Composition read from the original master (verified renders + dumps):
//   - left ~40% column carries the brand stack, bottom-weighted
//   - Logo sits above Description/Heading; description overlays lower area
//   - scene content occupies the right ~60% ("Main" stage)
//   - brand drift: Heading moves down / Logo moves up during 4.5-15.5s
//
// Grid: 12x12 cells, margin 48, gutter 16 -> cell pitch 83.33px.
//   rail  cols 0-4  (~417px) — brand column, matches material width 416
//   stage cols 5-11 (~583px) — main content area
//   rows 0-2 reserved for the app icon slot (Ae.png — deferred, its
//   source is repo-local assets/images/Ae.png and lands in a later step)
//
// Motion is anchor-relative: two shy null anchors sit on their layout
// zones; key values are Vec3 OFFSETS from the grid-derived base, so a
// grid change re-places both the rest position and the whole trajectory.
//
// Build: bun tools/build-jsx.ts --spec pv/scenes/brandcheck.ts \
//          --out dist/brandcheck.jsx --save .tmp/probe/brandcheck.aep

import { compileProduction } from "../production/compile.ts";
import type {
  CompProduction,
  ProductionProject,
  SectionLayerSpec,
} from "../production/model.ts";
import { ITEM_LABEL_WORK } from "../production/theme.ts";
import type { KeySpec, ProjectSpec } from "../spec/types.ts";
import { materialCompsByName, materialItemLabels, materialKeepSet } from "./production.ts";

const FRAME = {
  width: 1080,
  height: 1080,
  pixelAspect: 1,
  frameRate: 24,
  duration: 20,
  // White ground like the original master's "White Solid 1" layer.
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
  grid: { columns: 12, rows: 12, margin: { x: 48, y: 48 }, gutter: { x: 16, y: 16 } },
  regions: {
    stage: { span: [5, 0, 11, 11] },
    // Brand rail zones, top->bottom. Rows 0-2 stay empty for the icon slot.
    "zone-logo": { span: [0, 3, 4, 6] },
    "zone-copy": { span: [0, 7, 4, 10] },
    "zone-heading": { span: [0, 11, 4, 11] },
  },
  anchors: [
    {
      id: "heading-drift",
      layout: { region: "zone-heading", align: "top-left" },
      keys: driftKeys(1),
    },
    {
      id: "logo-drift",
      layout: { region: "zone-logo", align: "top" },
      keys: driftKeys(-1),
    },
  ],
  sections: [
    {
      id: "brand",
      role: "brand",
      // Front-to-back like the original: description over heading over logo.
      layers: [
        {
          id: "description",
          name: "description",
          content: { kind: "material-comp", comp: "description" },
          layout: { region: "zone-copy", align: "top-left" },
          metrics: { width: 416, height: 298, anchor: { x: 0, y: 0 } },
        },
        {
          id: "heading",
          name: "Heading",
          content: { kind: "material-comp", comp: "Heading" },
          layout: { region: "zone-heading", align: "top-left" },
          metrics: { width: 416, height: 66, anchor: { x: 0, y: 0 } },
          parent: "heading-drift",
        },
        {
          id: "logo",
          name: "Logo",
          content: { kind: "material-comp", comp: "Logo" },
          layout: { region: "zone-logo", align: "center" },
          metrics: { width: 416, height: 260, anchor: { x: 208, y: 130 } },
          parent: "logo-drift",
        },
      ],
    },
    {
      id: "stage",
      role: "stage",
      layers: [
        {
          id: "main-panel",
          name: "Main (stage)",
          content: { kind: "footage", asset: "main-panel" },
          layout: { region: "stage", align: "center" },
        },
      ],
    },
  ],
};

const project: ProductionProject = {
  name: "restro-pv-brandcheck",
  frame: FRAME,
  comps: [comp],
  // Neutral placeholder standing in for the scene content that will fill
  // the stage region in later steps; sized to the stage region (~583x928).
  assets: [
    {
      id: "main-panel",
      kind: "solid",
      name: "Main panel",
      color: [0.93, 0.93, 0.93],
      width: 560,
      height: 880,
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
