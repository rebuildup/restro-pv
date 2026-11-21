// Brand verification comp — faithful reproduction of the legacy master's
// Heading + Logo block (Step 2-B of the scene-structure rebuild).
//
// Source of truth: legacy/pv-2dc99e1.aep comp "master" (1080x1080, 24fps,
// 20s). Every transform value below is the dumped original value — positions
// are PARENT-LOCAL exactly as stored in the AEP, scales/anchors verbatim.
// Nothing here is a new layout: there is no grid, no region split, no
// authored copy and no invented motion. The only authored decisions are
// stable ref ids, section grouping and comp/frame parameters matching the
// original master.
//
// Reproduced structure (original master layer indices noted for traceability):
//
//   P 9   null  anchor[50,50] scale[12,12,100] pos X=26, Y keys
//         734 -> 889 @3.875-4.5s, hold, -> 734 @15.5-16.17s   (idx 116)
//    └ P-33 null  pos[100,100] scale100                            (idx 120)
//       └ Heading comp "Heading" 416x66 scale 833.333% pos[0,0]    (idx 15)
//
//   P 5   null  anchor[50,50] scale[12,12,100] pos X=26, Y keys
//         423 -> 268 @same times, -> 423 @16.17s                  (idx 136)
//    └ Logo comp "Logo" 416x260 scale 833.333% pos[100,100]        (idx 18)
//
// Effective anchor positions — measured via AE toComp on both projects
// (identical to 4 decimals at all sampled times):
//   Heading (32,740)/(32,895)/(32,740) — moves DOWN 155px during 4.5-15.5s
//   Logo    (32,429)/(32,274)/(32,429) — moves UP   155px, counter-phase
// Neither brand layer uses time remap — live AE read on the original master
// reports timeRemapEnabled=false (an earlier dump field was stale). The
// material comps play their own timeline, same as the original.
//
// Z-order kept from the original: Heading renders above Logo; the rig nulls
// sit at the bottom of the stack like the original null block. Elements
// outside this step's scope (PLUGIN text, Ae.png, description, scene comps,
// grid-solid, mattes) are intentionally absent — differences versus full
// master frames are expected and documented in the PR.
//
// Build: bun tools/build-jsx.ts --spec pv/scenes/brandcheck.ts \
//          --out dist/brandcheck.jsx --save .tmp/probe/brandcheck.aep \
//          --report .tmp/probe/brandcheck-report.json

import { compileProduction } from "../production/compile.ts";
import type {
  CompProduction,
  ProductionProject,
  SectionLayerSpec,
} from "../production/model.ts";
import { ITEM_LABEL_WORK } from "../production/theme.ts";
import type { KeySpec, LayerSpec, PropNode, ProjectSpec, Vec3 } from "../spec/types.ts";
import { materialCompsByName, materialItemLabels, materialKeepSet } from "./production.ts";

// ---- frame -----------------------------------------------------------------
// Identical to the original master so frame numbers compare 1:1.

const FPS = 24;
const DURATION = 20;

const FRAME = {
  width: 1080,
  height: 1080,
  pixelAspect: 1,
  frameRate: FPS,
  duration: DURATION,
  // The original master's visible ground is the "White Solid 1" footage
  // layer (1080x1080 white at comp center); bgColor reproduces it without
  // importing the solid.
  bgColor: [1, 1, 1],
};

// ---- verbatim transform fragments -------------------------------------------
// PropNode shapes exactly as dumped from the AEP (restro-pv.aep-comp-dump.v1).
// Key ease entries keep the dumped {speed,influence} objects — the runtime
// maps them to KeyframeEase.

function prop(
  name: string,
  matchName: string,
  value: unknown,
  keys?: KeySpec[],
): PropNode {
  return {
    name,
    matchName,
    type: 6212,
    numKeys: keys?.length ?? 0,
    ...(keys ? { keys } : { value }),
  };
}

function transform(props: PropNode[], separatedPosition?: boolean): PropNode {
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    type: 6213,
    active: true,
    enabled: true,
    propertyIndex: 6,
    numProperties: props.length,
    properties: props,
    ...(separatedPosition ? { separatedPosition: true } : {}),
  };
}

// P 9 / P 5 share the same Y-key envelope, mirrored in value:
//   P 9: 734 -> 889 (eases +248 / -232.5)
//   P 5: 423 -> 268 (eases -248 / +232.5)
// Key times are identical: 3.875 -> 4.5 (move), 15.5 -> 16.1667 (return).
// inT/outT 6612 = KeyframeInterpolationType.BEZIER on both sides.

