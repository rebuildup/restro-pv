import { compStrokes } from "../../video/src/scenes/glyph.tsx";
for(const t of [0.5,1.0,1.4,1.45,1.49]){
  const {strokes}=compStrokes("master",{indices:[239,254],poseT:t});
  let u=[1e9,1e9,-1e9,-1e9];
  for(const s of strokes){u=[Math.min(u[0],s.bbox[0]),Math.min(u[1],s.bbox[1]),Math.max(u[2],s.bbox[2]),Math.max(u[3],s.bbox[3])];}
  const s16=strokes.find(s=>s.name==="STROKE_016_runs4");
  console.log(`t=${t} union=[${u.map(v=>Math.round(v))}] 016bbox=[${s16?.bbox.map(v=>Math.round(v))}]`);
}
