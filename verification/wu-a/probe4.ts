import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE S/, poseT: 0.5 });
const s13 = strokes.find(s=>s.name.includes("S13"))!;
function walk(n:any, path:string, depth:number){
  if(depth>8) return;
  if(n.matchName==="ADBE Vector Fill Color"||n.matchName==="ADBE Vector Fill Opacity"||n.matchName==="ADBE Vector Stroke Color"){
    console.log(path, n.matchName, "value",JSON.stringify(n.value),"keys",n.keys?.length,"expr",(n.expression??"").slice(0,80));
  }
  for(const p of n.properties??[]) walk(p,path+"/"+p.matchName,depth+1);
}
walk(s13.layer.shapes,"",0);
