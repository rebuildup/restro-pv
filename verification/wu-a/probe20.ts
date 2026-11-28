import { GENERATED_COMPS, compByName } from "../../video/src/ae/project.ts";
console.log(GENERATED_COMPS.map(c=>c.name).join(" | "));
const m=compByName("master")!;
const l11=m.layers.find(l=>l.index===11);
console.log("master layer11:",l11?.name,"src",l11?.source,"kind",l11?.kind);
