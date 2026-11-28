import { compStrokes, strokeContours } from "../../video/src/scenes/glyph.tsx";
const PROC = "STEP3 infer [checkpoint before wipe removal]";
const res = compStrokes(PROC, { pattern: /^FUDE inferred/, poseT: 6.0 });
const it = res.strokes[0];
console.log("bbox", it.bbox, "points", it.points.length, "name", it.name);
const cs = strokeContours(res.comp, it, 6.0);
for (const c of cs) {
  // extract numeric coords from d to get rough bounds
  const nums = c.d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  const xs = nums.filter((_,i)=>i%2===0), ys = nums.filter((_,i)=>i%2===1);
  console.log("path cmds", (c.d.match(/[A-Za-z]/g)||[]).slice(0,10).join(""), "npts~", nums.length/2,
    "x", Math.min(...xs).toFixed(0), Math.max(...xs).toFixed(0), "y", Math.min(...ys).toFixed(0), Math.max(...ys).toFixed(0));
}
