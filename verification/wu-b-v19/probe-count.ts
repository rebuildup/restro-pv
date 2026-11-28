import { compStrokes, strokeContours, strokeRings } from "../../video/src/scenes/glyph.tsx";

const PROC = "STEP3 infer [checkpoint before wipe removal]";
const inferred = compStrokes(PROC, { pattern: /^FUDE inferred/, poseT: 6.0 }).strokes[0];
const pts = compStrokes(PROC, { pattern: /^FUDE S\d+/, poseT: 6.0 }).strokes;
console.log("strokes", pts.length);
if (inferred) {
  const c = strokeContours(compStrokes(PROC,{pattern:/^FUDE inferred/,poseT:6.0}).comp, inferred, 6.0);
  console.log("inferredContours", c.length, "paths per item", c.map(x=>x.length).join(","));
}
