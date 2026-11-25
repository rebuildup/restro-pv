import { masterComp } from "../../video/src/ae/project.ts";
import { child } from "../../video/src/ae/eval.ts";
const m=masterComp();
for(const l of m.layers){
  if(l.index>=237&&l.index<=256){
    const par=l.parent; // index of parent?
    console.log(`idx=${l.index} "${l.name}" kind=${l.kind} parent=${JSON.stringify(par)} in=${l.inPoint} out=${l.outPoint}`);
  }
}
// check transform position of nulls 238 and any parents
for(const l of m.layers){
  if([238,234,156,161,162,163,164,165].includes(l.index)){
    const pos=child(l.transform,"ADBE Position");
    console.log(`null idx=${l.index} "${l.name}" pos=${JSON.stringify(pos?.value)} keys=${pos?.numKeys}`);
  }
}
