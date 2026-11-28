import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
const vert = strokes.find(s=>s.name.includes("S13"))!;
const red = JSON.parse(JSON.stringify(vert.layer.shapes));
let found=0;
(function walk(n:any){
  if(n.matchName==="ADBE Vector Fill Color"||n.matchName==="ADBE Vector Stroke Color"){
    found++; n.value=[0.84,0.27,0.13,1]; n.keys=undefined;
  }
  for(const p of n.properties??[]) walk(p);
})(red);
console.log("patched",found,"fill nodes; root keys:",Object.keys(red));
// verify
(function walk(n:any){
  if(n.matchName==="ADBE Vector Fill Color") console.log("now",JSON.stringify(n.value));
  for(const p of n.properties??[]) walk(p);
})(red);
