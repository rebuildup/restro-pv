import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp } = await import("../../video/src/ae/project.ts");
const { child, children } = await import("../../video/src/ae/eval.ts");
const m = masterComp();
for (const idx of [233, 235, 236]) {
  const l = m.layers.find((x) => x.index === idx)!;
  for (const c of children(l.transform)) {
    if (c.matchName.startsWith("ADBE Position")) {
      console.log(
        `idx=${idx} ${l.name} ${c.matchName} v=${JSON.stringify(c.value)} keys=${Array.isArray(c.keys) ? c.keys.length : 0}`,
      );
    }
  }
}
