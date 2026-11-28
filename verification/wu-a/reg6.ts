import { compByName } from "../../video/src/ae/project.ts";
const bk = compByName("bunkai")!;
for (const l of bk.layers) {
  console.log(l.index, l.name.padEnd(38), l.kind.padEnd(7), "in", (l.inPoint??0).toFixed(2), "out", (l.outPoint??0).toFixed(2), "start", (l.startTime??0).toFixed(2), "parent", l.parentIndex ?? "-");
}
