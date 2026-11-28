// Staging for Scene C's three gallery works (video/src/scenes/SceneC.tsx).
//
// The three works must not read as three versions of the same specimen —
// one character, centred, on a flat ground, captioned underneath. Each work
// therefore gets its OWN kind of space, its OWN composition and its OWN
// motion law, and the three must be visibly different from each other:
//
//   01 墨帖 — SHEET. A copybook sheet lying askew on a dark desk,
//     photographed from above. The sheet itself carries the structure
//     (ruled guide lines, a vermilion margin rule, a 筆順 score column in
//     the margin) and it casts a shadow, so the frame holds an object in a
//     space rather than a character on a background. The character is
//     written in the column right of the margin, off the centre of the
//     frame.
//     Motion law: WRITING — the ink is laid down along the direction the
//     brush travelled, in the true writing order.
//
//   02 深解 — STAGE. A dark room with a floor and a horizon. The
//     character's own structural parts (角 / 刀 / 牛) are three separate
//     plates held at three depths; they come apart in the order the
//     character is written — the far part recedes and dims, the near part
//     advances and grows — and the room gives the separation somewhere to
//     happen.
//     Motion law: SEPARATION — by the character's own structure.
//
//   03 飛白 — FIELD. An open dusk field with a light direction. The twelve
//     strokes are independent objects in flight: they arrive along their
//     own paths with the air still moving behind them, and one of them
//     leaves the character and goes on alone across the field.
//     Motion law: FREE MOVEMENT — the strokes as independent objects.

/** The kind of space a gallery work is staged in. */
type SceneCGround = "sheet" | "stage" | "field";

/** The law that drives a work's motion. */
type SceneCMotion = "write" | "separate" | "drift";

export interface SceneCWork {
  /** the kind of space the work is staged in */
  ground: SceneCGround;
  /** the law that drives the work's motion */
  motion: SceneCMotion;
  /** cell-space position of the measured character bbox centre */
  anchor: [number, number];
  /** on-screen width the measured bbox is fitted to */
  fitW: number;
  /** the cell's base colour */
  base: string;
  /** gallery footer ink */
  titleInk: string;
  /** gallery footer hairline */
  ruleInk: string;
  /** ink colour of the strokes (0..1 rgb) */
  ink: [number, number, number];
}

/** 墨帖 — the copybook page. */
export const SHEET_WORK: SceneCWork = {
  ground: "sheet",
  motion: "write",
  anchor: [334, 375],
  fitW: 320,
  base: "#241f1a",
  titleInk: "#ece7db",
  ruleInk: "#5b5346",
  ink: [0.09, 0.088, 0.082],
};

/** 深解 — the dark stage. */
export const STAGE_WORK: SceneCWork = {
  ground: "stage",
  motion: "separate",
  anchor: [272, 245],
  fitW: 372,
  base: "#0b0d12",
  titleInk: "#eceae2",
  ruleInk: "#3a3d46",
  ink: [0.96, 0.94, 0.9],
};

/** 飛白 — the open field. */
export const FIELD_WORK: SceneCWork = {
  ground: "field",
  motion: "drift",
  anchor: [250, 250],
  fitW: 420,
  base: "#121821",
  titleInk: "#e8e6df",
  ruleInk: "#3c444f",
  ink: [0.07, 0.075, 0.085],
};

// ---------------------------------------------------------------------------
// SHEET — the copybook page.
// ---------------------------------------------------------------------------

export interface SheetGround {
  /** the lit paper tone at the top-left of the sheet */
  paperHi: string;
  /** the mid paper tone */
  paper: string;
  /** the shaded paper tone at the bottom-right */
  paperLo: string;
  /** the copybook's guide lines */
  rule: string;
  /** the vermilion margin rule of the copybook */
  marginRule: string;
  /** the ink of the 筆順 score column */
  score: string;
  /** the vermilion seal */
  seal: [number, number, number];
  /** vertical pitch of the horizontal guide lines (sheet px) */
  rulePitch: number;
  /** y of the first guide line — the written column stands on it */
  ruleTop: number;
  /** x of the vermilion margin rule */
  marginX: number;
  /** x of the 筆順 score column */
  scoreX: number;
  /** x of the writing column's own rules (the column the work stands in) */
  columnX: number[];
  /** the desk the sheet lies on */
  desk: string;
  deskLight: string;
  /** the sheet's own size and place, in cell px */
  width: number;
  height: number;
  /** the sheet's centre in cell px */
  center: [number, number];
  /** how far the sheet lies askew on the desk (deg) */
  tilt: number;
  /** the sheet's shadow on the desk */
  shadow: string;
}

