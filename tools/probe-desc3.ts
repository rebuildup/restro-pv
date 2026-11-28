import { masterComp } from "../video/src/ae/project.ts";
import { child, evalNum, evalVec } from "../video/src/ae/eval.ts";
const m = masterComp();
for (const l of m.layers) {
  if (/description/i.test(l.name)) {
    const pos = child(l.transform, "ADBE Position");
    const sc = child(l.transform, "ADBE Scale");
    console.log(l.index, l.name, "in", l.inPoint, "out", l.outPoint,
      "pos", JSON.stringify(pos?.value), "scale", JSON.stringify(sc?.value), "op", evalNum(child(l.transform,"ADBE Opacity"),5.5));
  }
}
