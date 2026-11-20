// AE's label field selects a user-configurable color slot (1..16), not RGB.
// Keep semantic roles stable even if an AE user has customized the palette.
import type { LayerSpec } from "../model/types.ts";

export type LayerRole =
  | "information"
  | "content"
  | "overlay"
  | "rig"
  | "background"
  | "audio"
  | "divider";

export const ROLE_LABELS: Readonly<Record<LayerRole, number>> = {
  information: 9,
  content: 13,
  overlay: 11,
  rig: 6,
  background: 2,
  audio: 10,
  divider: 4,
};

export const ITEM_LABELS = {
  output: 13,
  material: 5,
  footage: 8,
  audio: 10,
} as const;

const ROLE_TITLES: Readonly<Record<LayerRole, string>> = {
  information: "INFORMATION",
  content: "MAIN CONTENT",
  overlay: "VISUAL OVERLAYS",
  rig: "TRACKING RIG",
  background: "BACKGROUND",
  audio: "AUDIO",
  divider: "GROUP",
};

export function foldDivider(role: LayerRole, number: number, duration: number): LayerSpec {
  if (!Number.isInteger(number) || number < 1) throw new Error("invalid FoldLayers group ordinal");
  if (!(duration > 0)) throw new Error("invalid FoldLayers group duration");
  return {
    index: 0,
    name: "▾ " + String(number).padStart(2, "0") + " " + ROLE_TITLES[role],
    kind: "shape",
    role: "divider",
    label: ROLE_LABELS.divider,
    foldDivider: { folded: false },
    enabled: false,
    inPoint: 0,
    outPoint: duration,
    startTime: 0,
  };
}

export function classifyLayer(layer: LayerSpec): LayerRole {
  if (layer.foldDivider) return "divider";
  if (layer.kind === "null") return "rig";
  if (/(?:\.mp3|\.wav|\.aiff)$/i.test(layer.source ?? layer.name)) return "audio";
  if (/^(?:description|Heading|AFTER EFFECTS PLUGIN|Ae\.png|Logo)$/.test(layer.name)) {
    return "information";
  }
  if (/^(?:grid-solid|White Solid 1|background)/i.test(layer.name)) return "background";
  if (/^(?:Linked Quad|lens matte|▾.*stroke runs)/i.test(layer.name)) return "overlay";
  return "content";
}

function remapLayerControl(node: unknown, oldToNew: Map<number, number>): void {
  if (!node || typeof node !== "object") return;
  const n = node as {
    matchName?: string;
    value?: unknown;
    keys?: { v?: unknown }[];
    properties?: unknown[];
  };
  if (n.matchName === "ADBE Layer Control-0001") {
    const remap = (value: unknown): number | unknown => {
      if (typeof value !== "number" || value === 0) return value;
      const mapped = oldToNew.get(value);
      if (mapped === undefined) throw new Error("Layer Control refers to missing old index " + value);
      return mapped;
    };
    if (n.value !== undefined) n.value = remap(n.value);
    for (const key of n.keys ?? []) if (key.v !== undefined) key.v = remap(key.v);
  }
  for (const child of n.properties ?? []) remapLayerControl(child, oldToNew);
}

// Preserve all visual Z-order and parent/control relationships while adding
// FoldLayers-compatible divider layers at contiguous role boundaries.
// The runtime adds FD-0 (and optional FD-H) to every divider's Shape Contents.
export function withFoldGroups(layers: readonly LayerSpec[], duration: number): LayerSpec[] {
  const output: LayerSpec[] = [];
  const oldToNew = new Map<number, number>();
  let previous: LayerRole | undefined;
  let ordinal = 0;
  for (const original of layers) {
    const role = original.role ?? classifyLayer(original);
    if (role === "divider") throw new Error("source stack already contains an explicit FoldLayers divider");
    if (role !== previous) {
      ordinal++;
      output.push(foldDivider(role, ordinal, duration));
      previous = role;
    }
    const layer: LayerSpec = { ...structuredClone(original), role, label: ROLE_LABELS[role] };
    if (oldToNew.has(original.index)) throw new Error("duplicate old layer index " + original.index);
    output.push(layer);
    oldToNew.set(original.index, output.length);
  }
  for (const layer of output) {
    layer.index = output.indexOf(layer) + 1;
    if (layer.parentIndex !== undefined && layer.parentIndex !== null) {
      const mapped = oldToNew.get(layer.parentIndex);
      if (mapped === undefined) throw new Error("parent refers to missing old index " + layer.parentIndex);
      layer.parentIndex = mapped;
    }
    remapLayerControl(layer.effects, oldToNew);
  }
  return output;
}
