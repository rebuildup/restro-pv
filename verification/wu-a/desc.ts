import { GENERATED_COMPS } from "../../pv/generated/index.ts";
const d = GENERATED_COMPS.find((c) => c.name === "description")!;
console.log("desc comp", d.width, d.height, "layers", d.layers.length);
for (const l of d.layers) {
  const txt = (()=>{const find=(n:any):string=>{if(n?.matchName==="ADBE Text Document"){const v=n.value as any;return String(v?.text??"").replace(/\n/g," ");}for(const k of n?.properties??[]){const r=find(k);if(r)return r;}return "";};return l.text?find(l.text):"";})();
  console.log(String(l.index).padStart(3), (l.name??"").padEnd(34), "in", l.inPoint?.toFixed(2), "out", l.outPoint?.toFixed(2), "|", txt.slice(0,50));
}
