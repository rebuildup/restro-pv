// Scene-B verification comp — reproduces the compositional structure of the
// original master's B window (frames 101-190, ~4.25-7.92s) as semantic
// sections (issue #19, Step 3).
//
// Compositing model (explicit, TypeScript-authored — see ADR-0003):
//   - the legacy master's stored track mattes are NOT reproduced. The v10
//     isolation experiment (verification/sceneb/v10-matte-isolation) showed
//     the stored bindings are stale/inconsistent across layers and cannot be
//     recreated by re-emitting 5012/5013; a controlled AE test proved a
//     zero-alpha null matte source erases its target completely.
//   - STEP drafts/outline render unmattted (5012). The border and card
//     clones stay as visible info layers that frame each stage. A v12
//     experiment re-adding border mattes showed AE disables the matte
//     source border, zeroing the matte and erasing the drafts — and the
//     legacy master's only live isTrackMatte sources were unrelated
//     scaffold layers anyway, so the binding was never real.
//   - the Lens magnifier's display window is an explicit animated mask on
//     the layer itself, authored from the legacy "lens matte" shape: a
//     circle at master (660,810) radius ~210 that pops in at ~4.97s. The
//     LENS frame ring clone remains as the window outline. P-71 (a
//     zero-alpha tracker null) is removed — nothing references it.
//   - the four stage labels appear cumulatively as each stage begins
//     (SPEC §10.3), timed to the Lens comp's internal stage windows.
//
// What the original B window actually is (pv/generated/05-master.ts dump):
//   - brand rail + description viewport on the left (unchanged from
//     brand-check: Heading / AFTER EFFECTS PLUGIN / Ae.png / Logo /
//     description, 0-20s)
//   - "Lens magnifier" precomp at (75.97,337.88); its visible window is the
//     "lens matte" circle at (660,810) r~210 (now an explicit layer mask)
//   - right-side step stack: four cumulative tab bands (labels 01-04 +
//     tab backgrounds), STEP1-4 border/card frames, and the material comps
//     STEP1 outline / STEP2-4 draft / Baseline (the FUDE "筆" glyph and its
//     processing stages), all inside 4.25-7.92s
//   - tracker rig: ~55 nulls feeding the Linked Quad corner markers' Layer
//     Controls (cloned via legacyCloneContext fixpoint closure)
//   - ground: 3D grid-solid plane + White Solid 1
//   - audio: BGM mp3
//
// NOT reproduced (out of B scope): A1/A2/A3 content (bunkai/kai-zoom),
// scene C/D/E comps, disabled scaffold layers, 'lens content' /
// 'BG decomposed strokes' (unreferenced by the current master).
//
// Build: bun tools/build-jsx.ts --spec pv/scenes/scene-b.ts \
//          --out dist/sbcheck.jsx --save .tmp/probe/scene-b.aep

import { compileProduction } from "../production/compile.ts";
import type { CompProduction, ProductionProject, SectionLayerSpec } from "../production/model.ts";
import { ITEM_LABEL_WORK } from "../production/theme.ts";
import type { LayerSpec, ProjectSpec, PropNode } from "../spec/types.ts";
import { brandCheckProject } from "./brandcheck.ts";
import { legacyCloneContext, type LegacyCloneContext } from "./legacy-master.ts";
import { materialCompsByName, materialItemLabels, materialKeepSet } from "./production.ts";

const FPS = 24;
const T_END = 20;
// B window as dumped in the master (comp-time seconds).
const B_IN = 4.25;
const B_OUT = 7.91666666666667;
const B_OUT_STEP1 = 6.25;

// ---- legacy clone set ---------------------------------------------------------
// Explicitly emitted legacy master layers (front-to-back within their
// sections). Everything else the clones reference — the tracker-null rig —
// is pulled in automatically by legacyCloneContext's fixpoint closure.

const LENS_FRAME = "LENS frame";
const CLONE_NAMES = [
  // chrome section: LENS frame directly above description (master idx9->10)
  LENS_FRAME,
  // step tabs
  "04  一画ずつに分割中・",
  "03  隠れた頂点を推定した",
  "02  輪郭線を延長した",
  "01  輪郭を解析した",
  "tab backgrounds",
  // step stage: border immediately above its draft (master z-order kept;
  // the stored mattes are inert — see Matte note)
  "STEP 4 border",
  "STEP 3 border",
  "STEP 2 border",
  "STEP 1 border",
  // STEP card bands stay as visible info layers (frame each stage); they
  // are no longer matte sources. The legacy "lens matte" circle is replaced
  // by an explicit mask on the Lens magnifier layer (see lensWindowMasks).
  "STEP 1 card",
  "STEP 2 card",
  "STEP 3 card",
  "STEP 4 card",
  // overlay quads + A-section stroke marker (always-on 0-20s)
  "Linked Quad 5",
  "Linked Quad 4",
  "Linked Quad 3",
  "Linked Quad 2",
  "Linked Quad",
  "▾ (A) stroke runs4",
  // Linked Quad 7 is disabled in the master but its Corner Pin Layer
  // Controls feed STEP 1 border/card path expressions — it must exist.
  "Linked Quad 7",
  // ground
  "grid-solid",
  "White Solid 1",
  // bottom quads + matte cards
  "Linked Quad 8",
  "Linked Quad 9",
  "Linked Quad 10",
  // opacity control null referenced by name from the Linked Quad
  // Opacity expressions (master idx165, tail of the rig-null block)
  "ctl-op",
] as const;

