import React from "react";
import { useCurrentFrame } from "remotion";
import {
  GENERATED_COMPS,
  GENERATED_FOOTAGE,
  compByName,
  mattePairs,
} from "../ae/project.ts";
import type { RenderCtx } from "../ae/layer.tsx";
import { CompView } from "../ae/layer.tsx";
import { seg, easeOutBack, StrokeField } from "../scenes/glyph.tsx";
import { filmField, FIT } from "./glyphData.ts";
import { MUSIC } from "./musicSync.ts";

// Act 5 — CTA (abs f408-480, local 0-72): official Restro logo artwork
// (dumped "Logo" comp = wordmark + 筆画復元 vector art) plus one clear
// purchase hierarchy. High-contrast URL — the v18 low-contrast CTA is a
// known defect this act must not repeat.

const START = 408;

const LOGO_COMP = compByName("Logo");
const LOGO_CTX: RenderCtx = {
  comps: GENERATED_COMPS,
  footage: GENERATED_FOOTAGE,
  camera: { fov: 40, distance: 1500 },
  matteMap: mattePairs(),
};
const LOGO_SCALE = 1.5; // 416x260 -> 624x390

const JP = "'Noto Sans JP', 'Hiragino Sans', sans-serif";

export const CtaAct: React.FC = () => {
  const f = useCurrentFrame() - START;
  const logoP = seg(f, 4, 22);
  // final accent hit (~19.74s): one restrained scale bump locks the card
  const END_HIT_AT = MUSIC.endHit - START; // 66
  const hit =
    f > END_HIT_AT && f < END_HIT_AT + 8
      ? Math.sin(((f - END_HIT_AT) / 8) * Math.PI)
      : 0;
  const descP = seg(f, 14, 30);
  const boothP = seg(f, 24, 40);
  const urlP = seg(f, 32, 48);
  // final accent ripple: a thin brand-accent ring expands off the logo
  // card on the end hit so the accent has a visible, designed consequence
  const rippleP = f > END_HIT_AT ? (f - END_HIT_AT) / 12 : -1;
  const fd = filmField();
  // authored entrance: the resolved glyph lingers 10f and dissolves into
  // the logo card — the brand inherits the film's final image
  const glyphOut = 1 - seg(f, 0, 10);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {glyphOut > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1080,
            height: 1080,
            transform: FIT,
            transformOrigin: "0 0",
            opacity: glyphOut,
          }}
        >
          <StrokeField comp={fd.comp} strokes={fd.strokes} poseT={0.5} />
        </div>
      )}
      {rippleP >= 0 && rippleP <= 1 && (
        <div
          style={{
            position: "absolute",
            left: 228 - 24 * rippleP,
            top: 300 - 24 * rippleP,
            width: 624 + 48 * rippleP,
            height: 390 + 48 * rippleP,
            border: "3px solid rgb(212, 68, 33)",
            borderRadius: 18,
            opacity: 0.85 * (1 - rippleP),
            transform: `scale(${1 + 0.06 * rippleP})`,
            transformOrigin: "540px 495px",
            pointerEvents: "none",
          }}
        />
      )}
      {LOGO_COMP && (
        <>
          {/* official logo artwork, optically centered */}
          <div
            style={{
              position: "absolute",
              left: 540 - (416 * LOGO_SCALE) / 2,
              top: 300,
              width: 416 * LOGO_SCALE,
              height: 260 * LOGO_SCALE,
              opacity: logoP,
              transform: `translateY(${(1 - logoP) * 20}px) scale(${(0.94 + 0.06 * easeOutBack(logoP)) * (1 + 0.03 * hit)})`,
              transformOrigin: "540px 480px",
            }}
          >
            <div
              style={{
                width: 416,
                height: 260,
                transform: `scale(${LOGO_SCALE})`,
                transformOrigin: "0 0",
              }}
            >
              <CompView comp={LOGO_COMP} ctx={LOGO_CTX} t={0.5} isRoot={false} />
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 726,
              textAlign: "center",
              fontFamily: JP,
              fontSize: 36,
              fontWeight: 700,
              color: "#3c3c3c",
              letterSpacing: 1,
              opacity: descP,
              transform: `translateY(${(1 - descP) * 14}px)`,
            }}
          >
            After Effects プラグイン
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 836,
              textAlign: "center",
              opacity: boothP,
              transform: `translateY(${(1 - boothP) * 14}px)`,
            }}
          >
            <div
              style={{
                fontFamily: JP,
                fontSize: 50,
                fontWeight: 800,
                color: "#111",
                letterSpacing: 2,
              }}
            >
              BOOTHで販売中
            </div>
            <div
              style={{
                marginTop: 22,
                fontFamily: "'Noto Sans JP', monospace",
                fontSize: 34,
                fontWeight: 700,
                color: "#111",
                letterSpacing: 0.5,
                opacity: urlP,
                transform: `translateY(${(1 - urlP) * 10}px)`,
              }}
            >
              361do.booth.pm/items/9029239
            </div>
          </div>
        </>
      )}
    </div>
  );
};
