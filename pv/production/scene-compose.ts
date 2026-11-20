// Semantic scene compiler: text/brand/main sections become AE layers.
// Original Restro geometry remains inside imported material compositions;
// no source AE layer names or layer indices are used as layout primitives.
import type { CompSpec, LayerSpec, PropNode } from "../model/types.ts";
import { withFoldGroups } from "./ae-organization.ts";
import {
  assertSceneLayouts,
  PV_GRID,
  type FrameRect,
  type SceneLayout,
  type Section,
} from "./scene-layout.ts";

export interface SceneContent {
  id: string;
  title: string;
  description: string;
  materialComp: string;
  durationFrames: number;
  hero: FrameRect;
}

function transform(position: [number, number], scale = 100, anchor: [number, number] = [0, 0]): PropNode {
  const prop = (name: string, matchName: string, value: unknown): PropNode => ({ name, matchName, value });
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    numProperties: 5,
    properties: [
      prop("Anchor Point", "ADBE Anchor Point", [anchor[0], anchor[1], 0]),
      prop("Position", "ADBE Position", [position[0], position[1], 0]),
      prop("Scale", "ADBE Scale", [scale, scale, 100]),
      prop("Rotation", "ADBE Rotate Z", 0),
      prop("Opacity", "ADBE Opacity", 100),
    ],
  };
}

function textLayer(section: Section, value: string, fontSize: number, scene: string): LayerSpec {
  const textDoc: PropNode = {
    name: "Source Text",
    matchName: "ADBE Text Document",
    value: {
      text: value,
      fontSize,
      applyFill: true,
      fillColor: [0.08, 0.08, 0.10],
      applyStroke: false,
    },
  };
  return {
    index: 0,
    name: scene + " / " + section.role,
    kind: "text",
    role: "information",
    startTime: 0,
    inPoint: section.fromFrame / PV_GRID.fps,
    outPoint: section.toFrame / PV_GRID.fps,
    transform: transform([section.rect.x, section.rect.y + fontSize]),
    text: {
      name: "Text",
      matchName: "ADBE Text Properties",
      numProperties: 1,
      properties: [textDoc],
    },
  };
}

function materialLayer(
  name: string, source: string, rect: FrameRect, durationFrames: number,
  nativeWidth = 1080, nativeHeight = 1080,
): LayerSpec {
  const fit = Math.min(rect.width / nativeWidth, rect.height / nativeHeight);
  return {
    index: 0,
    name,
    kind: "comp",
    source,
    role: "content",
    startTime: 0,
    inPoint: 0,
    outPoint: durationFrames / PV_GRID.fps,
    audioEnabled: false,
    transform: transform(
      [rect.x + rect.width / 2, rect.y + rect.height / 2],
      fit * 100,
      [nativeWidth / 2, nativeHeight / 2],
    ),
  };
}

export function composeScene(content: SceneContent): CompSpec {
  const { id, title, description, materialComp, durationFrames, hero } = content;
  if (!id || !materialComp || !title || !description) throw new Error("scene content is incomplete");
  const head: Section = {
    id: "heading", role: "heading",
    rect: { x: 48, y: 48, width: 680, height: 80 },
    fromFrame: 0, toFrame: durationFrames,
  };
  const copy: Section = {
    id: "description", role: "description",
    rect: { x: 48, y: 143, width: 680, height: 95 },
    fromFrame: 0, toFrame: durationFrames,
  };
  const main: Section = {
    id: "main", role: "main", rect: hero,
    fromFrame: 0, toFrame: durationFrames, mainOrder: 0,
  };
  const layout: SceneLayout = {
    id, fromFrame: 0, toFrame: durationFrames, sections: [head, copy, main],
  };
  assertSceneLayouts([layout]);
  // AE inserts layers at index 1; order here is already top-to-bottom.
  const layers: LayerSpec[] = [
    textLayer(head, title, 60, id),
    textLayer(copy, description, 35, id),
    materialLayer(id + " / main", materialComp, hero, durationFrames),
  ];
  layers.forEach((layer, index) => { layer.index = index + 1; });
  return {
    name: "Scene " + id,
    width: PV_GRID.width,
    height: PV_GRID.height,
    frameRate: PV_GRID.fps,
    duration: durationFrames / PV_GRID.fps,
    pixelAspect: 1,
    bgColor: [0.97, 0.97, 0.97],
    label: 13,
    folder: "01 - PV Output",
    layers: withFoldGroups(layers, durationFrames / PV_GRID.fps),
  };
}
