// Production theme — the single config file for visual organization of the
// generated project: label colors per section role, FoldLayers divider
// naming, and project-item label rules for material-AEP comps.
//
// AE label indices are 0=None, 1-16 preset colors (Labels preferences order).
// Keep every emitted layer/asset labeled so the timeline and project panel
// communicate each element's role at a glance (issue #15).

/** Section role -> AE label color. Unknown roles fall back to DEFAULT. */
export const ROLE_LABEL: Record<string, number> = {
  brand: 9, // blue
  copy: 13, // purple
  scene: 4, // green
  stage: 5, // teal
  overlay: 6, // orange
  guide: 15, // pink-ish (grid, rigs)
  audio: 8, // olive
};
export const DEFAULT_LABEL = 7; // yellow — uncategorized content
export const ANCHOR_LABEL = 15; // rig/guide anchors share the guide color
export const DIVIDER_LABEL = 0; // FoldLayers convention: dividers get None

export function labelForRole(role: string | undefined): number {
  if (!role) return DEFAULT_LABEL;
  return ROLE_LABEL[role] ?? DEFAULT_LABEL;
}

// ---- FoldLayers divider convention (rebuildup/Ae_FoldLayers) -----------------
// Divider = shape layer whose "ADBE Root Vectors Group" contains a vector
// group named FD-0 (unfolded) or FD-1 (folded), plus FD-H:<hierarchy> for
// nesting. Layer name shows the state: "▾(h) name" / "▸(h) name".
// Hierarchy scheme: top-level siblings "1".."9"+, children "/A".."/Z",
// then "/a".."/z", then roman-ish — mirrors the plugin's own allocator.

export const FOLD_PREFIX_UNFOLDED = "▾ ";
export const FOLD_PREFIX_FOLDED = "▸ ";

export function dividerStateName(folded: boolean, hierarchy: string, name: string): string {
  const prefix = folded ? FOLD_PREFIX_FOLDED : FOLD_PREFIX_UNFOLDED;
  return hierarchy ? `${prefix}(${hierarchy}) ${name}` : `${prefix}${name}`;
}

export function dividerStateStream(folded: boolean): string {
  return folded ? "FD-1" : "FD-0";
}

export function dividerHierarchyStream(hierarchy: string): string {
  return `FD-H:${hierarchy}`;
}

// ---- project item labels ------------------------------------------------------
// Material-AEP comps cannot carry spec entries, so they are labeled by name
// through ProjectSpec.itemLabels. Categories keep checkpoints/experiments
// visually distinct from shipping scene comps.

export const ITEM_LABEL_SCENE = 4; // green — shipping scene comps
export const ITEM_LABEL_WORK = 7; // yellow — working comps
export const ITEM_LABEL_TMP = 0; // none — throwaway checkpoints

export function materialCompLabel(name: string): number {
  if (/checkpoint|TMP_|tmp/i.test(name)) return ITEM_LABEL_TMP;
  if (/^(PV |master$|bunkai|description|kai-zoom|overlay|Heading|Logo|Lens|BG )/.test(name)) {
    return ITEM_LABEL_SCENE;
  }
  return ITEM_LABEL_WORK;
}
