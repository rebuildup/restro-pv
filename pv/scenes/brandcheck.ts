// Brand/grid verification comp — Step 2 of the scene-structure rebuild.
//
// A standalone 1080x1080@24fps comp that exercises the production model end
// to end WITHOUT the legacy master, scene C/D/E wrappers, brush rigs or
// full-length audio. Everything visible is placed from the comp's GridSpec /
// RegionSpec; the only absolute numbers in this file are grid parameters and
// content metrics (comp sizes, font sizes) — never legacy layer coordinates.
//
// Content provenance (meaning preserved, sources noted):
// - "Heading"      : material-comp "Heading" (real JP heading card, 416x66)
// - description    : authored text layers carrying the real copy/font/size
//                    extracted from the material "description" comp's header
//                    block (that comp also carries scene callouts + audio and
//                    is intentionally NOT imported whole)
// - Logo           : material-comp "Logo" (Restro brush logo, hard material)
// - Ae.png         : material-layer clone of the legacy badge footage
// - AE PLUGIN text : authored text with the exact dumped TextDocument +
//                    transform values (MeiryoUI, tracking 42, scale baked in)
//
// Anchors: exactly two nulls, one per semantic lockup group. Children are
// parented to them; their positions are comp-space targets minus the anchor
// position, computed here from the same grid — no AE layer indices anywhere.
//
// States captured in one AEP (duration 4s):
//   frame  0  normal display
//   frame 40  grid guide lines faded in (opacity keys at t=1.5-1.7s)
//   frame 60  brand anchor has moved (+72,-36 at t=1.8-2.2s); children follow
//
// Build: bun tools/build-jsx.ts --spec pv/scenes/brandcheck.ts \
//          --out dist/brandcheck.jsx --save .tmp/probe/brandcheck.aep \
//          --report .tmp/probe/brandcheck-report.json

import { compileProduction } from "../production/compile.ts";
import { createGrid, type Grid } from "../production/grid.ts";
import type {
  AnchorSpec,
  CompProduction,
  ProductionProject,
  RegionSpec,
  SectionLayerSpec,
  SectionSpec,
} from "../production/model.ts";
import { ITEM_LABEL_WORK } from "../production/theme.ts";
import type { LayerSpec, ProjectSpec, PropNode, Vec2, Vec3 } from "../spec/types.ts";
import { materialCompsByName, materialItemLabels, materialKeepSet } from "./production.ts";

// ---- frame / grid -------------------------------------------------------------

const FPS = 24;
const DURATION = 4;

// 12x12 grid, 64px outer margin, 16px gutters -> ~64.7px cells on 1080px.
// Sections reference cells/spans only; every pixel below derives from this.
const GRID = { columns: 12, rows: 12, margin: { x: 64, y: 64 }, gutter: { x: 16, y: 16 } };

const FRAME = {
  width: 1080,
  height: 1080,
  pixelAspect: 1,
  frameRate: FPS,
  duration: DURATION,
  // White ground: the brand copy is authored in black, matching the light
  // backing the legacy brand cluster sits on.
  bgColor: [1, 1, 1],
};

// Semantic regions. `top` = heading band, `brand` = left lockup column,
// `copy` = bottom-left copy block, `main` = right content stage. The
// upward-right trajectory of the full PV is a later step; `main` already
// occupies the right side so sections can be re-flowed without touching
// layer definitions.
const REGIONS: Record<string, RegionSpec> = {
  top: { span: [0, 0, 11, 1] },
  brand: { span: [0, 2, 5, 6] },
  copy: { span: [0, 8, 7, 11] },
  main: { span: [6, 1, 11, 8] },
};

// ---- small spec helpers ---------------------------------------------------------

const ZERO3: Vec3 = { x: 0, y: 0, z: 0 };

function transformOf(position: Vec3, opacityKeys?: PropNode["keys"]): PropNode {
  const props: PropNode[] = [
    {
      name: "Anchor Point",
      matchName: "ADBE Anchor Point",
      type: 6212,
      numKeys: 0,
      value: [0, 0, 0],
    },
    {
      name: "Position",
      matchName: "ADBE Position",
      type: 6212,
      numKeys: 0,
      value: [position.x, position.y, position.z],
    },
    { name: "Scale", matchName: "ADBE Scale", type: 6212, numKeys: 0, value: [100, 100, 100] },
    { name: "Rotation", matchName: "ADBE Rotate Z", type: 6212, numKeys: 0, value: 0 },
    opacityKeys
      ? {
          name: "Opacity",
          matchName: "ADBE Opacity",
          type: 6212,
          numKeys: opacityKeys.length,
          keys: opacityKeys,
        }
      : { name: "Opacity", matchName: "ADBE Opacity", type: 6212, numKeys: 0, value: 100 },
  ];
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    type: 6213,
    active: true,
    enabled: true,
    propertyIndex: 6,
    numProperties: props.length,
    properties: props,
  };
}