const clones = legacyCloneContext([...CLONE_NAMES], { strict: true });

// ---- material-comp layers -----------------------------------------------------
// Timing/transform values verbatim from the master dump; the comps
// themselves live in the scene-b material AEP.

function stepCompLayer(
  id: string,
  comp: string,
  pos: { x: number; y: number },
  out = B_OUT,
): SectionLayerSpec {
  return {
    id,
    name: comp,
    content: { kind: "material-comp", comp },
    layout: { position: pos },
    metrics: {
      width: 1080,
      height: 1080,
      anchor: { x: pos.x, y: pos.y },
    },
    timing: { inPoint: B_IN, outPoint: out, startTime: B_IN, stretch: 100 },
  };
}

/** STEP draft/outline material-comp layer, unmattted. Empirically (v12
 *  build): giving the draft ALPHA makes AE disable the border layer above
 *  it, which zeroes the matte alpha and erases the draft entirely — the
 *  legacy master never actually used these bindings (its only live
 *  isTrackMatte sources were unrelated scaffold layers). The stage comps
 *  are self-contained; borders/cards stay visible info layers. */
function stepDraft(id: string, pos: { x: number; y: number }): SectionLayerSpec {
  return stepCompLayer(id, id, pos);
}

/** Clone a legacy info layer (border/card) with stale matte flags cleared:
 *  in the master these doubled as track-matte sources; in the explicit
 *  model they are plain visible layers. */
function infoSpec(name: string): LayerSpec {
  return { ...clones.layer(name), isTrackMatte: false, trackMatteType: 5012 };
}
function infoLayer(name: string): SectionLayerSpec {
  return clones.sectionLayer(name, {
    time: (l) => {
      l.isTrackMatte = false;
      l.trackMatteType = 5012;
    },
  });
}

// ---- lens window -------------------------------------------------------------
// The legacy "lens matte" clone was a white ellipse at master (660,810),
// radius ~210, hidden until ~4.97s then popping in with a damped spring.
// We author the same window as an explicit mask on the Lens magnifier
// layer so enlarged content can never leak outside the window.
const LENS_POS = { x: 75.9680938720703, y: 337.882507324219 };
const LENS_WINDOW = {
  masterCenter: { x: 660, y: 810 },
  radius: 210,
  appearAt: 4.95,
};
// Stage windows from the Lens magnifier comp's internal sequencing
// (comp-time + B_IN): outline 4.25-5.00, extend 5.00-5.63,
// hidden-vertex 5.63-6.63, brush rebuild 6.63-7.92.
const TAB_STAGE_IN = [B_IN, 5.0, 5.63, 6.63] as const;
const TAB_NAMES = [
  "01  輪郭を解析した",
  "02  輪郭線を延長した",
  "03  隠れた頂点を推定した",
  "04  一画ずつに分割中・",
] as const;

/** Explicit elliptical display window for the Lens magnifier, in layer
 *  space (the 1080x1080 material comp; layer pos LENS_POS, anchor 0,0,
 *  scale 100 → mask coords = comp px offset by -LENS_POS from master).
 *  Mask Expansion keyframes reproduce the legacy pop-in: collapsed at
 *  appearAt, overshoot, damped settle to the full radius. */
function lensWindowMasks(): PropNode {
  const cx = LENS_WINDOW.masterCenter.x - LENS_POS.x;
  const cy = LENS_WINDOW.masterCenter.y - LENS_POS.y;
  const r = LENS_WINDOW.radius;
  const N = 16;
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    vertices.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const zero = vertices.map(() => [0, 0] as [number, number]);
  const t0 = LENS_WINDOW.appearAt;
  return {
    name: "Masks",
    matchName: "ADBE Mask Parade",
    type: 6214,
    properties: [
      {
        name: "lens window",
        matchName: "ADBE Mask Atom",
        type: 6213,
        maskMode: 6813,
        properties: [
          {
            name: "Mask Path",
            matchName: "ADBE Mask Shape",
            type: 6212,
            numKeys: 0,
            value: { vertices, inTangents: zero, outTangents: zero, closed: true },
          },
          {
            name: "Mask Feather",
            matchName: "ADBE Mask Feather",
            type: 6212,
            numKeys: 0,
            value: [20, 20],
          },
          {
            name: "Mask Opacity",
            matchName: "ADBE Mask Opacity",
            type: 6212,
            numKeys: 0,
            value: 100,
          },
          {
            name: "Mask Expansion",
            matchName: "ADBE Mask Offset",
            type: 6212,
            numKeys: 5,
            value: 0,
            keys: [
              { t: t0, v: -r },
              { t: t0 + 0.2, v: 15 },
              { t: t0 + 0.55, v: -6 },
              { t: t0 + 1.05, v: 0 },
              { t: t0 + 1.6, v: 0 },
            ],
          },
        ],
      },
    ],
  };
}

