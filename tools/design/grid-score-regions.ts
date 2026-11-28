import {
  mLookAt, mMultiply, mPerspective, mRotateY, mScreenFromClip, mTranslation, transformPoint, type Mat4,
} from "../../video/src/ae/mat4.ts";
import { AE_DEFAULT_CAMERA_FOV_DEG } from "../../video/src/design/rig.ts";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
const W = 1080, H = 1080;
const cam = { fov: AE_DEFAULT_CAMERA_FOV_DEG, distance: 1500 };
const view = mLookAt([W/2,H/2,-cam.distance],[W/2,H/2,0],[0,-1,0]);
const proj = mPerspective(cam.fov, W/H, 1, 100000);
const screen = mScreenFromClip(W,H);
function lm(ry:number):Mat4{let m=mTranslation(540,540,245);m=mMultiply(m,mRotateY(ry));m=mMultiply(m,mTranslation(-1500,-1500,0));return m;}
function ts(m:Mat4,x:number,y:number,z:number){const h=mMultiply(screen,mMultiply(proj,mMultiply(view,m)));const p=transformPoint(h,x,y,z);return [p[0],p[1]] as const;}
const ANCHOR=540,CELL=54,SIZE=3000,BORDER=2;
const segs:{x1:number;y1:number;x2:number;y2:number}[]=[];
for(let k=Math.floor((0-ANCHOR)/CELL)-1;k<=Math.ceil((SIZE-ANCHOR)/CELL)+1;k++){const p=ANCHOR+k*CELL;if(p<-BORDER||p>SIZE+BORDER)continue;segs.push({x1:p,y1:-BORDER,x2:p,y2:SIZE+BORDER},{x1:-BORDER,y1:p,x2:SIZE+BORDER,y2:p});}
const png=PNG.sync.read(readFileSync(process.argv[2]??".tmp/check/samune-1080.png"));
function isGray(x:number,y:number){const xi=Math.round(x),yi=Math.round(y);if(xi<0||yi<0||xi>=png.width||yi>=png.height)return false;const i=(yi*png.width+xi)*4;const r=png.data[i],g=png.data[i+1],b=png.data[i+2];const lum=0.299*r+0.587*g+0.114*b;return lum>=28&&lum<=170&&Math.max(r,g,b)-Math.min(r,g,b)<22;}
const regions:[number,number,number,number][]=[[560,1075,40,300],[560,1075,800,1040],[60,440,40,300],[60,440,800,1040],[700,1000,950,1040],[950,1075,600,800]];
for(const ry of [20,-20] as const){
  const m=lm(ry);
  const ss=segs.map(s=>{const a=ts(m,s.x1,s.y1,0),b=ts(m,s.x2,s.y2,0);return{x1:a[0],y1:a[1],x2:b[0],y2:b[1]};});
  let line="";
  for(const[rx0,rx1,ry0,ry1]of regions){
    let hits=0,samples=0;
    for(const s of ss){
      const a=ts(m,s.x1,s.y1,0),b=ts(m,s.x2,s.y2,0);
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<20)continue;
      const n=Math.floor(len/3);
      for(let i=0;i<=n;i++){const u=i/n;const px=a[0]+(b[0]-a[0])*u,py=a[1]+(b[1]-a[1])*u;
        if(px<rx0||px>=rx1||py<ry0||py>=ry1)continue;samples++;
        let f=false;for(let dx=-2;dx<=2&&!f;dx++)for(let dy=-2;dy<=2&&!f;dy++)if(isGray(px+dx,py+dy))f=true;
        if(f)hits++;}
    }
    line+=` [${rx0}-${rx1},${ry0}-${ry1}]:${samples?(hits/samples).toFixed(2):"-"}`;
  }
  console.log(`Y=${ry>0?"+":"-"}20${line}`);
}
