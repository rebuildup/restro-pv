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
// INTERIM STATE: ae-decompose-ui.mp4 is not yet recorded (requires real
// AE + Ae_Restro). W_main keeps the previous curated clip
// ae-decompose-auto.mp4 so the layout is reviewable, but that file is a
// rendered comp WITHOUT AE UI — the audit marks it "[x Scene D として不適]"
// and it is NOT proof of real operation. W_inset renders an explicit
// placeholder panel. Dropping in the real take only requires wiring
// WIN_MAIN.file/roi/clips and WIN_INSET.file/roi below — geometry,
// frames, labels, and timing do not change.

const T0 = 281 / 24;
const T1 = 371 / 24;
const FPS = 24;
const F_IN = Math.round(T0 * FPS); // 281 — first frame of the D window

type Roi = { x: number; y: number; w: number; h: number };
type Clip = {
  srcStart: number; // seconds into the source at clip start
  dur: number; // window frames this clip occupies
};

const SRC_W = 1920;
const SRC_H = 1080;

// Interim ROI for ae-decompose-auto.mp4 (r36b ink-bounds measurement):
// the 1280x720 comp places the kanji high, ink occupies x400-878 y0-432.
// This ROI hugs that content box. It MUST be re-measured against real
// frames of ae-decompose-ui.mp4 once recorded (runbook §3.4 — the old
// 1920x1080 measurements came from a different UI scale).
const ROI_AUTO: Roi = { x: 370, y: 0, w: 560, h: 470 };

// Frame + label spec (05 §3 / runbook §3.4): 1.5-2px dark frame
// (#18181b / #3f3f46 — the old #ebebf0 matte disappears on the #f7f7f7
// recording background) plus a modest coordinate label per window.
const FRAME_COLOR = "#3f3f46";
const FRAME_W = 2;
const LABEL_COLOR = "#8a8a8a";
const LABEL_FONT = "ui-monospace, 'Cascadia Mono', Consolas, monospace";

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
  // INTERIM: placeholder footage until ae-decompose-ui.mp4 is recorded.
  // One continuous take, 0.3s before-text hold -> trigger -> ~1.3s of
  // stroke materialization -> held result. Replace with the real take's
  // measured ROI/clips per runbook §3.4/§3.6.
  file: "ae-decompose-auto.mp4",
  roi: ROI_AUTO,
  clips: [{ srcStart: 1.3, dur: 90 }],
  // Light-BG footage — the old heavy grade tuned for dark checkerboard
  // capture would crush this material.
  filter: "contrast(1.03) saturate(1.05)",
};

const WIN_INSET: WindowSpec = {
  id: "W_INSET",
  x: STAGE_MIN_X,
  y: 624,
  w: 600,
  h: 396,
  // INTERIM: the inset crops the SAME take as the main window, tighter on
  // the ink, so the film never shows a development message. When the real
  // take (ae-decompose-ui.mp4) lands, this must be re-measured to the
  // Restro panel + STROKE_* close-up per runbook §3.4/§3.6.
  file: "ae-decompose-auto.mp4",
  roi: { x: 430, y: 40, w: 440, h: 300 },
  clips: [{ srcStart: 1.55, dur: 90 }],
  filter: "contrast(1.03) saturate(1.05)",
};

const WINDOWS: WindowSpec[] = [WIN_MAIN, WIN_INSET];

const ramp = (t: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

// Uniform-scale cover of `roi` inside w x h, then center the roi. Returns
// the inner video box (source pixel size * scale) and its offset.
function coverBox(roi: Roi, w: number, h: number) {
  const s = Math.max(w / roi.w, h / roi.h);
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
  const vb = coverBox(win.roi, innerW, innerH);
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
      {/* coordinate label, above the frame (05 §3: 控えめな座標ラベル) */}
      <div
        style={{
          position: "absolute",
          left: win.x,
          top: win.y - 18,
          fontFamily: LABEL_FONT,
          fontSize: 12,
          letterSpacing: 1.6,
          color: LABEL_COLOR,
          whiteSpace: "nowrap",
        }}
      >
        {`${win.id} · ${win.x},${win.y} · ${win.w}×${win.h}`}
      </div>
      {/* dark frame + clipped content */}
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
  const pin = smooth(ramp(t, T0, T0 + 0.22));
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
