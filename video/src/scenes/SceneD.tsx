import React from "react";
import { Sequence, Video, staticFile } from "remotion";
import { STAGE_MIN_X } from "../layout/zones.ts";

// Scene D [281,371) per SPEC §5 D + docs/design/05-cards-and-sheets.md §3:
// TWO-WINDOW model — the old async 4-window mosaic (W1..W4) is retired.
// One continuous real-AE-operation take is shown as:
//
//   W_main  (top,    ~600x540): full REC-D workspace — comp viewer +
//            timeline — so the causal chain SOURCE layer -> Decompose
//            press -> STROKE_* layers appear -> select/drag reads in a
//            single frame.
//   W_inset (bottom, ~600x396): zoomed crop of the Restro panel
//            (Decompose/Merge/Refine) and the generated STROKE_* layers
//            — the sync proof that the button press and the comp result
//            belong to the same take.
//
// Recording spec (authoritative): docs/design/09-scene-d-recording-handoff.md
// §3 — scratch comp REC-D 1280x720@24 on #f7f7f7, single 15-20s take,
// deliverable assets/rec/ae-decompose-ui.mp4. Footage audit that rejected
// every existing clip: docs/design/06-recordings-audit.md.
//
// Real take wired: assets/rec/ae-decompose-ui.mp4 is the 16.8s real-AE
// recording (2560x1440@24, verification/rec-d/take2 frames, log:
// verification/rec-d/decompose-log.txt). Causal moment is early in the
// take: SOURCE 筆 + [BG] hold, the Decompose click lands ~1s in, and the
// 13 STROKE_* layers fill the timeline over the next ~2s; selection and
// drag proof follow through ~12s.

const T0 = 281 / 24;
const T1 = 371 / 24;
const FPS = 24;
const F_IN = Math.round(T0 * FPS); // 281 — first frame of the D window

type Roi = { x: number; y: number; w: number; h: number };
type Clip = {
  srcStart: number; // seconds into the source at clip start
  dur: number; // window frames this clip occupies
};

const SRC_W = 2560;
const SRC_H = 1440;

// Measured on the real take (assets/rec/ae-decompose-ui.mp4, 2560x1440,
// 24fps, 16.8s — verification/rec-d/take2 frames, native capture res).
//
//   W_main  — the timeline's layer list, cropped so the row names are
//             legible: the one layer ("SOURCE 筆") becomes thirteen
//             "STROKE_*_runs4" rows. The character itself is unchanged by
//             the plugin, so it is the layer list that carries the proof
//             (the character is on screen throughout the rest of the film).
//             Cover-fit shows source x ~= 129..441 of the ROI (window
//             596x536 at scale ~1.914 crops ~124px off each side), which
//             keeps the "Layer Name" header (~x136) and every STROKE_*
//             name (~x155..310) inside the frame.
//   W_inset — the right-hand panel column: comp right edge, the effect
//             panels and the Restro button stack (Decompose ~y525,
//             Merge ~y710, Refine ~y896), cover-fit so all three buttons
//             sit inside the crop.
const ROI_MAIN: Roi = { x: 25, y: 950, w: 520, h: 280 };
const ROI_PANEL: Roi = { x: 1900, y: 350, w: 660, h: 740 };
// Two-beat clip: beat 1 = hold -> Decompose click -> STROKE_* appear;
// beat 2 = selection/drag proof later in the same take.
const TAKE_BEATS: Clip[] = [
  { srcStart: 4.2, dur: 50 },
  { srcStart: 10.6, dur: 40 },
];

// Frame + label spec (05 §3 / runbook §3.4): 1.5-2px dark frame
// (#18181b / #3f3f46 — the old #ebebf0 matte disappears on the #f7f7f7
// recording background) plus a modest coordinate label per window.
const FRAME_COLOR = "#3f3f46";
const FRAME_W = 2;

interface WindowSpec {
  id: string; // coordinate label prefix, e.g. "W_MAIN"
  x: number;
  y: number;
  w: number;
  h: number;
  // Footage wiring — set `file`/`roi`/`clips` when ae-decompose-ui.mp4
  // lands. `file === undefined` renders the placeholder panel instead.
  file?: string;
  roi?: Roi;
  clips?: Clip[];
  filter?: string;
  // how the roi is placed in the window: "cover" fills it (crops the
  // excess), "contain" fits the whole roi (letterboxes it)
  fit?: "cover" | "contain";
}

// Right-stage coordinates per runbook §3.4 (stage x = 480..1080):
//   W_main  y=60..600   -> 600x540
//   W_inset y=624..1020 -> 600x396
const WIN_MAIN: WindowSpec = {
  id: "W_MAIN",
  x: STAGE_MIN_X,
  y: 60,
  w: 600,
  h: 540,
  // The real take: the workspace with the character in the viewer and the
  // timeline below it — Decompose press, STROKE_* layers appearing, then
  // the selection/drag proof from later in the same take.
  file: "ae-decompose-ui.mp4",
  roi: ROI_MAIN,
  clips: TAKE_BEATS,
};

