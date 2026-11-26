import analysis from "../music-analysis.json" with { type: "json" };

// Frame-accurate music sync points for PV-Full (24fps).
// Derived from tools/analyze-music.ts output (spectral-flux onset strengths,
// RMS sections). Only major visual events are locked to musical accents —
// per-stroke motion stays free-running per the spec (Issue #29 §4).

export const FPS = 24;
export const sec2frame = (t: number): number => Math.round(t * FPS);

export const MUSIC = {
  // first accent — glyph entrance settle
  hookAccent: sec2frame(0.21),
  // beat under the stroke burst
  explodeHit: sec2frame(0.56),
  // accent as strokes reassemble
  rejoinHit: sec2frame(2.42),
  // strongest accent inside the reveal window (contour break peak)
  revealPeak: sec2frame(5.67),
  // section boundary 7.0s — separation resolves into numbered proof
  section7: sec2frame(7.0),
  // accent just after the AE cut
  proofIn: sec2frame(7.55),
  // accent under the apply-act burst
  applyHit: sec2frame(9.89),
  // section boundary 14.5s — palette drop lands here
  paletteHit: sec2frame(14.5),
  // strongest accent in the apply hold — dance peak
  danceHit: sec2frame(14.58),
  // accent under the CTA logo entrance
  ctaHit: sec2frame(17.39),
  // final accent — end-card lock
  endHit: sec2frame(19.74),
} as const;

export const SECTION_BOUNDS = analysis.sectionsSec.map(sec2frame);
