// Scene-B verification comp — reproduces the compositional structure of the
// original master's B window (frames 101-190, ~4.25-7.92s) as semantic
// sections (issue #19, Step 3).
//
// What the original B window actually is (pv/generated/05-master.ts dump):
//   - brand rail + description viewport on the left (unchanged from
//     brand-check: Heading / AFTER EFFECTS PLUGIN / Ae.png / Logo /
//     description, 0-20s)
//   - "Lens magnifier" precomp at (75.97,337.88), ALPHA-matted by the null
//     directly above it (P-71) — same inert-null adjacency as master
//   - right-side step stack: four cumulative tab bands (labels 01-04 +
//     tab backgrounds), STEP1-4 border/card frames, and the material comps
//     STEP1 outline / STEP2-4 draft / Baseline (the FUDE "筆" glyph and its
//     processing stages), all inside 4.25-7.92s
//   - tracker rig: ~55 nulls feeding the Linked Quad corner markers' Layer
//     Controls (cloned via legacyCloneContext fixpoint closure)
//   - ground: 3D grid-solid plane + White Solid 1, lens matte + STEP cards
//   - audio: BGM mp3
//
// Matte adjacency is preserved by construction: every ALPHA-matted layer
// sits directly below its matte source inside the same section, so no
// FoldLayers divider can land between a matte pair.
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
import type { ProjectSpec } from "../spec/types.ts";
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
  // chrome section: matte source directly above description
  LENS_FRAME,
  // lens section: null matte source directly above Lens magnifier
  "P-71",
  // step tabs
  "04  一画ずつに分割中・",
  "03  隠れた頂点を推定した",
  "02  輪郭線を延長した",
  "01  輪郭を解析した",
  "tab backgrounds",
  // step stage: border immediately above its draft (alpha matte pairs)
  "STEP 4 border",
  "STEP 3 border",
  "STEP 2 border",
  "STEP 1 border",
  "STEP 1 card",
  "STEP 2 card",
  "STEP 3 card",
  "STEP 4 card",
  "lens matte",
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

/** STEP draft/outline material-comp layer: ALPHA-matted by the border
 *  clone directly above it inside the step-stage section. */
function stepDraft(id: string, pos: { x: number; y: number }): SectionLayerSpec {
  return {
    ...stepCompLayer(id, id, pos),
    patch: { trackMatteType: 5013 },
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
      // (master idx9->10) preserving the ALPHA matte adjacency; then the
      // accepted brand stack (description > Heading > PLUGIN > Ae > Logo).
      id: "chrome",
      role: "chrome",
      layers: [
        clones.sectionLayer(LENS_FRAME),
        // description keeps the master's ALPHA matte (LENS frame directly
        // above it, same adjacency as idx9->10); brand-check left it
        // unset because no matte source existed there.
        ...brandSection.layers.map((l) =>
          l.id === "description"
            ? { ...l, patch: { ...(l.patch ?? {}), trackMatteType: 5013 } }
            : l,
        ),
      ],
    },
    {
      // P-71 (tracker null) directly above Lens magnifier reproduces the
      // master's null-alpha-matte adjacency (idx22->23).
      id: "lens",
      role: "scene",
      layers: [
        clones.sectionLayer("P-71"),
        {
          id: "lens-magnifier",
          name: "Lens magnifier",
          content: { kind: "material-comp", comp: "Lens magnifier" },
          layout: { position: { x: 75.9680938720703, y: 337.882507324219 } },
          metrics: {
            width: 1080,
            height: 1080,
            anchor: { x: 0, y: 0 },
          },
          timing: { inPoint: B_IN, outPoint: B_OUT, startTime: B_IN, stretch: 100 },
          patch: { trackMatteType: 5013 },
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
      // Cumulative step tabs: labels 04->01 then the band background, all
      // 4.25-7.92s (the original shows the full set, not a sequential add).
      id: "step-tabs",
      role: "scene",
      layers: [
        "04  一画ずつに分割中・",
        "03  隠れた頂点を推定した",
        "02  輪郭線を延長した",
        "01  輪郭を解析した",
        "tab backgrounds",
      ].map((n) => clones.sectionLayer(n)),
    },
    {
      // Step stage, master z-order: each border directly above its draft
      // (alpha matte pairs stay adjacent inside the section), Baseline at
      // the bottom of the stack.
      id: "step-stage",
      role: "scene",
      layers: [
        {
          id: "step-4-border",
          name: "STEP 4 border",
          content: { kind: "spec", layer: clones.layer("STEP 4 border") },
        },
        stepDraft("STEP4 draft", { x: 540, y: 540 }),
        {
          id: "step-3-border",
          name: "STEP 3 border",
          content: { kind: "spec", layer: clones.layer("STEP 3 border") },
        },
        stepDraft("STEP3 draft", { x: 540, y: 540 }),
        {
          id: "step-2-border",
          name: "STEP 2 border",
          content: { kind: "spec", layer: clones.layer("STEP 2 border") },
        },
        stepDraft("STEP2 draft", { x: 540, y: 540 }),
        {
          id: "step-1-border",
          name: "STEP 1 border",
          content: { kind: "spec", layer: clones.layer("STEP 1 border") },
        },
        {
          ...stepCompLayer("STEP1 outline", "STEP1 outline", { x: 797, y: 223 }, B_OUT_STEP1),
          patch: {
            trackMatteType: 5013,
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
      id: "matte-cards",
      role: "guide",
      layers: [
        "lens matte",
        "STEP 1 card",
        "STEP 2 card",
        "STEP 3 card",
        "STEP 4 card",
      ].map((n) => clones.sectionLayer(n)),
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