// ---- comp ----------------------------------------------------------------------

const brandComp = brandCheckProject.comps[0];
const brandSection = brandComp.sections.find((s) => s.id === "brand");
if (!brandSection) throw new Error("brand-check project lost its brand section");

const comp: CompProduction = {
  id: "scene-b-check",
  // The Restro material comps (Baseline, STEP1-4) resolve their corner
  // tracking through comp("master").layer("Linked Quad 8/9/10") — a legacy
  // coupling to the master comp's tracker quads. This verification comp
  // stands in for that master window, so it must carry the literal name
  // "master" for the material expressions to bind.
  name: "master",
  label: ITEM_LABEL_WORK,
  folder: "_Verification",
  // Same kg grid as brand-check: the brand rail anchors are grid-derived.
  grid: brandComp.grid,
  regions: brandComp.regions,
  anchors: brandComp.anchors,
  sections: [
    {
      // Front of the B window: LENS frame sits directly above description
      // (master idx9->10); the master's stored ALPHA matte is stale/inert
      // (LENS frame renders visibly, description unclipped) → 5012; then
      // the accepted brand stack (description > Heading > PLUGIN > Ae > Logo).
      id: "chrome",
      role: "chrome",
      layers: [
        clones.sectionLayer(LENS_FRAME),
        ...brandSection.layers.map((l) =>
          l.id === "description"
            ? { ...l, patch: { ...(l.patch ?? {}), trackMatteType: 5012 } }
            : l,
        ),
      ],
    },
    {
      // Lens magnifier: enlarged brush content is confined to an explicit
      // elliptical window mask (authored from the legacy "lens matte"
      // circle). No track matte — the legacy P-71 zero-alpha null binding
      // is removed entirely.
      id: "lens",
      role: "scene",
      layers: [
        {
          id: "lens-magnifier",
          name: "Lens magnifier",
          content: { kind: "material-comp", comp: "Lens magnifier" },
          layout: { position: LENS_POS },
          metrics: {
            width: 1080,
            height: 1080,
            anchor: { x: 0, y: 0 },
          },
          timing: { inPoint: B_IN, outPoint: B_OUT, startTime: B_IN, stretch: 100 },
          patch: { masks: lensWindowMasks() },
        },
      ],
    },
    {
      // Tracker-null rig feeding the Linked Quads' Layer Controls. Shy-folded:
      // nulls still evaluate, so tracking keeps working while the timeline
      // shows the section structure.
      id: "rig-tracker",
      role: "guide",
      group: { folded: true },
      layers: [
        ...clones.neededNulls.map((n) => clones.sectionLayer(n)),
        clones.sectionLayer("ctl-op"),
      ],
    },
    {
      // Cumulative step tabs (SPEC §10.3): the band background shows for the
      // whole window; each stage label appears when its stage begins and
      // stays, timed to the Lens comp's internal stage windows.
      id: "step-tabs",
      role: "scene",
      layers: [
        // Front-to-back keeps the master's 04->01 label stacking.
        ...[...TAB_NAMES].reverse().map((n) =>
          clones.sectionLayer(n, {
            time: (l) => {
              l.inPoint = TAB_STAGE_IN[TAB_NAMES.indexOf(n)];
            },
          }),
        ),
        clones.sectionLayer("tab backgrounds"),
      ],
    },
    {
      // Step stage, master z-order kept: border above its draft (adjacency
      // preserved; no matte binding — see stepDraft note), Baseline last.
      id: "step-stage",
      role: "scene",
      layers: [
        {
          id: "step-4-border",
          name: "STEP 4 border",
          content: { kind: "spec", layer: infoSpec("STEP 4 border") },
        },
        stepDraft("STEP4 draft", { x: 540, y: 540 }),
        {
          id: "step-3-border",
          name: "STEP 3 border",
          content: { kind: "spec", layer: infoSpec("STEP 3 border") },
        },
        stepDraft("STEP3 draft", { x: 540, y: 540 }),
        {
          id: "step-2-border",
          name: "STEP 2 border",
          content: { kind: "spec", layer: infoSpec("STEP 2 border") },
        },
        stepDraft("STEP2 draft", { x: 540, y: 540 }),
        {
          id: "step-1-border",
          name: "STEP 1 border",
          content: { kind: "spec", layer: infoSpec("STEP 1 border") },
        },
        {
          ...stepCompLayer("STEP1 outline", "STEP1 outline", { x: 797, y: 223 }, B_OUT_STEP1),
          patch: {
            // Master carried an inert Rotate X=90 on this non-3D layer;
            // preserved for fidelity.
            transform: {
              name: "Transform",
              matchName: "ADBE Transform Group",
              properties: [
                {
                  name: "Rotation X",
                  matchName: "ADBE Rotate X",
                  type: 6212,
                  numKeys: 0,
                  value: 90,
                },
              ],
            },
          },
        },
        stepCompLayer("baseline", "Baseline", { x: 540, y: 540 }),
      ],
    },
    {
      id: "overlay-quads",
      role: "overlay",
      layers: [
        "Linked Quad 5",
        "Linked Quad 4",
        "Linked Quad 3",
        "Linked Quad 2",
        "Linked Quad",
        "▾ (A) stroke runs4",
      ].map((n) => clones.sectionLayer(n)),
    },
    {
      id: "ground",
      role: "guide",
      layers: ["grid-solid", "White Solid 1"].map((n) => clones.sectionLayer(n)),
    },
    {
      id: "quad-lens",
      role: "overlay",
      layers: ["Linked Quad 7", "Linked Quad 8", "Linked Quad 9", "Linked Quad 10"].map(
        (n) => clones.sectionLayer(n),
      ),
    },
    {
      // STEP card bands: the visible card/frame info layers for each stage.
      id: "step-cards",
      role: "scene",
      layers: ["STEP 1 card", "STEP 2 card", "STEP 3 card", "STEP 4 card"].map(infoLayer),
    },
    {
      id: "audio",
      role: "audio",
      layers: [
        clones.sectionLayer("drums-and-somps-background-music-458414.mp3"),
      ],
    },
  ],
};

