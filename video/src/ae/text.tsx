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
  const text = String(d.text ?? "");
  if (!text) return null;
  const size = typeof d.fontSize === "number" ? d.fontSize : typeof d.size === "number" ? d.size : 24;
  const family = String(d.fontFamily ?? "sans-serif");
  const style = String(d.fontStyle ?? "");
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
  return (
    <div
      style={{
        fontFamily: `${family}${style ? ` ${style}` : ""}, sans-serif`,
        fontSize: size,
        lineHeight: `${leading}px`,
        color: fill,
        letterSpacing: tracking,
        WebkitTextStroke: strokeW > 0 ? `${strokeW}px ${stroke}` : undefined,
        whiteSpace: "pre",
        textAlign: just,
        width: "max-content",
      }}
    >
      {text}
    </div>
  );
}
