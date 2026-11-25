import { masterComp } from "../../video/src/ae/project.ts";
import { child, children } from "../../video/src/ae/eval.ts";
const m = masterComp();
const l = m.layers.find((x) => x.index === 250)!;
for (const c of children(l.transform)) {
  if (c.matchName.startsWith("ADBE Position"))
    console.log(c.matchName, "value=", JSON.stringify(c.value), "keys=", Array.isArray(c.keys) ? c.keys.length : 0);
}
// how does worldMatrix read position?
