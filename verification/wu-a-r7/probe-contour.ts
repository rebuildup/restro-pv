import { compStrokes, strokeRings } from "../../video/src/scenes/glyph.tsx";
const bunkai = compStrokes("bunkai", { pattern: /./, poseT: 0.5 });
const ghost = compStrokes("PV glyph A2", { indices: [2,2], poseT: 0.5 });
const X0=430,Y0=330,CW=640,CH=640,cell=4;
const W=Math.ceil(CW/cell),H=Math.ceil(CH/cell);
function raster(rings:[number,number][][]):Uint8Array{
  const m=new Uint8Array(W*H);
  for(const poly of rings){if(poly.length<3)continue;
    let minY=1e9,maxY=-1e9;for(const p of poly){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    for(let gy=Math.max(0,Math.floor((minY-Y0)/cell));gy<=Math.min(H-1,Math.floor((maxY-Y0)/cell));gy++){
      const y=Y0+(gy+0.5)*cell;const xs:number[]=[];
      for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      xs.sort((u,v)=>u-v);
      for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.floor((xs[k]-X0)/cell)),x1=Math.min(W-1,Math.floor((xs[k+1]-X0)/cell));for(let gx=x0;gx<=x1;gx++)m[gy*W+gx]=1;}
    }}
  return m;
}
let bk=raster(bunkai.strokes.flatMap(s=>strokeRings(bunkai.comp,s,0.5)));
// dilate by 2 cells (8px)
let bkD=new Uint8Array(W*H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!bk[y*W+x])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H)bkD[ny*W+nx]=1;}}
const G=[1.0599,-213.2939,1.0599,-128.5836];
// ghost contour sample points (ring vertices, transformed)
const gpts:[number,number][]=ghost.strokes.flatMap(st=>strokeRings(ghost.comp,st,0.5).flat()).map(p=>[G[0]*p[0]+G[1],G[2]*p[1]+G[3]] as [number,number]);
console.log("ghost contour pts:",gpts.length);
function coverage(s:number,tx:number,ty:number){
  let hit=0,tot=0;
  for(const p of gpts){
    const x=s*p[0]+tx,y=s*p[1]+ty;
    const gx=Math.floor((x-X0)/cell),gy=Math.floor((y-Y0)/cell);
    if(gx<0||gy<0||gx>=W||gy>=H)continue;
    tot++;if(bkD[gy*W+gx])hit++;
  }
  return tot?hit/tot:0;
}
for(const s of [1.0,1.02,1.04,1.06]){
  let b={tx:0,ty:0,v:0};
  for(let tx=-420;tx<=-220;tx+=10)for(let ty=-220;ty<=20;ty+=10){const v=coverage(s,tx,ty);if(v>b.v)b={tx,ty,v};}
  let b2={...b};
  for(let tx=b.tx-10;tx<=b.tx+10.1;tx+=2.5)for(let ty=b.ty-10;ty<=b.ty+10.1;ty+=2.5){const v=coverage(s,tx,ty);if(v>b2.v)b2={tx,ty,v};}
  console.log(`s=${s}: tx=${b2.tx.toFixed(1)} ty=${b2.ty.toFixed(1)} coverage=${b2.v.toFixed(3)}`);
}
// baseline coverage (ghostCss only)
console.log("baseline coverage:",coverage(1,0,0).toFixed(3));

console.log("--- coverage for IoU-optimal candidates ---");
for(const [s,tx,ty,l] of [[1.085,-362,-144,"iou-zone"],[1.04,-330,-110,"iou-s1.04"],[1.02,-385,-100,"cov-opt"],[1,0,0,"noR"]] as const)
  console.log(l, coverage(s,tx,ty).toFixed(3));
// ghost bbox after each transform (whole char)
const gb:[number,number][]=[[397,165],[1183,929]];
for(const [s,tx,ty,l] of [[1.085,-362,-144,"iou-zone"],[1.02,-385,-100,"cov-opt"]] as const){
  const p0=[s*gb[0][0]+tx,s*gb[0][1]+ty],p1=[s*gb[1][0]+tx,s*gb[1][1]+ty];
  console.log(l,"ghost char bbox ->",p0.map(v=>v.toFixed(0)),p1.map(v=>v.toFixed(0)));
}
console.log("bbox-align coverage:", coverage(1.0216,-243.6,2.7).toFixed(3));
console.log("s1.02 t-310,-92 (iou-s1.02):", coverage(1.02,-310,-92.5).toFixed(3));
// scan: maximize coverage subject to ghost bbox covering bunkai crossing zone x[500,970]y[450,900]
// report Pareto: for s in range, best coverage with tx,ty constrained so ghost right edge>=950 and left<=500
const gb2:[number,number][]=[[397,165],[1183,929]];
for(const s of [1.0,1.02,1.04]){
  let b={tx:0,ty:0,v:0};
  for(let tx=-420;tx<=-200;tx+=8)for(let ty=-200;ty<=40;ty+=8){
    // constraint: transformed ghost bbox must span bunkai char bbox approx
    const l=s*gb2[0][0]+tx, r=s*gb2[1][0]+tx, t=s*gb2[0][1]+ty, bo=s*gb2[1][1]+ty;
    if(r<940||l>180||t>180||bo<930)continue;
    const v=coverage(s,tx,ty);if(v>b.v)b={tx,ty,v};
  }
  console.log(`constrained s=${s}: tx=${b.tx} ty=${b.ty} cov=${b.v.toFixed(3)}`);
}
