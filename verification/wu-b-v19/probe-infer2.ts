import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const PROC = "STEP3 infer [checkpoint before wipe removal]";
const res = compStrokes(PROC, { pattern: /^FUDE inferred/, poseT: 6.0 });
console.log("matched strokes:", res.strokes.map(s=>`${s.name} bbox=${s.bbox.map(v=>v.toFixed(0))} pts=${s.points.length}`));
const res2 = compStrokes(PROC, { pattern: /^FUDE/, poseT: 6.0 });
console.log("all FUDE:", res2.strokes.map(s=>s.name));
