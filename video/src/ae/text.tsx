import React from "react";
import type { PropNode } from "../../../pv/model/types.ts";
import { child, evalProp } from "./eval.ts";
import { isTextDoc } from "./eval.ts";

// Text layer -> DOM. The dumped TextDocument uses AE field names
// (fontSize/leading/tracking/justification enum); unsupported animator
// features degrade to static text (tracked approximation).

// AE TextJustification enum (JustificationType).
const JUSTIFY: Record<number, React.CSSProperties["textAlign"]> = {
  7413: "left",
  7414: "right",
  7415: "center",
  7416: "left",
  7417: "justify",
};

export function TextLayer({ node, t }: { node: PropNode; t: number }): React.ReactElement | null {
  const docNode = child(node, "ADBE Text Document");
  const doc = evalProp(docNode, t);
  if (!isTextDoc(doc)) return null;
  const d = doc as Record<string, unknown>;
  // AE dumps line breaks as "\r"; normalize all break forms to "\n" so
  // whiteSpace:"pre" renders them as separate lines.
  const text = String(d.text ?? "").replace(/\r\n|\r|\u2028|\u2029/g, "\n");
  if (!text) return null;
  const size = typeof d.fontSize === "number" ? d.fontSize : typeof d.size === "number" ? d.size : 24;
  const family = String(d.fontFamily ?? "sans-serif");
  const style = String(d.fontStyle ?? "");
  // Kozuka Gothic Pr6N is a commercial Morisawa font and cannot be bundled.
  // It is derived from Source Han Sans, same as Noto Sans JP (OFL), which is
  // installed on the render host — substitute it and keep the original name
  // first so environments that do have the font still use it.
  const familyStack = /kozuka/i.test(family)
    ? `"${family}", "Noto Sans JP", sans-serif`
    : `${family}, sans-serif`;
  const weight = /b|bold/i.test(style) ? 700 : /m|medium|demi/i.test(style) ? 500 : 400;
  const fill = Array.isArray(d.fillColor)
    ? `rgb(${(d.fillColor as number[]).map((c) => Math.round(c * 255)).join(",")})`
    : "#000";
  // AE tracking unit is 1/1000 em.
  const tracking = typeof d.tracking === "number" ? (d.tracking / 1000) * size : 0;
  const leading = typeof d.leading === "number" ? d.leading : size * 1.2;
  const just =
    JUSTIFY[typeof d.justification === "number" ? d.justification : -1] ?? "left";
  const strokeW = typeof d.strokeWidth === "number" ? d.strokeWidth : 0;
  const stroke = Array.isArray(d.strokeColor)
    ? `rgb(${(d.strokeColor as number[]).map((c) => Math.round(c * 255)).join(",")})`
    : "transparent";
  // AE point text anchors at the first-line baseline; the dumped Position
  // therefore sits on the baseline, not the top of the line box. HTML renders
  // from the top of the div, which would drop every text block by roughly a
  // line height. Shift the block up so the first baseline lands on the
  // anchor: baseline sits ~ascent below the line-box top, and half-leading
  // adds (leading - fontSize)/2 above it.
  const baselineOffset = (leading - size) / 2 + size * 1.05;
  // AE point text anchors each line at the justification edge: center-
  // justified text is centered ON the position, right-justified ends at
  // it. width:max-content makes the div exactly text-wide, so percentage
  // translates reproduce that anchoring (previously all text was
  // left-anchored, pushing center/right lines half a line too far right).
  const j = typeof d.justification === "number" ? d.justification : -1;
  const anchorX = j === 7415 ? "-50%" : "0px";
  return (
    <div
      style={{
        fontFamily: familyStack,
        fontWeight: weight,
        fontSize: size,
        lineHeight: `${leading}px`,
        color: fill,
        letterSpacing: tracking,
        WebkitTextStroke: strokeW > 0 ? `${strokeW}px ${stroke}` : undefined,
        whiteSpace: "pre",
        textAlign: just,
        width: "max-content",
        transform: `translate(${anchorX}, ${-baselineOffset}px)`,
      }}
    >
      {text}
    </div>
  );
}
