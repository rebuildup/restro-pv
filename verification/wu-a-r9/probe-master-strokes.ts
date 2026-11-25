import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { comp, strokes } = compStrokes("master", { indices: [239, 254], poseT: 1.4 });
console.log("comp", comp.name, comp.width, "x", comp.height, "strokes:", strokes.length);
let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
for (const s of strokes) {
  const b=s.bbox.map(v=>Math.round(v));
  console.log(`${s.name} idx=${s.layer.index} bbox=[${b}]`);
  x0=Math.min(x0,s.bbox[0]);y0=Math.min(y0,s.bbox[1]);x1=Math.max(x1,s.bbox[2]);y1=Math.max(y1,s.bbox[3]);
}
console.log(`union x${Math.round(x0)}-${Math.round(x1)} y${Math.round(y0)}-${Math.round(y1)}`);
