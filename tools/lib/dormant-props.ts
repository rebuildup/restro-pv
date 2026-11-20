// Shared dormant/hidden property rules used by BOTH tools/convert-dump.ts
// (which drops them from the generated spec) and tools/compare-aep.ts (which
// must not flag them as missing, because AE refuses writes to them — they
// cannot exist in a generated project no matter what the spec says).
//
// Every rule here must be justified by an observed AE behavior; keep the
// evidence in comments.

export interface DormantPropNode {
  matchName?: string;
  properties?: DormantPropNode[];
  keys?: unknown[];
  expression?: string;
  value?: unknown;
}

// 3D-only transform channels: hidden on 2D layers, setValue fails with
// "property or a parent property is hidden".
export const THREE_D_ONLY = new Set(["ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y"]);
export const THREE_D_GROUPS = new Set<string>();

// Unconditionally dormant: hidden in AE regardless of layer dimensionality.
// Verified against the source dump and the generated project:
//   - 'ADBE Vector Materials Group' (Vec3D material params): all 107,520 leaf
//     values across the source project are the AE defaults (48 distinct
//     matchName=value pairs, one value each). setValue fails "hidden" even on
//     3D layers because the material Type is None.
//   - 'ADBE Envir Appear in Reflect': all 4,513 occurrences hold the default
//     value 1 and setValue fails "hidden" even on 3D layers.
export const ALWAYS_DORMANT = new Set([
  "ADBE Vector Materials Group",
  "ADBE Envir Appear in Reflect",
]);

// Prune-only dormant nodes: hidden in generated projects so writes always
// fail, but NOT absorbed by the comparator — generated AEPs auto-create the
// same nodes with AE defaults, so dump-to-dump value comparison still
// detects any authored value that could not be reproduced (e.g. the two
// strokes with non-default dash patterns).
//   - 'ADBE Vector Stroke Dashes'/'Taper'/'Wave': AE hides every child until
//     the feature is added in the UI; all values in the source project are
//     defaults except 12 dash values on 2 layers.
//   - 'ADBE Vector Star Inner Radius'/'Inner Roundess': hidden while the
//     star type keeps them inapplicable; observed values equal AE defaults.
export const PRUNE_ONLY = new Set([
  "ADBE Vector Stroke Dashes",
  "ADBE Vector Stroke Taper",
  "ADBE Vector Stroke Wave",
  "ADBE Vector Star Inner Radius",
  "ADBE Vector Star Inner Roundess",
]);

// Text properties that AE keeps in the tree but hides until the feature is
// actually used (text-on-a-path, variable fonts). Writing them is a hard
// "hidden property" failure. They are dropped only when the whole subtree is
// dormant: no keyframes, no expression, and every leaf still holds the AE
// default observed in the source dump. A non-default value keeps the node so
// the runtime reports it instead of silently losing authored state.
export const TEXT_DORMANT_DEFAULTS: Record<string, unknown> = {
  "ADBE Text Path": 0,
  "ADBE Text Reverse Path": 0,
  "ADBE Text Perpendicular To Path": 1,
  "ADBE Text Force Align Path": 0,
  "ADBE Text First Margin": 0,
  "ADBE Text Last Margin": 0,
  "ADBE Text Variable Font Spacing": 1,
};
export const TEXT_DORMANT_GROUPS = new Set(["ADBE Text Path Options"]);

export function subtreeDormant(node: DormantPropNode): boolean {
  if (node.keys && node.keys.length > 0) return false;
  if (node.expression) return false;
  const kids = node.properties ?? [];
  if (kids.length > 0) return kids.every(subtreeDormant);
  const d = TEXT_DORMANT_DEFAULTS[node.matchName ?? ""];
  return d !== undefined && node.value === d;
}

export function isDormantTextNode(node: DormantPropNode): boolean {
  const mn = node.matchName ?? "";
  return (
    (TEXT_DORMANT_GROUPS.has(mn) || TEXT_DORMANT_DEFAULTS[mn] !== undefined) && subtreeDormant(node)
  );
}

// Audio-only footage layers have no visual property surface in AE: every
// transform/mask/effect/shape/text write fails as "hidden". Detected from the
// layer's footage source flags (hasAudio && !hasVideo).
export function isAudioOnlyLayer(
  src: { hasVideo?: boolean; hasAudio?: boolean } | null | undefined,
): boolean {
  return !!src && src.hasVideo === false && src.hasAudio === true;
}
