import { masterComp, compByName } from "../../video/src/ae/project.ts";
const m = masterComp();
console.log("master", m.width, "x", m.height, "layers:", m.layers.length);
for (const l of m.layers) {
  const inP = l.inPoint ?? 0, outP = l.outPoint ?? 20;
  // visible during A window [0,4.25)
  if (inP < 4.3 && outP > 0) {
    console.log(`idx=${l.index} "${l.name}" kind=${l.kind} in=${inP.toFixed(2)} out=${outP.toFixed(2)} en=${l.enabled!==false}`);
  }
}
