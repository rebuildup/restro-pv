import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";

// all shape layers in bunkai
const all = compStrokes("bunkai", { pattern: /./, poseT: 0.5 });
let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
for (const s of all.strokes) { x0=Math.min(x0,s.bbox[0]);y0=Math.min(y0,s.bbox[1]);x1=Math.max(x1,s.bbox[2]);y1=Math.max(y1,s.bbox[3]); }
console.log("bunkai ALL shapes:", all.strokes.length, `bbox=[${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}]`);

// ghost -> PV A2 space via matrix
const m = [1.0599,0,0,0,0,1.0599,0,0,0,0,1,0,-213.2939,-128.5836,0,1];
const gx0=1.0599*576-213.2939, gx1=1.0599*1317-213.2939;
const gy0=1.0599*277-128.5836, gy1=1.0599*998-128.5836;
console.log(`ghost char in PV-A2 space: [${gx0.toFixed(0)},${gy0.toFixed(0)},${gx1.toFixed(0)},${gy1.toFixed(0)}]`);

// per-stroke ghost bboxes mapped
const g = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });
for (const s of g.strokes.slice(0,20)) {
  const bx=[1.0599*s.bbox[0]-213.2939, 1.0599*s.bbox[1]-128.5836, 1.0599*s.bbox[2]-213.2939, 1.0599*s.bbox[3]-128.5836];
  console.log(`  ${s.name.slice(0,40)} -> [${bx.map(v=>v.toFixed(0)).join(",")}]`);
}
