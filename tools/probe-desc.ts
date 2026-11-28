import { compByName } from "../video/src/ae/project.ts";
import { child, children } from "../video/src/ae/eval.ts";
const desc = compByName("description")!;
for (const l of desc.layers) {
  if (l.inPoint === undefined || l.inPoint < 4.0 || l.inPoint > 4.6) continue;
  const tdoc = l.text?.properties?.find((p) => p.matchName === "ADBE Text Document");
  const doc = tdoc?.value as any;
  const pos = child(l.transform, "ADBE Position");
  console.log(
    l.index, JSON.stringify(l.name).slice(0,60),
    "in", l.inPoint, "out", l.outPoint,
    "fs", doc?.fontSize, "box", !!doc?.boxText,
    "pos", Array.isArray(pos?.value) ? pos.value.slice(0,2).join(",") : "-",
    "text", JSON.stringify(doc?.text ?? "").slice(0,70),
  );
}
