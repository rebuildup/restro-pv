import { compStrokes } from "../../video/src/scenes/glyph.tsx";
import { evalProp } from "../../video/src/ae/eval.ts";
const { strokes } = compStrokes("PV glyph A2", { pattern: /^FUDE/, poseT: 0.5 });
for (const nm of ["S08","S13","S10","S09","S07"]) {
  const s = strokes.find(x=>x.name.includes(nm))!;
  const paints:string[]=[];
  (function walk(n:any){ if(n.matchName==="ADBE Vector Graphic - Fill")paints.push("fill"); if(n.matchName==="ADBE Vector Graphic - Stroke")paints.push("stroke"); if(n.matchName==="ADBE Vector Trim"||n.matchName.includes("Trim"))paints.push("TRIM"); for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  // count shape groups
  let groups=0;
  (function walk(n:any){ if(n.matchName==="ADBE Vector Shape - Group")groups++; for(const p of n.properties??[])walk(p); })(s.layer.shapes);
  console.log(nm, paints.join(","), "groups",groups);
}
