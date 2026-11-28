import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp, GENERATED_COMPS } = await import("../../video/src/ae/project.ts");
const { children } = await import("../../video/src/ae/eval.ts");
const { worldMatrix } = await import("../../video/src/ae/transform.ts");
const m = masterComp();
const l = m.layers.find((x) => x.index === 11)!;
console.log("layer11", l.name, "srcComp=", l.sourceCompIndex, "parent=", l.parentIndex);
for (const c of children(l.transform)) {
  console.log(" ", c.matchName, JSON.stringify(c.value)?.slice(0, 70), "keys=", Array.isArray(c.keys) ? c.keys.length : 0);
}
for (const t of [1.6, 1.875, 2.5, 3.5]) {
  const w = worldMatrix(l, m.layers, t, new Map());
  console.log(`t=${t} matrix=[${w.matrix.map((v) => +v.toFixed(2))}]`);
}
const pvc = GENERATED_COMPS.find((c) => c.name === "PV A2")!;
console.log("PV A2 comp:", pvc.width, pvc.height, "layers:", pvc.layers.length);
for (const cl of pvc.layers) {
  console.log(`  compLayer idx=${cl.index} ${JSON.stringify(cl.name).slice(0, 50)} in=${cl.inPoint?.toFixed(2)} out=${cl.outPoint?.toFixed(2)} kind=${cl.kind}`);
}
