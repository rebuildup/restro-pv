import { compByName } from "../video/src/ae/project.ts";
import { child, children, evalNum } from "../video/src/ae/eval.ts";
const desc = compByName("description")!;
console.log("comp", desc.width, desc.height);
for (const l of desc.layers) {
  if (l.inPoint === undefined || l.inPoint < 4.0 || l.inPoint > 4.6) continue;
  const op = child(l.transform, "ADBE Opacity");
  const tdoc = l.text?.properties?.find((p) => p.matchName === "ADBE Text Document");
  const doc = tdoc?.value as any;
  const ov = op ? evalNum(op, 5.5) : undefined;
  const just = doc?.justification;
  console.log(
    l.index, JSON.stringify(l.name).slice(0,55),
    "fs", doc?.fontSize, "op@5.5", ov?.toFixed?.(0),
    "keys", op?.numKeys, "just", just,
  );
}
