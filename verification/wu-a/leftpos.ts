import { masterComp } from "../../video/src/ae/project.ts";
import { layerTransform } from "../../video/src/ae/transform.ts";
import { GENERATED_COMPS } from "../../pv/generated/index.ts";
function txtOf(l: any): string {
  const find = (n: any): string => {
    if (n?.matchName === "ADBE Text Document") return String(n.value?.text ?? "").replace(/\n/g, " ");
    for (const k of n?.properties ?? []) { const r = find(k); if (r) return r; }
    return "";
  };
  return l.text ? find(l.text).slice(0, 42) : "";
}
const m = masterComp();
for (const idx of [10, 15, 18, 189, 190, 191, 192, 193]) {
  const l = m.layers.find((x) => x.index === idx);
  if (!l) { console.log("M", idx, "missing"); continue; }
  const tr = layerTransform(l, 2.5);
  console.log("M", idx, (l.name ?? "").padEnd(28), "in", l.inPoint?.toFixed(2), "out", l.outPoint?.toFixed(2),
    "pos", tr.position.map((v) => +v.toFixed(0)).join(","), "scale", tr.scale.map((v) => +v.toFixed(2)).join(","), "|", txtOf(l));
}
const d = GENERATED_COMPS.find((c) => c.name === "description")!;
for (const idx of [1, 2, 3, 4, 5, 6]) {
  const l = d.layers.find((x) => x.index === idx)!;
  const tr = layerTransform(l, 2.5);
  console.log("D", idx, (l.name ?? "").padEnd(34), "pos", tr.position.map((v) => +v.toFixed(0)).join(","),
    "scale", tr.scale.map((v) => +v.toFixed(2)).join(","), "|", txtOf(l));
}