function vectorGroup(children: PropNode[]): PropNode {
  return {
    name: "Group 1",
    matchName: "ADBE Vector Group",
    properties: [{ name: "Contents", matchName: "ADBE Vectors Group", properties: children }],
  };
}

function rootShapes(group: PropNode): PropNode {
  return {
    name: "Contents",
    matchName: "ADBE Root Vectors Group",
    properties: [group],
  };
}

function strokeProps(width: number, color: number[]): PropNode[] {
  return [
    { name: "Color", matchName: "ADBE Vector Stroke Color", value: color },
    { name: "Width", matchName: "ADBE Vector Stroke Width", value: width },
  ];
}

/** One straight guide line: local path from (0,0) to (len,0) along its axis. */
function guideLine(opts: {
  name: string;
  horizontal: boolean;
  at: number; // comp-space x (vertical line) or y (horizontal line)
  from: number;
  to: number;
  opacityKeys?: PropNode["keys"];
}): LayerSpec {
  const len = opts.to - opts.from;
  const vertices: Array<[number, number]> = opts.horizontal
    ? [
        [0, 0],
        [len, 0],
      ]
    : [
        [0, 0],
        [0, len],
      ];
  const zero: Array<[number, number]> = [
    [0, 0],
    [0, 0],
  ];
  const position: Vec3 = opts.horizontal
    ? { x: opts.from, y: opts.at, z: 0 }
    : { x: opts.at, y: opts.from, z: 0 };
  return {
    index: 0,
    name: opts.name,
    kind: "shape",
    transform: transformOf(position, opts.opacityKeys),
    shapes: rootShapes(
      vectorGroup([
        {
          name: opts.horizontal ? "Path H" : "Path V",
          matchName: "ADBE Vector Shape - Group",
          properties: [
            {
              name: "Path",
              matchName: "ADBE Vector Shape",
              value: { vertices, inTangents: zero, outTangents: zero, closed: false },
            },
          ],
        },
        {
          name: "Stroke 1",
          matchName: "ADBE Vector Graphic - Stroke",
          properties: strokeProps(2, [0.85, 0.1, 0.1]),
        },
      ]),
    ),
  };
}

// ---- text helpers ---------------------------------------------------------------

interface TextOpts {
  text: string;
  font: string;
  fontSize: number;
  fillColor?: number[];
  tracking?: number;
  leading?: number;
  justification?: string;
}

function textLayer(name: string, o: TextOpts): LayerSpec {
  return {
    index: 0,
    name,
    kind: "text",
    text: {
      name: "Text",
      matchName: "ADBE Text Properties",
      properties: [
        {
          name: "Source Text",
          matchName: "ADBE Text Document",
          value: {
            text: o.text,
            font: o.font,
            fontSize: o.fontSize,
            fillColor: o.fillColor ?? [0, 0, 0],
            applyFill: true,
            applyStroke: false,
            ...(o.tracking !== undefined ? { tracking: o.tracking } : {}),
            ...(o.leading !== undefined ? { leading: o.leading } : {}),
            ...(o.justification ? { justification: o.justification } : {}),
          },
        },
      ],
    },
  };
}

// ---- grid-derived geometry -------------------------------------------------------

const grid: Grid = createGrid(GRID, FRAME);
const regionRect = (key: string) => {
  const r = REGIONS[key];
  if (!r) throw new Error(`unknown region "${key}"`);
  return "rect" in r ? r.rect : grid.span(r.span);
};

// All layer/anchor placement below uses layout.region + align + offset:
// the compiler resolves comp-space targets against the grid at compile
// time and converts them to parent-local positions for anchored children.
// Offsets are intra-region nudges in px, not legacy coordinates.

// brand-origin keyframes: drift up-right (+72,-36) between t=1.8 and t=2.2.
// With a layout base, key values are OFFSETS from the region-derived point.
const BRAND_ANCHOR_KEYS = [
  { t: 0, v: { x: 0, y: 0, z: 0 } },
  { t: 1.8, v: { x: 0, y: 0, z: 0 } },
  { t: 2.2, v: { x: 72, y: -36, z: 0 } },
  { t: DURATION, v: { x: 72, y: -36, z: 0 } },
];

