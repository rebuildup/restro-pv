import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
const vert = strokes.find(s=>s.name.includes("S13"))!;
const orig = JSON.stringify(vert.layer.shapes);
const clone = JSON.parse(orig);
console.log("identical structure:", orig === JSON.stringify(clone));
// find the Fill Color node paths in both
function find(n:any,path:string,out:string[]){ if(n.matchName==="ADBE Vector Fill Color")out.push(path); for(const p of n.properties??[])find(p,path+"/"+p.matchName,out); return out;}
console.log("orig", find(vert.layer.shapes,"",[]));
console.log("clone", find(clone,"",[]));
// check enabled/active flags on ancestors
function flags(n:any,path:string){ if(n.enabled===false||n.active===false)console.log("disabled@",path,n.matchName,n.enabled,n.active); for(const p of n.properties??[])flags(p,path+"/"+p.matchName);}
flags(clone,"",);
