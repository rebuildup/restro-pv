import { masterComp } from "../../video/src/ae/project.ts";
import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const m=masterComp();
const l=m.layers.find(l=>l.index===233);
console.log("233:",l?.name,l?.kind,"in",l?.inPoint,"out",l?.outPoint,"enabled",l?.enabled);
if(l?.shapes){const s=JSON.stringify(l.shapes).slice(0,400);console.log(s);}
// any text/other layers visible 1.875-4.2 not yet accounted
for(const l of m.layers){const i=l.inPoint??0,o=l.outPoint??20;if(i<4.2&&o>1.875&&![11,13,232,233,234,235,236,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,10,15,16,17,18,189,190,191,192,193,5,6,20,21,22,24,25,26,27,28,29,30,31,156,161,162,163,164,165].includes(l.index))console.log("other:",l.index,l.name,l.kind,i,o);}
