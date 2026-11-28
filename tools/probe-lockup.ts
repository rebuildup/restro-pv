import { masterComp } from "../video/src/ae/project.ts";
const m = masterComp();
for (const l of m.layers) {
  const n = l.name ?? "";
  if (/logo|brand|restro|筆画|ae|badge|title|heading|plugin/i.test(n)) {
    console.log(l.index, JSON.stringify(n).slice(0,60), "in", l.inPoint?.toFixed(2), "out", l.outPoint?.toFixed(2), "en", l.enabled);
  }
}
