import { PNG } from "pngjs";
import fs from "fs";
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const W=p.width,H=p.height;
  const isRed=(i:number)=>p.data[i]>180&&p.data[i+1]<90&&p.data[i+2]<90;
  const isDark=(i:number)=>{const r=p.data[i],g=p.data[i+1],b=p.data[i+2];return r<160&&g<160&&b<160&&!(r>180&&g<90);};
  // collect coords
  const red:{x:number,y:number}[]=[],dark:{x:number,y:number}[]=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;
    if(isRed(i))red.push({x,y});else if(isDark(i))dark.push({x,y});}
  // distance transform of dark (approx: brute force too slow; use grid BFS)
  const cell=4,cw=Math.ceil(W/cell),ch=Math.ceil(H/cell);
  const dg=new Uint8Array(cw*ch);
  for(const d of dark){const gx=Math.floor(d.x/cell),gy=Math.floor(d.y/cell);dg[gy*cw+gx]=1;}
  // dilate dark mask by r cells for tolerance scoring
  function cov(rad:number){ // fraction of red pts within rad*cell px of dark
    // build dilated mask
    const m=new Uint8Array(cw*ch);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){if(!dg[y*cw+x])continue;
      for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<cw&&ny<ch)m[ny*cw+nx]=1;}}
    let hit=0;for(const r of red){const gx=Math.floor(r.x/cell),gy=Math.floor(r.y/cell);if(gx>=0&&gy>=0&&gx<cw&&gy<ch&&m[gy*cw+gx])hit++;}
    return hit/red.length;
  }
  // symmetric: dark pts near red
  const rg=new Uint8Array(cw*ch);
  for(const r of red){rg[Math.floor(r.y/cell)*cw+Math.floor(r.x/cell)]=1;}
  function covD(rad:number){const m=new Uint8Array(cw*ch);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){if(!rg[y*cw+x])continue;
      for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<cw&&ny<ch)m[ny*cw+nx]=1;}}
    let hit=0;for(const d of dark){const gx=Math.floor(d.x/cell),gy=Math.floor(d.y/cell);if(gx>=0&&gy>=0&&gx<cw&&gy<ch&&m[gy*cw+gx])hit++;}
    return hit/dark.length;}
  console.log(f, "redPx="+red.length, "darkPx="+dark.length,
    "red->dark@8px="+cov(2).toFixed(3), "@16px="+cov(4).toFixed(3),
    "dark->red@8px="+covD(2).toFixed(3), "@16px="+covD(4).toFixed(3));
}
