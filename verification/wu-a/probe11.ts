import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { evalProp, child, children } from "../../video/src/ae/eval.ts";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const nm of ["S13","S10","S08","S04"]) {
  const s = strokes.find(x=>x.name.includes(nm))!;
  // find ADBE Vector Shape nodes
  const paths:any[]=[];
  (function walk(n:any){ if(n.matchName==="ADBE Vector Shape"){const v=evalProp(n,0.5);paths.push(v);} for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  for(const p of paths){
    console.log(nm,"verts",p?.vertices?.length,"closed",p?.closed,"inT",p?.inTangents?.length,"sample",JSON.stringify(p?.vertices?.[0]));
  }
}
