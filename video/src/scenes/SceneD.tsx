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
type Clip = {
  srcStart: number; // seconds into the source at clip start
  dur: number; // window frames this clip occupies
};
type Win = {
  file: string;
  clips: Clip[]; // played back-to-back inside the window; sum(dur) must
  // equal fOut - fIn. A second clip is a jump cut to a later segment of
  // the same recording so the window keeps showing new content.
  roi: Roi; // source-pixel crop region (1920x1080 space)
  x: number;
  y: number;
  w: number;
  h: number;
  fIn: number; // PV-Master frames
  fOut: number;
  caption: string;
  filter?: string; // per-window contrast treatment override
  // Optional picture-in-picture callout: a second crop of the SAME
  // footage timeline (same clips), positioned inside the window. Used to
  // show the operation UI (e.g. the Restro panel button) at readable
  // size — still real footage, no fake UI.
  inset?: { roi: Roi; x: number; y: number; w: number; h: number; tag?: string };
};

// r29 segment re-pick (frame-accurate decode, see verification/wu-d-r29/src):
//
//   ae-decompose-ops: the before->after swap is a 2-frame event at
//   source f886-887 (t~36.9). Before it: static single "Restro" text
//   (f861-885). After it: decomposed strokes + rgb controls, then stepped
//   part-adjustments at f954/957/990/991/1000/1030/1073 (t39.7-44.7) — all
//   localized to the artwork band x~680-1110,y~210-500.
//   ae-stroke-animate: NOT continuous motion — stepped jumps at
//   f546/582/622/665/750 (t22.75/24.33/25.92/27.71/31.25) inside the same
//   artwork band; long static stretches between. W2 is placed to contain
//   two jumps (f622, f665).
//   ae-reprocess: the reprocess arc is f120-170 (t5.0-7.1): partial
//   redraw -> "Executing" dialog (x~800-1100,y~496-603, measured) ->
//   COMPLETE "Restro". W4's roi bottom is y460 so the wait dialog is
//   cropped out; only the redraw->result arc is shown.
const WINDOWS: Win[] = [
  {
    // W1 main: ae-decompose-ops — clip A (35.9s, 52f): single "Restro"
    // text -> Decompose swap at source f886 -> stroke result. clip B
    // (40.9s, 37f): jump cut to the stepped part-adjustment phase
    // (source events f990/991/1000 land at +0.3-0.8s of clip B) so the
    // window keeps changing instead of freezing on the result.
    file: "ae-decompose-ops.mp4",
    clips: [
      { srcStart: 35.9, dur: 52 },
      { srcStart: 40.9, dur: 37 },
    ],
    // comp viewer + controls (x500-1650,y90-710); the Restro plugin panel
    // itself (x35-235) is too far left to share this crop readably, so it
    // is shown via the PiP inset below instead.
    roi: { x: 500, y: 90, w: 1150, h: 620 },
    x: 500,
    y: 120,
    w: 560,
    h: 315,
    fIn: 281,
    fOut: 370,
    caption: "分解 — 文字が筆画シェイプに",
    // PiP callout: Restro panel bottom (Decompose action row). The press
    // is real — source f885 flips the button band (x0-200,y386-412) and
    // it stays in the executed state; the inset makes it readable.
    inset: {
      roi: { x: 0, y: 250, w: 320, h: 230 },
      x: 12,
      y: 178,
      w: 190,
      h: 130,
      tag: "Restroパネル",
    },
  },
  {
    // W2 aux: ae-stroke-animate 25.6s — stepped stroke motion; window
    // contains jumps at source f622 (+0.33s) and f665 (+2.1s).
    file: "ae-stroke-animate.mp4",
    clips: [{ srcStart: 25.6, dur: 59 }],
    // tight crop on the decomposed-artwork band (motion measured at
    // source x~678-1057,y~213-363) so strokes stay legible at aux size
    roi: { x: 630, y: 165, w: 500, h: 340 },
    x: 500,
    y: 480,
    w: 270,
    h: 200,
    fIn: 297,
    fOut: 356,
    caption: "筆画ごとの動き",
  },
  {
    // W3 aux: ae-decompose-ops — clip A (40.7s, 26f): stepped adjustment
    // burst (source f990/991/1000 = t~41.3-41.7). clip B (43.8s, 22f):
    // jump cut to the next adjustment step (source f1057/1058 land at
    // +0.25s) so the tail is not a frozen result.
    file: "ae-decompose-ops.mp4",
    clips: [
      { srcStart: 40.7, dur: 26 },
      { srcStart: 43.8, dur: 22 },
    ],
    roi: { x: 630, y: 165, w: 500, h: 340 },
    x: 800,
    y: 480,
    w: 260,
    h: 200,
    fIn: 313,
    fOut: 361,
    caption: "分解シェイプのパーツ調整",
  },
  {
    // W4 aux: ae-reprocess 5.4s — strokes trace/redraw into "Restro",
    // COMPLETE lands ~t6.5-7.0 (source f156-168 = +26-38f into the window)
    // so the finished result holds ~0.5s before the exit fade. The
    // "Executing" wait dialog (source y~496-603) is excluded by the roi
    // bottom edge (y460); only the redraw->result arc is visible.
    file: "ae-reprocess.mp4",
    clips: [{ srcStart: 5.4, dur: 45 }],
    // artwork-only crop: "Restro" trace (x566-1066,y207-393) with margin;
    // dialog region below y460 is outside the frame
    roi: { x: 530, y: 170, w: 580, h: 290 },
    x: 500,
    y: 698,
    w: 480,
    h: 270,
    fIn: 320,
    fOut: 365,
    caption: "再処理 — 筆画の再構成",
    // Reprocess footage is near-white (p50 luma ~242); needs a stronger
    // pull to keep the traced strokes and the completed "Restro" legible.
    filter: "contrast(1.5) brightness(0.97) saturate(1.15)",
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
  const filt = win.filter ?? "contrast(1.24) brightness(1.05) saturate(1.3)";
  const clipSeqs = (viewRoi: Roi, vw: number, vh: number) => {
    const vb = coverBox(viewRoi, vw, vh);
    return win.clips.map((clip, i) => {
      const from =
        win.fIn + win.clips.slice(0, i).reduce((a, c) => a + c.dur, 0);
      return (
        <Sequence key={i} from={from} durationInFrames={clip.dur} layout="none">
          <div
            style={{
              position: "absolute",
              left: vb.left,
              top: vb.top,
              width: vb.width,
              height: vb.height,
              // Screen captures render low-contrast at window size; lift
              // them so strokes/anchors stay legible (r29 fix).
              filter: filt,
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
    });
  };
  return (
    <div
      style={{
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        opacity,
        transform: `translateY(${(1 - pin) * 12}px) scale(${0.985 + 0.015 * pin})`,
        transformOrigin: "50% 50%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          border: "1px solid rgba(15,15,15,0.45)",
          background: "#0c0c0c",
        }}
      >
        {clipSeqs(win.roi, win.w, win.h)}
      </div>
      {win.inset && (
        <div
          style={{
            position: "absolute",
            left: win.inset.x,
            top: win.inset.y,
            width: win.inset.w,
            height: win.inset.h,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.55)",
            background: "#0c0c0c",
            boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
          }}
        >
          {clipSeqs(win.inset.roi, win.inset.w, win.inset.h)}
          {win.inset.tag && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                padding: "1px 5px",
                fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                color: "#111",
                background: "rgba(255,255,255,0.85)",
              }}
            >
              {win.inset.tag}
            </div>
          )}
        </div>
      )}
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
            分解・動き・調整・再処理を
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
