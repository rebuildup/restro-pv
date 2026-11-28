import { compByName } from "../../video/src/ae/project.ts";
import { worldMatrix } from "../../video/src/ae/transform.ts";
const comp=compByName("PV A2")!;
console.log("PV A2",comp.width,comp.height,"layers",comp.layers.length);
for(const l of comp.layers){
  if(l.kind!=="shape"||!l.shapes)continue;
  console.log(l.index,l.name,"parent",l.parentIndex);
}
