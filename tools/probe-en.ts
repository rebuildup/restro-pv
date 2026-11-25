import { compByName } from "../video/src/ae/project.ts";
const desc = compByName("description")!;
for (const l of desc.layers) {
  if (l.inPoint === undefined || l.inPoint < 4.0 || l.inPoint > 8.0) continue;
  if (l.enabled === false) continue;
  const tdoc = l.text?.properties?.find((p) => p.matchName === "ADBE Text Document");
  const doc = tdoc?.value as any;
  console.log(l.index, JSON.stringify(l.name).slice(0,45), "in", l.inPoint?.toFixed(2), "out", l.outPoint?.toFixed(2), "text", JSON.stringify(doc?.text ?? "").slice(0,50));
}
