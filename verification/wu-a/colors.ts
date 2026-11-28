import { compByName } from "../../video/src/ae/project.ts";
import { children, evalProp } from "../../video/src/ae/eval.ts";
const bk = compByName("bunkai")!;
for (const nm of ["STROKE_016_runs4","STROKE_015_runs4","STROKE_017_runs4","Ae_Restro merged shape A (runs4)","解"]) {
  const l = bk.layers.find(x=>x.name===nm)!;
  const fills:number[]=[];
  const walk=(n:any)=>{ for(const k of n.properties??[]){ if(k.matchName==="ADBE Vector Fill Color") fills.push(...(evalProp(k,0.5) as number[])); if(k.matchName==="ADBE Vector Stroke Color") fills.push(...(evalProp(k,0.5) as number[])); walk(k);} };
  if(l.shapes) walk(l.shapes);
  console.log(nm.padEnd(38), l.kind, "colors", JSON.stringify(fills.slice(0,8)));
}
// PAGE card color in PV glyph A2
const a2 = compByName("PV glyph A2")!;
const pc = a2.layers.find(l=>l.name==="PAGE card")!;
const cols:number[]=[];
const walk=(n:any)=>{ for(const k of n.properties??[]){ if(/Color/.test(k.matchName)) cols.push(k.matchName, ...(evalProp(k,0.5) as number[])); walk(k);} };
walk(pc.shapes!);
console.log("PAGE card", JSON.stringify(cols.slice(0,10)));
// ghost outline colors
for (const nm of ["FUDE outline inset","FUDE outline base","FUDE S02 (STROKE_001_runs2)"]) {
  const l = a2.layers.find(x=>x.name===nm)!;
  const c:number[]=[];
  const w2=(n:any)=>{ for(const k of n.properties??[]){ if(/Color|Opacity/.test(k.matchName)) c.push(k.matchName,(evalProp(k,0.5) as any)); w2(k);} };
  w2(l.shapes!);
  console.log(nm, JSON.stringify(c).slice(0,300));
}