const project: ProductionProject = {
  name: "restro-pv-sceneb",
  frame: {
    width: 1080,
    height: 1080,
    pixelAspect: 1,
    frameRate: FPS,
    duration: T_END,
    // Master comp background is black; White Solid 1 covers it anyway.
    bgColor: [0, 0, 0],
  },
  comps: [comp],
  assets: [
    {
      id: "ae-icon",
      kind: "file",
      name: "Ae.png",
      folder: "03_Materials/Images",
      file: "assets/images/Ae.png",
    },
  ],
  folders: [
    { name: "_Verification" },
    {
      name: "03_Materials",
      children: [
        { name: "Audio" },
        { name: "Brand" },
        { name: "Images" },
        { name: "Restro" },
        { name: "Solids" },
      ],
    },
  ],
  // Material-AEP items (scene comps + brand comps + their internal footage)
  // filed by name after pruning; spec-created items use `folder` directly.
  materialFolders: {
    // Restro brush-stroke scene comps — the B window's actual content.
    Baseline: "03_Materials/Restro",
    "STEP1 outline": "03_Materials/Restro",
    "STEP2 draft": "03_Materials/Restro",
    "STEP3 draft": "03_Materials/Restro",
    "STEP4 draft": "03_Materials/Restro",
    "Lens magnifier": "03_Materials/Restro",
    // Brand material comps (same filing as brand-check).
    Heading: "03_Materials/Brand",
    Logo: "03_Materials/Brand",
    description: "03_Materials/Brand",
    // Footage backing the material comps.
    "Blue Solid 1": "03_Materials/Solids",
    "Blue Solid 2": "03_Materials/Solids",
    "Null 30": "03_Materials/Solids",
    "Null 31": "03_Materials/Solids",
    "grid-solid": "03_Materials/Solids",
    "White Solid 1": "03_Materials/Solids",
    "drums-and-somps-background-music-458414.mp3": "03_Materials/Audio",
  },
  // Minimal material AEP for the B window: the scene comps + brand comps +
  // their dependency closure, extracted once from legacy. Regenerate by
  // pruning legacy/pv-2dc99e1.aep to the keep-set and saving as
  // materials/scene-b-materials.aep.
  materialAep: "materials/scene-b-materials.aep",
};

export function sceneBSpec(): ProjectSpec {
  const spec = compileProduction(project, { materialComps: materialCompsByName() });
  spec.itemLabels = materialItemLabels();
  spec.pruneMaterial = materialKeepSet(spec);
  return spec;
}

export function buildSpec(): ProjectSpec {
  return sceneBSpec();
}

/** Authored project (exported so tests can inspect section wiring). */
export { project as sceneBProject, clones as sceneBClones };
