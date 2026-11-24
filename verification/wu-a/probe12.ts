import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { evalProp } from "../../video/src/ae/eval.ts";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const nm of ["S13","S10"]) {
  const s = strokes.find(x=>x.name.includes(nm))!;
  const paths:any[]=[];
  (function walk(n:any){ if(n.matchName==="ADBE Vector Shape"){paths.push(evalProp(n,0.5));} for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  for(const p of paths){
    let nan=0, big=0;
    for(const arr of [p.vertices,p.inTangents,p.outTangents]) for(const v of arr){ for(const c of v){ if(Number.isNaN(c))nan++; if(Math.abs(c)>1e6)big++; } }
    console.log(nm,"nan",nan,"big",big);
  }
}
