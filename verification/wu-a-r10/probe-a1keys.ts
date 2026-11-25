import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp } = await import("../../video/src/ae/project.ts");
const { child } = await import("../../video/src/ae/eval.ts");
const m = masterComp();
for (const l of m.layers) {
  if (l.index < 239 || l.index > 254) continue;
  for (const mn of ["ADBE Position", "ADBE Position_0"]) {
    const p = child(l.transform, mn);
    if (!p) continue;
    const keys = (p.keys ?? []) as { t: number; v: unknown }[];
    if (keys.length === 0) {
      console.log(`${l.index} ${l.name} ${mn} static=${JSON.stringify(p.value)}`);
    } else {
      console.log(
        `${l.index} ${l.name} ${mn} keys=` +
          keys.map((k) => `t${k.t.toFixed(2)}:${JSON.stringify(k.v)}`).join(" "),
      );
    }
  }
}