// Grid guide lines fade in at t=1.5-1.7 so frame ~40 shows the grid while
// the anchors are still at their rest positions.
const GUIDE_OPACITY_KEYS = [
  { t: 0, v: 0 },
  { t: 1.5, v: 0 },
  { t: 1.7, v: 65 },
  { t: DURATION, v: 65 },
];

// ---- section layer specs ----------------------------------------------------------

const headingLayer: SectionLayerSpec = {
  id: "heading",
  name: "Heading",
  content: { kind: "material-comp", comp: "Heading" },
  // Heading comp is 416x66; anchor = its center so `position` = center point.
  metrics: { width: 416, height: 66, anchor: { x: 208, y: 33 } },
  layout: { region: "top", align: "top-left", offset: { x: 209, y: 80 } },
  parent: "copy-origin",
};

const descriptionLayers: SectionLayerSpec[] = [
  {
    id: "copy-eyebrow",
    name: "HOW IT WORKS",
    content: {
      kind: "spec",
      layer: textLayer("HOW IT WORKS", {
        text: "HOW IT WORKS",
        font: "KozGoPr6N-Bold",
        fontSize: 13,
        tracking: 60,
        justification: "LEFT_JUSTIFY",
      }),
    },
    layout: { region: "copy", align: "top-left", offset: { x: 0, y: 16 } },
    parent: "copy-origin",
  },
  {
    id: "copy-heading",
    name: "つながった輪郭から一画ずつの形を復元する",
    content: {
      kind: "spec",
      layer: textLayer("つながった輪郭から、\r一画ずつの形を復元する", {
        text: "つながった輪郭から、\r一画ずつの形を復元する",
        font: "KozGoPr6N-Bold",
        fontSize: 30,
        leading: 40,
        justification: "LEFT_JUSTIFY",
      }),
    },
    layout: { region: "copy", align: "top-left", offset: { x: 0, y: 56 } },
    parent: "copy-origin",
  },
  {
    id: "copy-body",
    name: "Restro description body",
    content: {
      kind: "spec",
      layer: textLayer("Restro description body", {
        text: "線が交わると、文字の輪郭はひとつにつながる。\rRestroは輪郭を延長し、隠れた頂点と\r反対側の辺まで推定して、筆画を分け直す。",
        font: "KozGoPr6N-Regular",
        fontSize: 15,
        leading: 24,
        justification: "LEFT_JUSTIFY",
      }),
    },
    layout: { region: "copy", align: "top-left", offset: { x: 0, y: 160 } },
    parent: "copy-origin",
  },
  {
    id: "copy-en",
    name: "Hidden vertices and edges are inferred to rebuild each stroke.",
    content: {
      kind: "spec",
      layer: textLayer("Hidden vertices and edges are inferred to rebuild each stroke.", {
        text: "Hidden vertices and edges are inferred to rebuild each stroke.",
        font: "KozGoPr6N-Regular",
        fontSize: 13,
        leading: 18,
        justification: "LEFT_JUSTIFY",
      }),
    },
    layout: { region: "copy", align: "top-left", offset: { x: 0, y: 236 } },
    parent: "copy-origin",
  },
];

// Brand cluster inside the `brand` region: Logo top, AE badge + plugin
// wordmark below. All parented to "brand-origin" so the keyed anchor move
// carries the whole lockup. align "top" = region top-center; offsets are
// px nudges inside the region.
const brandLayers: SectionLayerSpec[] = [
  {
    id: "logo",
    name: "Logo",
    content: { kind: "material-comp", comp: "Logo" },
    metrics: { width: 416, height: 260, anchor: { x: 208, y: 130 } },
    layout: { region: "brand", align: "top", offset: { x: 0, y: 120 } },
    parent: "brand-origin",
  },
  {
    id: "ae-badge",
    name: "Ae.png",
    // Clone of the legacy badge layer: keeps its real anchor/opacity; scale
    // is re-based to 40% (the legacy 330% assumed parent-counter-scaled rig
    // transforms that do not exist in this comp).
    content: { kind: "material-layer", comp: "master", layer: "Ae.png" },
    patch: {
      transform: {
        name: "Transform",
        matchName: "ADBE Transform Group",
        properties: [
          {
            name: "Scale",
            matchName: "ADBE Scale",
            type: 6212,
            numKeys: 0,
            value: [40, 40, 100],
          },
        ],
      },
    },
    // Ae.png is 240x234 with anchor [0,234] (bottom-left); at 40% scale it is
    // ~96x94px. The layout offset places its bottom-left corner.
    layout: { region: "brand", align: "top", offset: { x: -48, y: 273 } },
    parent: "brand-origin",
  },
  {
    id: "ae-plugin",
    name: "AFTER EFFECTS PLUGIN",
    content: {
      kind: "spec",
      layer: (() => {
        const l = textLayer("AFTER EFFECTS\rPLUGIN", {
          text: "AFTER EFFECTS\rPLUGIN",
          font: "MeiryoUI",
          fontSize: 34,
          tracking: 42,
          leading: 40.8,
          justification: "LEFT_JUSTIFY",
        });
        return l;
      })(),
    },
    // The dumped layer carried a non-uniform 861x745 scale inherited from the
    // legacy rig; the wordmark is authored at its dumped font/tracking size
    // instead (the scale was rig compensation, not brand intent).
    layout: { region: "brand", align: "top", offset: { x: 0, y: 337 } },
    parent: "brand-origin",
  },
];

