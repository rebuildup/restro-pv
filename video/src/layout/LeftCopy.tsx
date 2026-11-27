import React from "react";

// Left-column copy owned by the chrome layer (Issue #30).
//
// The left information column — including its per-scene temporal copy
// switching — is part of the CONFIRMED layout recovered from the old
// production, not scene content. Until now the D and E left lines were
// authored inside SceneD/SceneE; they are moved here verbatim so that
// scene components own only right-stage content. All other left-column
// copy already lives in the dumped `description` comp (rendered by
// Chrome) with its timing patched in ae/masterPatch.ts.
//
// Do not add new copy here without an owner-level layout decision;
// right-stage scene content belongs in video/src/scenes/.

const JP = "'Noto Sans JP', 'Hiragino Sans', sans-serif";

const T0_D = 281 / 24;
const T1_D = 371 / 24;
const T0_E = 371 / 24;

const ramp = (t: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);

export const LeftCopy: React.FC<{ t: number }> = ({ t }) => {
  // Scene D left column (was SceneD): fades in with the scene and HOLDS
  // to the last D frame — the f370->f371 hard cut needs no fade-out.
  const dActive = t >= T0_D && t < T1_D;
  const dIn = dActive ? smooth(ramp(t, T0_D, T0_D + 0.3)) : 0;

  // Scene E closing line (was SceneE): hard cut at the E boundary.
  const eActive = t >= T0_E;

  if (!dActive && !eActive) return null;

  return (
    <>
      {dActive && dIn > 0 && (
        <div
          style={{
            position: "absolute",
            left: 44,
            // brand lockup (Restro/筆画復元) bottom edge is ~y550; keep a
            // clear gap — r25 failed on perceived collision at y596.
            top: 648,
            width: 400,
            opacity: dIn,
            transform: `translateY(${(1 - dIn) * 10}px)`,
            fontFamily: JP,
            color: "#111",
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.5 }}>
            After Effectsで、
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.5 }}>
            そのまま動かせる。
          </div>
          <div style={{ marginTop: 14, fontSize: 20, fontWeight: 500, color: "#444", lineHeight: 1.5 }}>
            分解した筆画がレイヤーとして動く
          </div>
        </div>
      )}

      {eActive && (
        <div
          style={{
            position: "absolute",
            left: 44,
            top: 706,
            width: 400,
            fontFamily: JP,
            color: "#111",
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.32, letterSpacing: 0.5 }}>
            輪郭から筆画へ。
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.32, letterSpacing: 0.5 }}>
            筆画から表現へ。
          </div>
        </div>
      )}
    </>
  );
};
