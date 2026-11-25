import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp } = await import("../../video/src/ae/project.ts");
const { compByName, GENERATED_COMPS } = await import("../../video/src/ae/project.ts");
const { worldMatrix } = await import("../../video/src/ae/transform.ts");
const { child, children } = await import("../../video/src/ae/eval.ts");
const m = masterComp();
for (const idx of [233, 234, 235, 236, 255, 232]) {
  const l = m.layers.find((x) => x.index === idx);
  if (!l) continue;
  const names = children(l.transform ?? ({ properties: [] } as never)).map((c) => `${c.matchName}:${JSON.stringify(c.value)?.slice(0, 50)}`);
  console.log(`idx=${idx} ${l.name} source=${l.sourceCompIndex ?? l.footageIndex ?? "-"}`);
  for (const n of names) console.log("   ", n);
}
// kai-zoom comp dims
for (const c of GENERATED_COMPS) {
  if (c.name.includes("kai") || c.name.includes("bunkai") || c.name.includes("PV A2"))
    console.log("comp:", c.name, c.width, "x", c.height, "layers:", c.layers.length);
}