// Main stage marker: a stroke-only rect sized to the `main` region. It is a
// structural placeholder proving region placement; real scene content
// replaces it in later steps. (Rect size is a content metric baked at
// authoring time; the position still reflows with the grid.)
const mainRect = regionRect("main");
const mainMarker: SectionLayerSpec = {
  id: "main-stage",
  name: "main stage (region marker)",
  content: {
    kind: "spec",
    layer: {
      index: 0,
      name: "main stage (region marker)",
      kind: "shape",
      transform: transformOf(ZERO3),
      shapes: rootShapes(
        vectorGroup([
          {
            name: "Rect 1",
            matchName: "ADBE Vector Shape - Rect",
            properties: [
              {
                name: "Size",
                matchName: "ADBE Vector Rect Size",
                value: [mainRect.width, mainRect.height],
              },
              { name: "Position", matchName: "ADBE Vector Rect Position", value: [0, 0] },
            ],
          },
          {
            name: "Stroke 1",
            matchName: "ADBE Vector Graphic - Stroke",
            properties: strokeProps(3, [0.1, 0.1, 0.1]),
          },
        ]),
      ),
    },
  },
  layout: { region: "main", align: "center" },
};

// Grid guide lines: every column/row line of the 12x12 grid, comp space.
const guideLayers: LayerSpec[] = [];
for (let c = 0; c <= GRID.columns; c++) {
  guideLayers.push(
    guideLine({
      name: `grid v${c}`,
      horizontal: false,
      at: grid.columnX(c),
      from: 0,
      to: FRAME.height,
      opacityKeys: GUIDE_OPACITY_KEYS,
    }),
  );
}
for (let r = 0; r <= GRID.rows; r++) {
  guideLayers.push(
    guideLine({
      name: `grid h${r}`,
      horizontal: true,
      at: grid.rowY(r),
      from: 0,
      to: FRAME.width,
      opacityKeys: GUIDE_OPACITY_KEYS,
    }),
  );
}

// ---- comp + project ---------------------------------------------------------------

const comp: CompProduction = {
  id: "brand-check",
  name: "brand-check",
  label: ITEM_LABEL_WORK,
  grid: GRID,
  regions: REGIONS,
  sections: [
    {
      id: "guide-grid",
      role: "guide",
      // Topmost so the grid reads over content in the guide state; opacity
      // keys keep it invisible in the normal state.
      layers: guideLayers.map((layer, i) => ({
        id: `grid-line-${i}`,
        name: layer.name,
        content: { kind: "spec" as const, layer },
      })),
    },
    {
      id: "copy",
      role: "copy",
      anchors: [
        {
          id: "copy-origin",
          layout: { region: "top", align: "top-left" },
        } satisfies AnchorSpec,
      ],
      layers: [headingLayer, ...descriptionLayers],
    },
    {
      id: "brand",
      role: "brand",
      anchors: [
        {
          id: "brand-origin",
          layout: { region: "brand", align: "top-left" },
          keys: BRAND_ANCHOR_KEYS,
        } satisfies AnchorSpec,
      ],
      layers: brandLayers,
    },
    {
      id: "main",
      role: "stage",
      layers: [mainMarker],
    },
  ],
};

const project: ProductionProject = {
  name: "restro-pv-brandcheck",
  frame: FRAME,
  comps: [comp],
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

/** Authored project (exported so tests can recompile grid variations). */
export { project as brandCheckProject };
