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
type Inset = {
  roi: Roi; // source-pixel crop region (1920x1080 space)
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: string;
  // Optional PV-master frame range restricting when the callout is
  // shown; defaults to the whole window. Used when a callout only makes
  // sense for one clip (e.g. a dialog that exists in only one segment).
  fIn?: number;
  fOut?: number;
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
  // Optional picture-in-picture callouts: extra crops of the SAME
  // footage timeline (same clips), positioned inside the window. Used to
  // show operation UI (plugin panel, comp header, script dialog) at
  // readable size — still real footage, no fake UI.
  insets?: Inset[];
};

// r32 (per wu-d-r31 review): full-timeline scan found the missing
// execution evidence — ae-decompose-ops DOES contain a real
// script-execution dialog at source f161-190 (t6.7-7.9): "Executing
// Script c75ad44e-…" + "Script execution time 0 minutes 4 seconds" +
// Cancel, while the ty-plus panel (Decompose/Merge/Refine) is open on
// the master comp. REC source / REC decomposed comps with STROKE_###
// layers appear afterwards — the script IS the decompose run. W1 is
// restructured to the real arc: clip A (t6.4-8.0) shows the script
// dialog = trigger/execution evidence (same grammar as W4's accepted
// "Executing" dialog), clip B (t35.9-38.0) jump-cuts to the
// before->after swap at f886 = result. A dedicated dialog PiP makes the
// dialog text readable; the panel + comp-name PiPs are unchanged.
// Still no literal mouse click exists anywhere in the footage (verified
// by full-timeline vision scan), so nothing claims one.
//
// r31 (per wu-d-r30 review): the W1 emphasis ring was removed — it
// implied a button press the footage never recorded (panel pixels are
// identical across the f886-887 swap).
//
// r30 segment re-pick (frame-accurate decode, see verification/wu-d-r30/src):
//
//   ae-decompose-ops: the before->after swap is a 2-frame event at
//   source f886-887 (t~36.9). Before it: static single "Restro" text
//   (f861-885). After it: decomposed strokes + rgb controls, then stepped
//   part-adjustments at f954/957/990/991/1000/1030/1073 (t39.7-44.7) — all
//   localized to the artwork band x~680-1110,y~210-500. The Restro plugin
//   panel (Decompose/Merge/Refine buttons) sits at source x1330-1618,
//   y~500-625 and is persistent across both clips; pixel diff f885->f888
//   inside the panel is ~0, so the footage has NO visible press-state
//   flip — the inset exists to identify the pressed button at readable
//   size (real footage crop, enlarged ~1.2x).
//   ae-stroke-animate: NOT continuous motion — stepped jumps at
//   f622/f665 (t25.9/27.7) inside the artwork band x~640-1120,y~135-405;
//   long static stretches between (verified: band diff f622-644 ≈ 0,
//   f665-691 ≈ 0). W2 uses two clips so each state gets a real hold and
//   the second jump reads as an intentional hard cut (same grammar as
//   the W1/W3 jump cuts that passed review).
//   ae-reprocess: the reprocess arc is f120-170 (t5.0-7.1): partial
//   redraw -> "Executing" dialog -> COMPLETE. CRITICAL r29 finding: the
//   completed comp is "Restro" over "MV" in WHITE strokes on the
//   transparency checkerboard at source x~470-1073,y~200-640 — the old
//   roi (y170-460) cropped off "MV" and showed mostly empty checkerboard,
//   which is why the result read as blank white. New roi covers the full
//   artwork stack; the footage is static from f~170 to EOF (verified by
//   full-decode frame diff — no later segment exists), so legibility
//   comes from the tighter, taller crop plus a brightness/contrast lift
//   (vision-scored best of 6 candidates: brightness(0.8) contrast(1.2)
//   saturate(1.3)).
const WINDOWS: Win[] = [
  {
    // W1 main: ae-decompose-ops — r32 restructure around the REAL
    // script-execution dialog found by full-timeline scan.
    // clip A (srcStart 6.4s = f154, 38f): master comp + ty-plus panel +
    // the "Executing Script" dialog (source f161-190 = t6.7-7.9) fully
    // inside — the operation's trigger/execution evidence.
    // clip B (srcStart 35.9s = f862, 51f): jump cut to REC decomposed —
    // single "Restro" holds ~24f then the f886 swap lands decomposed
    // strokes with ~27f of result hold before the window exit.
    file: "ae-decompose-ops.mp4",
    clips: [
      { srcStart: 6.4, dur: 38 },
      { srcStart: 35.9, dur: 51 },
    ],
    // comp viewer + controls (x500-1650,y90-710); the Restro plugin panel
    // itself (x35-235) is too far left to share this crop readably, so it
    // is shown via the PiP inset below instead. The script dialog
    // (x~821-1085,y~473-608) sits inside this roi but small — the
    // dedicated dialog PiP below carries the readable text.
    roi: { x: 500, y: 90, w: 1150, h: 620 },
    x: 490,
    y: 118,
    w: 580,
    h: 330,
    fIn: 281,
    fOut: 370,
    caption: "分解 — スクリプト実行 → 筆画シェイプ",
    insets: [
      // Script-execution dialog PiP (clip A only, PV 281-318): the REAL
      // "Executing Script … / Script execution time 0 minutes 4 seconds"
      // dialog at ~0.75x — readable title + Cancel + progress bar. This
      // is the footage's own record that the decompose script ran;
      // same evidence grammar as W4's "Executing" dialog.
      {
        roi: { x: 790, y: 440, w: 340, h: 210 },
        x: 322,
        y: 20,
        w: 250,
        h: 155,
        fIn: 281,
        fOut: 319,
      },
      // Restro plugin panel PiP (both clips): Decompose / Merge /
      // Refine button row at source x1330-1610,y500-625, persistent in
      // the footage. Enlarged ~1.2x vs the main window so labels are
      // readable; identifies WHICH plugin function the recording is
      // about. No press state exists in the footage — none is faked.
      {
        roi: { x: 1330, y: 500, w: 280, h: 125 },
        x: 248,
        y: 192,
        w: 330,
        h: 134,
        tag: "Restroパネル",
      },
      // Comp viewer header PiP (clip B only, PV 319-370): the open comp
      // is literally named "REC decomposed" in the footage (tab + label
      // chip at source x280-720,y58-125). Restricted to clip B so it
      // only appears once that comp is actually active on screen.
      {
        roi: { x: 280, y: 58, w: 440, h: 67 },
        x: 12,
        y: 24,
        w: 320,
        h: 49,
        fIn: 319,
        fOut: 370,
      },
    ],
  },
  {
    // W2 aux: ae-stroke-animate — r30 two-clip restructure (jump frames
    // verified by per-frame decode: state changes land at f623 and f666).
    // clip A (25.55s->f613, 32f): state1 (f613-622) -> in-clip jump at
    // f623 -> state2 hold (f623-644). clip B (27.75s->f666, 27f): hard
    // cut lands exactly on the second jump's new state (f666) so the cut
    // itself IS the second staged change, then state3 holds ~1.1s to the
    // window exit. r29's single clip left state3 with only ~8 frames and
    // the second jump read as noise; now each state holds >=10 frames
    // and the two changes use different grammar (in-clip jump + hard cut).
    file: "ae-stroke-animate.mp4",
    clips: [
      { srcStart: 25.55, dur: 32 },
      { srcStart: 27.75, dur: 27 },
    ],
    // tight crop on the decomposed-artwork band (motion measured at
    // source x~640-1120,y~135-405) so strokes stay legible at aux size
    roi: { x: 640, y: 170, w: 480, h: 340 },
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
    // so the finished result holds ~0.5s before the exit fade. r30: the
    // completed comp is WHITE "Restro" over "MV" on the transparency
    // checkerboard spanning source x~470-1073,y~200-640 — the r29 roi
    // (y170-460) cut off "MV" and framed mostly empty checkerboard, which
    // is why the result read as blank white. The new taller window +
    // full-stack roi shows the whole result; full-decode diff proves the
    // footage is static after f~170, so no later segment exists.
    file: "ae-reprocess.mp4",
    clips: [{ srcStart: 5.4, dur: 45 }],
    // full artwork stack: "Restro" (y~220-380) + "MV" with red selection
    // handles (y~480-640); the transient "Executing" dialog
    // (x~800-1100,y~496-603) passes through mid-clip as the operation
    // beat, then clears to reveal the result.
    roi: { x: 440, y: 170, w: 700, h: 500 },
    // enlarged vs r29 (480x270) for legibility but kept clearly smaller
    // than W1 (560x315) so the main/aux hierarchy is preserved
    x: 470,
    y: 692,
    w: 450,
    h: 330,
    fIn: 320,
    fOut: 365,
    caption: "再処理 — 筆画の再構成",
    // White-on-checkerboard footage: the r29 filter (contrast 1.5 /
    // brightness 0.97) pushed mid-tones toward white and washed the
    // result out. Vision-scored candidates on the final crop picked a
    // mild lift instead — keeps strokes bright against a slightly
    // darkened checkerboard without crushing the frame.
    filter: "brightness(0.8) contrast(1.2) saturate(1.3)",
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
      {win.insets?.map((ins, i) => {
        const iIn = ins.fIn ?? win.fIn;
        const iOut = ins.fOut ?? win.fOut;
        const iop =
          Math.min(smooth(ramp(t, iIn, iIn + 0.15)), 1 - smooth(ramp(t, iOut - 0.15, iOut)));
        if (iop <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: ins.x,
              top: ins.y,
              width: ins.w,
              height: ins.h,
              overflow: "hidden",
              opacity: iop,
              border: "1px solid rgba(255,255,255,0.55)",
              background: "#0c0c0c",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
            }}
          >
            {clipSeqs(ins.roi, ins.w, ins.h)}
            {ins.tag && (
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
                {ins.tag}
              </div>
            )}
          </div>
        );
      })}
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
