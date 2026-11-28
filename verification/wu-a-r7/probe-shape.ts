import { compByName } from "../../video/src/ae/project.ts";
import type { PropNode } from "../../pv/model/types.ts";

function walk(n: PropNode, d: number, out: string[]) {
  out.push(`${"  ".repeat(d)}${n.matchName} name=${n.name??""} value=${JSON.stringify(n.value)?.slice(0,80)}`);
  for (const p of n.properties ?? []) walk(p, d+1, out);
}
const c = compByName("PV glyph A2")!;
for (const idx of [1,2,15]) {
  const l = c.layers.find(l=>l.index===idx)!;
  console.log("=== layer", l.index, l.name);
  const out: string[] = [];
  walk(l.shapes as PropNode, 0, out);
  console.log(out.slice(0,60).join("\n"));
}
