import React from "react";
import { useCurrentFrame, Video, staticFile } from "remotion";
import { seg } from "../scenes/glyph.tsx";

// Act 3 — proof (abs f180-234): real-operation footage. Cropped 1080x1080
// window of assets/rec/ae-decompose-ops.mp4 (source t=7.0-9.25s) showing the
// Executing Script dialog and the Restro/STROKE workspace state. The clip
// itself is the evidence; the caption only names what is on screen.

const START = 180;
const END = 234;
const SRC = "assets/rec/pv-proof-decompose.mp4";

export const ProofAct: React.FC = () => {
  const f = useCurrentFrame();
  const local = f - START;
  if (f >= END) return null;

  // gentle push-in over the clip
  const push = 1 + 0.05 * (local / (END - START));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${push})`,
          transformOrigin: "540px 540px",
        }}
      >
        <Video
          src={staticFile(SRC)}
          trimAfter={END - START}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      {/* soft entry: 6f fade from paper so the hard cut into AE UI does not
          read as a glitch */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#f7f7f7",
          opacity: 1 - seg(local, 0, 6),
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 64,
          textAlign: "center",
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
          fontSize: 26,
          fontWeight: 500,
          color: "#fff",
          letterSpacing: 2,
          textShadow: "0 1px 8px rgba(0,0,0,0.55)",
          opacity: 0.92,
        }}
      >
        After Effects — Restro Decompose の実行画面
      </div>
    </div>
  );
};