export const SHEET_GROUND: SheetGround = {
  paperHi: "#fdfbf3",
  paper: "#f6f1e4",
  paperLo: "#e3dbc4",
  rule: "#d8cfb4",
  marginRule: "#b5432f",
  score: "#a79d88",
  seal: [0.78, 0.16, 0.12],
  rulePitch: 66,
  ruleTop: 40,
  marginX: 34,
  scoreX: 58,
  columnX: [100, 470],
  desk: "#2b251e",
  deskLight: "#5c5343",
  width: 520,
  height: 700,
  center: [310, 415],
  tilt: -7,
  shadow: "26px 30px 54px rgba(16,11,4,0.45), 0 2px 7px rgba(16,11,4,0.34)",
};

// ---------------------------------------------------------------------------
// STAGE — the dark room.
// ---------------------------------------------------------------------------

export interface StageGround {
  /** y of the floor/void horizon (cell px) */
  horizon: number;
  /** the floor just under the horizon */
  floorFar: string;
  /** the floor nearest the camera */
  floorNear: string;
  /** the lamp glow in the upper-left of the room */
  lamp: string;
  /** one value per structural part, far -> near (atmospheric perspective) */
  partRGB: [number, number, number][];
}

export const STAGE_GROUND: StageGround = {
  horizon: 470,
  floorFar: "#191d26",
  floorNear: "#080a0e",
  lamp: "rgba(146,166,206,0.16)",
  partRGB: [
    [0.42, 0.45, 0.52],
    [0.7, 0.72, 0.77],
    [0.96, 0.94, 0.9],
  ],
};

/**
 * How each structural part leaves the character (screen px).
 *
 * The order is the writing order: 角 is written first and recedes, 刀 holds
 * the middle, 牛 is written last and comes forward. Each part also tilts
 * a little, so the three read as separate plates rather than as one glyph
 * that has been sliced.
 */
export const STAGE_PARTS: {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  blur: number;
}[] = [
  { dx: -44, dy: -30, scale: 0.88, rot: -4, blur: 1.6 },
  { dx: 4, dy: -8, scale: 1.0, rot: 1.5, blur: 0 },
  { dx: 50, dy: 34, scale: 1.12, rot: 4, blur: 0 },
];

// ---------------------------------------------------------------------------
// FIELD — the open dusk field.
// ---------------------------------------------------------------------------

export interface FieldGround {
  /** the sky at the top of the frame */
  skyTop: string;
  /** the sky just above the horizon */
  skyLow: string;
  /** the field just below the horizon */
  groundFar: string;
  /** the field nearest the camera */
  groundNear: string;
  /** y of the horizon (cell px) */
  horizon: number;
  /** the low sun at the left of the horizon — the light direction */
  sun: string;
  /** the sun's halo */
  sunGlow: string;
}

export const FIELD_GROUND: FieldGround = {
  skyTop: "#111721",
  skyLow: "#414c5a",
  groundFar: "#4e5866",
  groundNear: "#1c222a",
  horizon: 540,
  sun: "rgba(255,196,132,0.26)",
  sunGlow: "rgba(255,178,110,0.10)",
};

/**
 * The work's shadow on the field.
 *
 * The low sun is at the left of the horizon, so the shadow runs to the
 * right and is stretched along the ground; the higher up the stroke is,
 * the further its shadow lies from the character. That is what ties the
 * suspended strokes to the field they hang over.
 */
export interface FieldShadow {
  /** the screen y of the shadow's far end (cell px) */
  far: number;
  /** how much of the height the ground plane keeps */
  squash: number;
  /** how far the shadow runs sideways per unit of height */
  shear: number;
  /** the shadow's opacity */
  opacity: number;
  /** the shadow's softness */
  blur: number;
}

export const FIELD_SHADOW: FieldShadow = {
  far: 576,
  squash: 0.52,
  shear: 0.3,
  opacity: 0.24,
  blur: 11,
};

export interface FieldFlight {
  /** how far a stroke travels before it settles (comp px) */
  travel: number;
  /** how long one stroke takes to arrive (scene seconds) */
  arrival: number;
  /** the beat between the three structural groups of the character */
  groupBeat: number;
  /** the residual sway of the suspended character (cell px) */
  sway: number;
  /** when the departing stroke leaves (scene seconds, from the page turn) */
  flourishFrom: number;
  /** when the departing stroke has gone (scene seconds, from the page turn) */
  flourishTo: number;
  /** how far the departing stroke travels (screen px) */
  flourishDx: number;
  /** how far the departing stroke falls toward the field (screen px) */
  flourishDy: number;
}

export const FIELD_FLIGHT: FieldFlight = {
  travel: 250,
  arrival: 0.1,
  groupBeat: 0.075,
  sway: 5,
  flourishFrom: 0.655,
  flourishTo: 0.775,
  flourishDx: 130,
  flourishDy: 152,
};
