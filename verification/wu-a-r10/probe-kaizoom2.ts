import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { masterComp } = await import("../../video/src/ae/project.ts");
const { worldMatrix } = await import("../../video/src/ae/transform.ts");
const m = masterComp();
for (const idx of [233, 234, 235, 236]) {
  const l = m.layers.find((x) => x.index === idx)!;
  const w = worldMatrix(l, m.layers, 1.7, new Map());
  console.log(
    `idx=${idx} ${l.name} parent=${l.parent ?? "-"} matrix=[${w.matrix.map((v) => +v.toFixed(2))}]`,
  );
  // shape/group names inside
  const names: string[] = [];
  const walk = (n: unknown, d: number) => {
    if (d > 4 || !n || typeof n !== "object") return;
    const node = n as { matchName?: string; name?: string; properties?: unknown[] };
    if (node.name) names.push(node.name);
    for (const c of node.properties ?? []) walk(c, d + 1);
  };
  walk(l.shapes, 0);
  console.log("   shape names:", names.slice(0, 12).join(" | "));
}
// Position_0 keys on null 234
const l234 = m.layers.find((x) => x.index === 234)!;
const { child } = await import("../../video/src/ae/eval.ts");
const p0 = child(l234.transform, "ADBE Position_0");
console.log("234 Pos0 keys:", JSON.stringify(p0?.keys)?.slice(0, 400));
const p1 = child(l234.transform, "ADBE Position_1");
console.log("234 Pos1 keys:", JSON.stringify(p1?.keys)?.slice(0, 400));