const WIN_INSET: WindowSpec = {
  id: "W_INSET",
  x: STAGE_MIN_X,
  y: 624,
  w: 600,
  h: 396,
  // The same take cropped to the panel column: all three Restro buttons
  // plus the cursor on Decompose. Cover-fit fills the landscape window
  // while keeping every button inside the vertical crop.
  file: "ae-decompose-ui.mp4",
  roi: ROI_PANEL,
  clips: TAKE_BEATS,
};

const WINDOWS: WindowSpec[] = [WIN_MAIN, WIN_INSET];

const ramp = (t: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

// Uniform-scale cover of `roi` inside w x h, then center the roi. Returns
// the inner video box (source pixel size * scale) and its offset.
function coverBox(roi: Roi, w: number, h: number, fit: "cover" | "contain" = "cover") {
  const s =
    fit === "contain" ? Math.min(w / roi.w, h / roi.h) : Math.max(w / roi.w, h / roi.h);
  return {
    scale: s,
    width: SRC_W * s,
    height: SRC_H * s,
    left: w / 2 - (roi.x + roi.w / 2) * s,
    top: h / 2 - (roi.y + roi.h / 2) * s,
  };
}

// One footage clip inside a window's inner viewport (content box is
// w-2*FRAME_W by h-2*FRAME_W). Returns null when the window has no
// footage wired — the caller renders the placeholder panel instead.
const WindowFootage: React.FC<{ win: WindowSpec }> = ({ win }) => {
  const innerW = win.w - FRAME_W * 2;
  const innerH = win.h - FRAME_W * 2;
  const clips = win.clips;
  if (!win.file || !win.roi || !clips?.length) return null;
  const vb = coverBox(win.roi, innerW, innerH, win.fit);
  return (
    <>
      {clips.map((clip, i) => {
        const from = F_IN + clips.slice(0, i).reduce((a, c) => a + c.dur, 0);
        return (
          <Sequence key={i} from={from} durationInFrames={clip.dur} layout="none">
            <div
              style={{
                position: "absolute",
                left: vb.left,
                top: vb.top,
                width: vb.width,
                height: vb.height,
                filter: win.filter,
              }}
            >
              <Video
                src={staticFile(`assets/rec/${win.file}`)}
                trimBefore={Math.round(clip.srcStart * FPS)}
                muted
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
          </Sequence>
        );
      })}
    </>
  );
};

// Explicit placeholder for a window whose runbook footage is not yet
// recorded. It is a neutral field with no text: a development message in
// the finished frame would read as a mistake in the film.
const WindowPlaceholder: React.FC<{ win: WindowSpec }> = ({ win }) => (
  <div
    style={{
      position: "absolute",
      left: FRAME_W,
      top: FRAME_W,
      width: win.w - FRAME_W * 2,
      height: win.h - FRAME_W * 2,
      background: "#f2f2f4",
    }}
  />
);

const DWindow: React.FC<{ win: WindowSpec }> = ({ win }) => {
  const hasFootage = Boolean(win.file && win.roi && win.clips?.length);
  return (
    <div>
      {/* dark frame + clipped content. The former coordinate label
          ("W_MAIN · 480,60 · 600×540") was a development annotation: in
          the finished frame it reads as a debug overlay rather than as
          part of the film, so it is gone. */}
      <div
        style={{
          position: "absolute",
          left: win.x,
          top: win.y,
          width: win.w,
          height: win.h,
          border: `${FRAME_W}px solid ${FRAME_COLOR}`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: FRAME_W,
            top: FRAME_W,
            width: win.w - FRAME_W * 2,
            height: win.h - FRAME_W * 2,
            overflow: "hidden",
            background: "#0c0c0c",
          }}
        >
          {hasFootage ? <WindowFootage win={win} /> : <WindowPlaceholder win={win} />}
        </div>
      </div>
    </div>
  );
};

export const SceneD: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;

  // No fade-out: art direction prefers hard cuts, and r34 review failed
  // the tail — a fading viewport lost the proof legibility exactly at the
  // scene's strongest result frame. The windows hold full opacity to the
  // D->E cut (f370 -> f371), matching the scene's hard-cut grammar.
  // The windows cross-dissolve with the outgoing gallery strip over the
  // last four frames before the nominal boundary, so the stage is never
  // empty at the cut.
  const pin = smooth(ramp(t, T0 - 4 / 24, T0));
  const opacity = pin;

  // Left-column copy is chrome-owned (video/src/layout/LeftCopy.tsx,
  // Issue #30) — scenes never paint the left information column.

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {opacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity,
            transform: `translateY(${(1 - pin) * 12}px) scale(${0.985 + 0.015 * pin})`,
            transformOrigin: "50% 50%",
          }}
        >
          {WINDOWS.map((win) => (
            <DWindow key={win.id} win={win} />
          ))}
        </div>
      )}
    </div>
  );
};
