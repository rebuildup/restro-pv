import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("bunkai", { pattern: /^STROKE_\d+_runs4$/, poseT: 0.5 });
let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
for (const s of strokes){const [a,b,c,d]=s.bbox;x1=Math.min(x1,a);y1=Math.min(y1,b);x2=Math.max(x2,c);y2=Math.max(y2,d);console.log(s.name, s.bbox.map(v=>v.toFixed(0)).join(","));}
console.log("ALL", [x1,y1,x2,y2].map(v=>v.toFixed(0)).join(","));
