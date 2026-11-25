import { PNG } from "pngjs";
import fs from "fs";
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const W = p.width, H = p.height;
const dark=(x:number,y:number)=>{const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];return r<90&&g<90&&b<95;};
const colN:number[]=[];
for(let x=0;x<W;x++){let c=0;for(let y=0;y<H;y++)if(dark(x,y))c++;colN.push(c);}
const ranges:string[]=[];let s=-1,prev=-2;
for(let x=0;x<W;x++){if(colN[x]>80){if(s<0)s=x;}else{if(s>=0){ranges.push(`${s}-${prev}`);s=-1;}}prev=x;}
if(s>=0)ranges.push(`${s}-${prev}`);
console.log("col>80:",ranges.join(","));
// find leftmost/rightmost/bottom extents of thick ink in right zone only (x>=480)
let minx=W,maxx=-1,miny=H,maxy=-1;
for(let y=0;y<H;y++)for(let x=480;x<W;x++)if(dark(x,y)){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
console.log(`ink bbox x${minx}-${maxx} y${miny}-${maxy}`);