const RIG_Y_KEYS: Record<"p9" | "p5", KeySpec[]> = {
  p9: [
    { t: 3.875, v: 734, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 0 }], outEase: [{ influence: 16.666666667, speed: 248 }] },
    { t: 4.5, v: 889, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 248 }], outEase: [{ influence: 16.666666667, speed: 0 }] },
    { t: 15.5, v: 889, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 0 }], outEase: [{ influence: 16.666666667, speed: -232.5 }] },
    { t: 16.1666666666667, v: 734, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: -232.5 }], outEase: [{ influence: 16.666666667, speed: 0 }] },
  ],
  p5: [
    { t: 3.875, v: 423, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 0 }], outEase: [{ influence: 16.666666667, speed: -248 }] },
    { t: 4.5, v: 268, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: -248 }], outEase: [{ influence: 16.666666667, speed: 0 }] },
    { t: 15.5, v: 268, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 0 }], outEase: [{ influence: 16.666666667, speed: 232.5 }] },
    { t: 16.1666666666667, v: 423, inT: 6612, outT: 6612, inEase: [{ influence: 16.666666667, speed: 232.5 }], outEase: [{ influence: 16.666666667, speed: 0 }] },
  ],
};

/** P N rig null: anchor [50,50], scale 12%, separated X=26 + keyed Y. */
function rigNull(name: string, yKeys: readonly KeySpec[]): LayerSpec {
  return {
    index: 0,
    name,
    kind: "null",
    transform: transform(
      [
        prop("Anchor Point", "ADBE Anchor Point", [50, 50, 0]),
        prop("X Position", "ADBE Position_0", 26),
        prop("Y Position", "ADBE Position_1", undefined, [...yKeys]),
        prop("Scale", "ADBE Scale", [12, 12, 100]),
        prop("Rotation", "ADBE Rotate Z", 0),
        prop("Opacity", "ADBE Opacity", 0),
      ],
      true,
    ),
  };
}

/** P-Nx intermediate null (static, scale 100%). */
function midNull(name: string, position: Vec3, anchor: Vec3): LayerSpec {
  return {
    index: 0,
    name,
    kind: "null",
    transform: transform([
      prop("Anchor Point", "ADBE Anchor Point", [anchor.x, anchor.y, anchor.z]),
      prop("Position", "ADBE Position", [position.x, position.y, position.z]),
      prop("Scale", "ADBE Scale", [100, 100, 100]),
      prop("Rotation", "ADBE Rotate Z", 0),
      prop("Opacity", "ADBE Opacity", 0),
    ]),
  };
}

/** Giant brand comp transform: verbatim dumped values (anchor [0,0]). */
function brandTransform(position: Vec3, scale: number): PropNode {
  return transform([
    prop("Anchor Point", "ADBE Anchor Point", [0, 0, 0]),
    prop("Position", "ADBE Position", [position.x, position.y, position.z]),
    prop("Scale", "ADBE Scale", [scale, scale, 100]),
    prop("Rotation", "ADBE Rotate Z", 0),
    prop("Opacity", "ADBE Opacity", 100),
  ]);
}

// ---- section layer specs ------------------------------------------------------
// Content layers carry material-comp references (semantic, resolved by comp
// name inside the material AEP); patch.transform overwrites the generated
// centered transform with the verbatim dumped one. Rig nulls are spec layers
// with the exact dumped transform trees.

const brandContentLayers: SectionLayerSpec[] = [
  {
    id: "heading",
    name: "Heading",
    content: { kind: "material-comp", comp: "Heading" },
    patch: {
      transform: brandTransform({ x: 0, y: 0, z: 0 }, 833.333333333333),
    },
    parent: "p-33",
  },
  {
    id: "logo",
    name: "Logo",
    content: { kind: "material-comp", comp: "Logo" },
    patch: {
      transform: brandTransform({ x: 100, y: 100, z: 0 }, 833.333333333333),
    },
    parent: "p-5",
  },
];

const rigLayers: SectionLayerSpec[] = [
  {
    id: "p-9",
    name: "P 9",
    content: { kind: "spec", layer: rigNull("P 9", RIG_Y_KEYS.p9) },
  },
  {
    id: "p-33",
    name: "P-33",
    content: {
      kind: "spec",
      layer: midNull("P-33", { x: 100, y: 100, z: 0 }, { x: 0, y: 0, z: 0 }),
    },
    parent: "p-9",
  },
  {
    id: "p-5",
    name: "P 5",
    content: { kind: "spec", layer: rigNull("P 5", RIG_Y_KEYS.p5) },
  },
];

// ---- comp + project ------------------------------------------------------------

const comp: CompProduction = {
  id: "brand-check",
  name: "brand-check",
  label: ITEM_LABEL_WORK,
  // No grid/regions: this comp reproduces the original rig verbatim.
  sections: [
    {
      id: "brand",
      role: "brand",
      group: false,
      // Front-to-back like the original: Heading (idx 15) above Logo (idx 18).
      layers: brandContentLayers,
    },
    {
      id: "rig",
      role: "rig",
      group: false,
      // Null block sits at the bottom of the stack, as in the original.
      layers: rigLayers,
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

/** Authored project (exported so tests can inspect the rig structure). */
export { project as brandCheckProject };
