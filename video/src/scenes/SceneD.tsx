import React from "react";
import { Sequence, Video, staticFile } from "remotion";

// Scene D [281,371) per SPEC §5 D: asynchronous multi-window showing real
// After Effects operations. The dumped "PV ops" comp is hidden (masterPatch
// D_HIDDEN) and this scene authors the whole layout:
//
//   Left column : authored copy 「After Effectsで、／そのまま動かせる。」
//                 (SPEC §4 D). The dumped description block for D is
//                 clamped at the cut, so nothing collides here.
//   Right zone  : four footage windows on a shared grid, staggered
//                 enter/exit — W1 large (decompose before->after inside
//                 one recording), W2/W3/W4 smaller auxiliaries.
//
// Footage is 1920x1080 screen capture. Each window uniformly scales the
// source and crops through `roi` (source-pixel rect) inside an
// overflow-hidden frame — no distortion, subject stays visible.
// Segment picks and legibility notes: verification/wu-d-mat/SEGMENTS.md.

const T0 = 281 / 24;
const T1 = 371 / 24;
const FPS = 24;

type Roi = { x: number; y: number; w: number; h: number };
type Win = {
  file: string;
  srcStart: number; // seconds into the source at window open
  roi: Roi; // source-pixel crop region (1920x1080 space)
  x: number;
  y: number;
  w: number;
  h: number;
  fIn: number; // PV-Master frames
  fOut: number;
  caption: string;
};

const WINDOWS: Win[] = [
  {
    // W1 main: ae-decompose-ops 35.9s — single "Restro" text -> Decompose
    // completes -> four stroke shape layers with red/green/blue controls.
    // The before->after transition lands ~1s into the window.
    file: "ae-decompose-ops.mp4",
    srcStart: 35.9,
    // comp viewer (x530-1074,y111-583) + Restro panel (x1334-1609,y520-632)
    roi: { x: 500, y: 90, w: 1150, h: 620 },
    x: 500,
    y: 120,
    w: 560,
    h: 315,
    fIn: 281,
    fOut: 368,
    caption: "分解 — 文字が筆画シェイプに",
  },
  {
    // W2 aux: ae-stroke-animate 25.0s — generated strokes visibly moving
    // across the decomposed "Restro" (animation phase).
    file: "ae-stroke-animate.mp4",
    srcStart: 25.0,
    // comp viewer artwork (x532-1075,y109-588); strokes+anchors fill it
    roi: { x: 480, y: 130, w: 680, h: 540 },
    x: 500,
    y: 480,
    w: 270,
    h: 200,
    fIn: 297,
    fOut: 359,
    caption: "筆画ごとの動き",
  },
  {
    // W3 aux: ae-stroke-animate 22.7s — control-point / path editing with
    // red anchors before the strokes start moving (edit phase).
    file: "ae-stroke-animate.mp4",
    srcStart: 22.7,
    roi: { x: 480, y: 130, w: 680, h: 540 },
    x: 800,
    y: 480,
    w: 260,
    h: 200,
    fIn: 313,
    fOut: 365,
    caption: "制御点の編集",
  },
  {
    // W4 aux: ae-reprocess 5.0s — strokes trace/redraw into "Restro",
    // "Executing" dialog appears ~1s in, result completes by ~1.5s.
    // (Verified against frame-accurate decode: the t26-33 "redraw" seen in
    // earlier -ss grabs was a seek artifact; real arc is t5.0-7.0.)
    file: "ae-reprocess.mp4",
    srcStart: 5.0,
    // artwork+dialog: "Restro" trace (x566-1066,y207-393), Executing dialog
    // (x826-1098,y471-603), result completes ~t6.5-7. Tight roi keeps the
    // dialog box and strokes large enough to read at aux size.
    roi: { x: 460, y: 200, w: 740, h: 420 },
    x: 500,
    y: 698,
    w: 480,
    h: 270,
    fIn: 320,
    fOut: 370,
    caption: "再処理 — 結果を再構成",
  },
];

const SRC_W = 1920;
const SRC_H = 1080;

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

const FootageWindow: React.FC<{ win: Win; t: number }> = ({ win, t }) => {
  const tIn = win.fIn / FPS;
  const tOut = win.fOut / FPS;
  const pin = smooth(ramp(t, tIn, tIn + 0.22));
  const pout = 1 - smooth(ramp(t, tOut - 0.28, tOut));
  const opacity = Math.min(pin, pout);
  if (opacity <= 0) return null;
  const box = coverBox(win.roi, win.w, win.h);
  return (
    <div
      style={{
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        overflow: "hidden",
        border: "1px solid rgba(15,15,15,0.45)",
        background: "#0c0c0c",
        opacity,
        transform: `translateY(${(1 - pin) * 12}px) scale(${0.985 + 0.015 * pin})`,
        transformOrigin: "50% 50%",
      }}
    >
      <Sequence
        from={win.fIn}
        durationInFrames={win.fOut - win.fIn}
        layout="none"
      >
        <div
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        >
          <Video
            src={staticFile(`assets/rec/${win.file}`)}
            trimBefore={Math.round(win.srcStart * FPS)}
            muted
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>
      </Sequence>
      {/* operation caption, inside the top edge so it never collides with
          the window below or the left column */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          padding: "2px 8px",
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          fontSize: 17,
          fontWeight: 700,
          color: "#f5f5f5",
          background: "rgba(10,10,10,0.72)",
          opacity: pin,
          whiteSpace: "nowrap",
        }}
      >
        {win.caption}
      </div>
    </div>
  );
};

export const SceneD: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;

  // Left column copy (SPEC §4 D). Fades in with the scene and holds to the
  // D->E boundary; the dumped description block is clamped at 11.708 so
  // this is the only scene copy on the left.
  const copyIn = smooth(ramp(t, T0, T0 + 0.3));
  // Seam fix (WU-INT): the fade used to run all the way to T1, leaving a
  // ~7%-opacity multi-line ghost at f370 that read as residue at the D->E
  // cut. End the fade ~0.12s before the boundary so the last D frames are
  // clean; the footage windows carry the scene tail on their own.
  const copyOut = 1 - smooth(ramp(t, T1 - 0.45, T1 - 0.12));
  const copyOpacity = copyIn * copyOut;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {copyOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: 44,
            // brand lockup (Restro/筆画復元) bottom edge is ~y550; keep a
            // clear gap — r25 failed on perceived collision at y596.
            top: 648,
            width: 400,
            opacity: copyOpacity,
            transform: `translateY(${(1 - copyIn) * 10}px)`,
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
            color: "#111",
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.5 }}>
            After Effectsで、
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.5 }}>
            そのまま動かせる。
          </div>
          <div style={{ marginTop: 18, fontSize: 20, fontWeight: 500, color: "#444", lineHeight: 1.5 }}>
            分解・筆画の編集・再処理を
            <br />
            実際の画面で収録
          </div>
        </div>
      )}
      {WINDOWS.map((w) => (
        <FootageWindow key={w.file + w.fIn} win={w} t={t} />
      ))}
    </div>
  );
};
