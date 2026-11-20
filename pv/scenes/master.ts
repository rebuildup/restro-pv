// Production timeline. A/B remain a visual-reference bridge; C/D/E are
// authored through the explicit information/main layout compiler.
// Source AEP comps are materials only and are never patched or resaved.
import { withFoldGroups } from "../production/ae-organization.ts";
import { composeScene } from "../production/scene-compose.ts";
import { PV_GRID, risingHeroRects } from "../production/scene-layout.ts";
import type { CompSpec, LayerSpec, ProjectSpec, PropNode } from "../model/types.ts";

const TOTAL_FRAMES = 480;
const INTRO_END = 191;
const EXAMPLES_END = 281;
const WORKFLOW_END = 371;

function neutralTransform(): PropNode {
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    numProperties: 5,
    properties: [
      { name: "Anchor Point", matchName: "ADBE Anchor Point", value: [540, 540, 0] },
      { name: "Position", matchName: "ADBE Position", value: [540, 540, 0] },
      { name: "Scale", matchName: "ADBE Scale", value: [100, 100, 100] },
      { name: "Rotation", matchName: "ADBE Rotate Z", value: 0 },
      { name: "Opacity", matchName: "ADBE Opacity", value: 100 },
    ],
  };
}

function sceneReference(
  name: string, fromFrame: number, toFrame: number, generatedIndex?: number,
): LayerSpec {
  if (fromFrame < 0 || toFrame > TOTAL_FRAMES || fromFrame >= toFrame) {
    throw new Error("invalid scene trim: " + name);
  }
  return {
    index: 0,
    name: name + " / scene",
    kind: "comp",
    role: "content",
    source: name,
    sourceCompIndex: generatedIndex,
    // The source comp is authored at t=0. Its startTime and visible window
    // are aligned to the master clock; there is no implicit out-of-range tail.
    startTime: fromFrame / PV_GRID.fps,
    inPoint: fromFrame / PV_GRID.fps,
    outPoint: toFrame / PV_GRID.fps,
    audioEnabled: false,
    transform: neutralTransform(),
  };
}

function masterComp(): CompSpec {
  const layers: LayerSpec[] = [
    sceneReference("Scene E", WORKFLOW_END, TOTAL_FRAMES, 2),
    sceneReference("Scene D", EXAMPLES_END, WORKFLOW_END, 1),
    sceneReference("Scene C", INTRO_END, EXAMPLES_END, 0),
    // A1/A2/A3/B are the remaining legacy bridge. No legacy tracker null or
    // brand overlay is copied into this generated master.
    sceneReference("master", 0, INTRO_END),
    {
      index: 0,
      name: "Restro PV / soundtrack",
      kind: "footage",
      source: "drums-and-somps-background-music-458414.mp3",
      role: "audio",
      startTime: 0,
      inPoint: 0,
      outPoint: TOTAL_FRAMES / PV_GRID.fps,
      audioEnabled: true,
    },
  ];
  layers.forEach((layer, index) => { layer.index = index + 1; });
  return {
    name: "PV master",
    width: PV_GRID.width,
    height: PV_GRID.height,
    pixelAspect: 1,
    frameRate: PV_GRID.fps,
    duration: TOTAL_FRAMES / PV_GRID.fps,
    bgColor: [0.97, 0.97, 0.97],
    label: 13,
    folder: "01 - PV Output",
    layers: withFoldGroups(layers, TOTAL_FRAMES / PV_GRID.fps),
  };
}

export function pvProjectSpec(): ProjectSpec {
  const [examples, workflow, end] = risingHeroRects(3, 700, 700);
  const scenes: CompSpec[] = [
    composeScene({
      id: "C",
      title: "筆画から、表現へ",
      description: "一画ずつ、違う動きと構図に。",
      materialComp: "PV reel C",
      durationFrames: EXAMPLES_END - INTRO_END,
      hero: examples,
    }),
    composeScene({
      id: "D",
      title: "After Effectsで動かせる",
      description: "生成した筆画を、そのまま編集。",
      materialComp: "PV ops",
      durationFrames: WORKFLOW_END - EXAMPLES_END,
      hero: workflow,
    }),
    composeScene({
      id: "E",
      title: "Restro / 筆画復元",
      description: "BOOTHで販売中\n361do.booth.pm/items/9029239",
      descriptionFontSize: 28,
      materialComp: "PV end",
      durationFrames: TOTAL_FRAMES - WORKFLOW_END,
      hero: end,
    }),
  ];
  return {
    name: "restro-pv",
    // The legacy project is still the source asset library, not a frame-by-
    // frame project to reproduce. Extract the needed comps before release.
    materialAep: "legacy/pv-2dc99e1.aep",
    organizeProject: true,
    comps: [...scenes, masterComp()],
    footage: [],
  };
}
