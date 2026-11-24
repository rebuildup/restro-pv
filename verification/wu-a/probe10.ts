import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const s of strokes) {
  let gop:any, fop:any, fcol:any;
  (function walk(n:any){
    if(n.matchName==="ADBE Vector Group Opacity"&&gop===undefined)gop=n.value;
    if(n.matchName==="ADBE Vector Fill Opacity"&&fop===undefined)fop=n.value;
    if(n.matchName==="ADBE Vector Fill Color"&&fcol===undefined)fcol=n.value;
    for(const p of n.properties??[])walk(p);
  })(s.layer.shapes);
  console.log(s.name,"gop",gop,"fop",fop,"fcol",JSON.stringify(fcol));
}
