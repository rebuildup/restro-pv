import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp, GENERATED_COMPS } = await import("../../video/src/ae/project.ts");
const m = masterComp();
// who is parented to 234?
for (const l of m.layers) {
  if (l.parentIndex === 234 || l.parentIndex === 233) {
    console.log(`layer ${l.index} ${l.name} parentIndex=${l.parentIndex}`);
  }
}
// kai-zoom comp internal layers: names, windows, position keys sample
const kz = GENERATED_COMPS.find((c) => c.name === "kai-zoom")!;
console.log("kai-zoom comp layers:", kz.layers.length);
for (const l of kz.layers.slice(0, 25)) {
  const pos = (l.transform?.properties ?? []).find(
    (p) => p.matchName === "ADBE Position" || p.matchName === "ADBE Position_0",
  );
  const v = pos?.value;
  const nk = Array.isArray(pos?.keys) ? pos.keys.length : 0;
  console.log(
    `  idx=${l.index} ${JSON.stringify(l.name).slice(0, 50)} in=${l.inPoint?.toFixed(2)} out=${l.outPoint?.toFixed(2)} pos=${JSON.stringify(v)?.slice(0, 40)} keys=${nk}`,
  );
}
