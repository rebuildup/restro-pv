import { compByName } from "../../video/src/ae/project.ts";
const m = compByName("master")!;
for (const l of m.layers) {
  const a = l.inPoint ?? -1e9, b = l.outPoint ?? 1e9;
  if (b > 1.4 && a < 4.4) {
    console.log(l.index, l.name, "|", l.kind, l.source ?? "", "| in", a.toFixed(2), "out", b.toFixed(2), "start", (l.startTime??0).toFixed(2), "parent", l.parentIndex ?? "-");
  }
}
