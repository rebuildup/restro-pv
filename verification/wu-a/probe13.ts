import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { evalProp } from "../../video/src/ae/eval.ts";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const s of strokes) {
  const issues:string[]=[];
  (function walk(n:any){
    if(n.matchName==="ADBE Vector Group Opacity"){const v=evalProp(n,0.5);if(v!==100)issues.push("gop="+v);}
    if(n.matchName==="ADBE Vector Scale"){const v=evalProp(n,0.5);if(Array.isArray(v)&&v.some(x=>x!==100))issues.push("scale="+JSON.stringify(v));}
    if(n.matchName==="ADBE Vector Rotation"){const v=evalProp(n,0.5);}
    for(const p of n.properties??[])walk(p);
  })(s.layer.shapes);
  console.log(s.name, issues.length?issues.join(" "):"ok");
}
