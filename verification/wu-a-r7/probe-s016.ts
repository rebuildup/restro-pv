import { compByName } from "../../video/src/ae/project.ts";
import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
import type { PropNode } from "../../pv/model/types.ts";
const c = compByName("bunkai")!;
const l = c.layers.find(l=>l.name==="STROKE_016_runs4")!;
function walk(n:PropNode,d:number,out:string[]){
  out.push(`${"  ".repeat(d)}${n.matchName} ${n.name??""} v=${JSON.stringify(n.value)?.slice(0,60)}`);
  for(const p of n.properties??[])walk(p,d+1,out);
}
const out:string[]=[];walk(l.shapes as PropNode,0,out);
console.log(out.join("\n").slice(0,4000));
const s = compStrokes("bunkai",{pattern:/STROKE_016_runs4/,poseT:0.5}).strokes[0];
console.log("bbox",s.bbox,"pts",s.points.length);
const rings = strokeRings(c,s,0.5);
console.log("rings",rings.length, rings.map(r=>r.length));
for(const r of rings){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of r){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}console.log(" ring bbox",x0.toFixed(0),y0.toFixed(0),x1.toFixed(0),y1.toFixed(0));}
