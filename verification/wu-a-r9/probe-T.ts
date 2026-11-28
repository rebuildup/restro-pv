import { compStrokes } from "../../video/src/scenes/glyph.tsx";
const b = compStrokes("bunkai", { pattern: /^STROKE_\d+_(runs4|runs5|runs6)$/, poseT: 0.5 }).strokes;
const m = compStrokes("master", { indices: [239, 254], poseT: 1.45 }).strokes;
const mm = new Map(m.map(s=>[s.name,s]));
const pairs:{bx:number,by:number,mx:number,my:number,name:string}[]=[];
for(const s of b){const t=mm.get(s.name);if(t)pairs.push({bx:s.center[0],by:s.center[1],mx:t.center[0],my:t.center[1],name:s.name});}
const n=pairs.length;
let msx=0,msy=0,mbx=0,mby=0;
for(const p of pairs){msx+=p.mx;msy+=p.my;mbx+=p.bx;mby+=p.by;}
msx/=n;msy/=n;mbx/=n;mby/=n;
let num=0,den=0;
for(const p of pairs){const dx=p.bx-mbx,dy=p.by-mby,ex=p.mx-msx,ey=p.my-msy;num+=dx*ex+dy*ey;den+=dx*dx+dy*dy;}
const s=num/den;
const tx=msx-s*mbx, ty=msy-s*mby;
console.log(`pairs=${n} scale=${s.toFixed(4)} translate=(${tx.toFixed(1)},${ty.toFixed(1)})`);
for(const p of pairs){const px=s*p.bx+tx,py=s*p.by+ty;console.log(`${p.name} resid=(${(px-p.mx).toFixed(1)},${(py-p.my).toFixed(1)})`);}
