// Issue #30 fixed-layout contract — the single authority for the common
// composition. See docs/issue30-recovery.md.
//
// CONFIRMED (not defaults, not suggestions): the thumbnail design and the
// recovered production layout — shared background/grid, brand lockup,
// left information column, right content stage, overall placement,
// visual hierarchy and scale relationships. These are owned exclusively
// by video/src/layout/ (Chrome + LeftCopy + the dumped master comp via
// ae/masterPatch). Changing them requires an explicit owner decision.
//
// VARIABLE: only the right-stage scene content (video/src/scenes/*,
// supplied through Stage.tsx). Scenes may still paint anywhere on
// screen — PvLeftGuard/PvChromeOverlay repaint the confirmed chrome
// above them, so bleed outside the stage is preserved visually while
// the confirmed layout cannot be damaged. Scene code must not own or
// re-implement the common layout, the left column, the brand, or the
// background.
//
// Boundary values are DERIVED from the grid rig (design/rig.ts
// GridRef.safetyZone), not restated as magic numbers: the left-column
// edge is the right edge of columns 0..4 plus one gutter, and the stage
// minimum is the confirmed stage column start. A grid change therefore
// propagates to the layout boundary through the same evaluation path
// the rest of the rig uses (tools/design/verify-local-motion.ts checks
// marginX perturbation moves all left-column descendants by the same
// delta). The recovered production values are reproduced exactly:
// gapLeft ≈ 460.33 -> LEFT_COLUMN_MAX_X = 460, stageMinX = 480.
// Scene-internal stage insets (SceneB VIEW.x=468, SceneC WIN_X=480,
// SceneD/E stage x=480) are content placement inside the stage, not the
// column boundary, and stay scene-owned.

import { GridRef, MASTER_GRID } from "../design/rig.ts";

const grid = new GridRef(MASTER_GRID);
const safety = grid.safetyZone;

/** Right edge of the left information column (brand + copy). */
export const LEFT_COLUMN_MAX_X = Math.round(safety.gapLeft); // 460

/** Nominal left edge of the right-stage content area (SPEC §4). */
export const STAGE_MIN_X = safety.stageMinX; // 480

/** Safety gap between the columns; meaningful content stays out of it. */
export const COLUMN_GAP: readonly [number, number] = [
  LEFT_COLUMN_MAX_X,
  STAGE_MIN_X,
];
