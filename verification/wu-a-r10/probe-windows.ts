import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp } = await import("../../video/src/ae/project.ts");
const m = masterComp();
for (const l of m.layers) {
  const idx = l.index;
  if (idx >= 225 && idx <= 270) {
    console.log(
      `idx=${idx} name=${JSON.stringify(l.name).slice(0, 60)} in=${l.inPoint?.toFixed(2)} out=${l.outPoint?.toFixed(2)} kind=${l.kind}`,
    );
  }
}
