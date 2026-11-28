import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const nm of ["S13","S10"]) {
  const s = strokes.find(x=>x.name.includes(nm))!;
  console.log("===",s.name);
  (function walk(n:any,d:number){
    console.log(" ".repeat(d)+n.matchName, "type",n.type,"keys",n.keys?.length,"val?",n.value!==undefined?typeof n.value:"");
    for(const p of (n.properties??[]).slice(0,12)) walk(p,d+1);
  })(s.layer.shapes,0);
}
