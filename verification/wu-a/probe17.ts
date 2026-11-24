import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const { strokes } = compStrokes("bunkai", { pattern: /^STROKE_\d+_runs5$/, poseT: 0.5 });
for (const nm of ["STROKE_005_runs5","STROKE_016_runs5","STROKE_003_runs5"]) {
  const s = strokes.find(x=>x.name===nm)!;
  const hits:string[]=[];
  (function walk(n:any){ if(n.keys?.length) hits.push(`${n.matchName}(${n.keys.length}k v=${JSON.stringify(n.value)?.slice(0,40)})`); for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  console.log("==",nm); hits.slice(0,25).forEach(h=>console.log("  ",h));
}
