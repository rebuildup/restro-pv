import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const name of ["S13","S10","S09","S07","S01"]) {
  const s = strokes.find(x=>x.name.includes(name))!;
  let exprs:string[]=[];
  (function walk(n:any){ for(const k of ["expression","expr"]) if(typeof n[k]==="string"&&n[k]) exprs.push(n.matchName+": "+n[k].slice(0,60)); for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  console.log(name, "expr count", exprs.length, exprs.slice(0,3));
}
