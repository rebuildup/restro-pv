import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
import { masterComp } from "../../video/src/ae/project.ts";
import { child, children } from "../../video/src/ae/eval.ts";
applyMasterPatches();
const m = masterComp();
for (const l of m.layers) {
  if (l.index < 239 || l.index > 254) continue;
  const t = l.transform;
  const names = children(t).map((c) => c.matchName);
  const pos = child(t, "ADBE Position");
  const pv = pos?.value;
  const pk = Array.isArray(pos?.keys) ? pos.keys.length : 0;
  console.log(
    `idx=${l.index} name=${l.name} pos=${JSON.stringify(pv)?.slice(0, 60)} keys=${pk} children=${names.join(",")}`,
  );
}
