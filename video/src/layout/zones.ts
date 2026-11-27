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
// Values are measured from the recovered production, not invented:
// SPEC §4 zone design, design-baseline §1, and the scene sources
// (SceneA2 clip x=460, SceneB VIEW.x=468, SceneC WIN_X=490,
// SceneD/E stage x=480; left copy anchored at left:44 inside x<460).

/** Right edge of the left information column (brand + copy). */
export const LEFT_COLUMN_MAX_X = 460;

/** Nominal left edge of the right-stage content area (SPEC §4). */
export const STAGE_MIN_X = 480;

/** Safety gap between the columns; meaningful content stays out of it. */
export const COLUMN_GAP: readonly [number, number] = [
  LEFT_COLUMN_MAX_X,
  STAGE_MIN_X,
];
