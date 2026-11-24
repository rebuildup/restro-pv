import React from "react";
import { compStrokes, StrokeField, easeInOutCubic, seg } from "./glyph.tsx";
import type { StrokeItem } from "./glyph.tsx";

// Scene B [~3.9, 7.96) per SPEC §5 B: the same 筆 character accumulates the
// four processing steps on one glyph. The dumped STEP n draft cards each
// showed a separate recolored copy, which read as replacement rather than
// accumulation; here the real Baseline FUDE strokes stay in place and each
// step reveals the next group of strokes (tinted per step) while previous
// groups persist. Master step labels (idx 166-169) stay visible and carry
// the step captions; masterPatch hides the draft cards/baseline/tabs.

const T0 = 3.9;
const T1 = 7.96;
// step reveal times — must match STEP_REVEAL in masterPatch.ts
const STEP_T = [4.25, 5.15, 6.05, 6.95];
const STEP_COLORS = ["#D64520", "#2F6FED", "#2FA36B", "#E8A52F"];

// Baseline glyph: stroke-bbox center ~(946,640) in comp space. Place the
// field so the glyph sits right-of-center and slowly pushes in.
const GC: [number, number] = [946, 640];
const TARGET: [number, number] = [730, 630];

// stroke -> step group (cumulative counts 4,3,3,3 over the 13 FUDE strokes,
// in stroke order S01..S13)
function stepOf(i: number): number {
  return i < 4 ? 0 : i < 7 ? 1 : i < 10 ? 2 : 3;
}

function tintStroke(item: StrokeItem, rgb: string): StrokeItem {
  const [r, g, b] = rgb
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const patch = (n: any): any => {
    if (Array.isArray(n)) return n.map(patch);
    if (n && typeof n === "object") {
      const o: any = {};
      for (const [k, v] of Object.entries(n)) o[k] = patch(v);
      if (o.matchName === "ADBE Vector Fill Color" && "value" in o) {
        o.value = [r, g, b];
      }
      return o;
    }
    return n;
  };
  return {
    ...item,
    layer: { ...item.layer, shapes: patch(item.layer.shapes) },
  };
}

export const SceneB: React.FC<{ t: number }> = ({ t }) => {
  if (t < T0 || t >= T1) return null;
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d\d/,
  });
  // deterministic stroke order by name (S01..S13)
  const ordered = [...strokes].sort((a, b) => a.name.localeCompare(b.name));

  // reveal progress per stroke: ramps in over 0.45s starting 0.15s after
  // its step's reveal time; once revealed it stays (cumulative).
  const revealAt = (i: number) => STEP_T[stepOf(i)] + 0.15 + (i % 4) * 0.06;
  const strokeOpacity = (item: StrokeItem, i: number) => {
    const p = seg(t, revealAt(i), revealAt(i) + 0.45);
    return easeInOutCubic(p);
  };
  // tint only once fully revealed so colors don't bleed mid-fade
  const colored = ordered.map((s, i) =>
    tintStroke(s, STEP_COLORS[stepOf(i)]),
  );

  // whole-glyph slow push-in ("拡大表示" per SPEC)
  const s = 0.72 + 0.12 * easeInOutCubic(seg(t, T0 + 0.4, T1 - 0.3));
  const tx = TARGET[0] - GC[0] * s;
  const ty = TARGET[1] - GC[1] * s;

  // ghost of the full character under everything until step 1 lands
  const ghost = 0.14 * (1 - seg(t, STEP_T[0] - 0.1, STEP_T[0] + 0.5));

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1080,
        height: 1080,
        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        transformOrigin: "0 0",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {ghost > 0.005 && (
        <StrokeField comp={comp} strokes={ordered} strokeOpacity={() => ghost} />
      )}
      <StrokeField
        comp={comp}
        strokes={colored}
        strokeOpacity={strokeOpacity}
      />
    </div>
  );
};
