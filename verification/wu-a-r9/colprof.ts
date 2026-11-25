import { PNG } from "pngjs";
import fs from "fs";
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const W = p.width, H = p.height;
const dark=(x:number,y:number)=>{const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];return r<90&&g<90&&b<95;};
// column counts of dark pixels in right zone; glyph = thick runs
const colN:number[]=[];
for(let x=480;x<W;x++){let c=0;for(let y=0;y<H;y++)if(dark(x,y))c++;colN.push(c);}
// also row counts for bottom bleed
const rowN:number[]=[];
for(let y=0;y<H;y++){let c=0;for(let x=480;x<W;x++)if(dark(x,y))c++;rowN.push(c);}
// print columns where count>80 as ranges
const ranges:string[]=[];let s=-1,prev=-2;
for(let i=0;i<colN.length;i++){const x=480+i;if(colN[i]>80){if(s<0)s=x;}else{if(s>=0){ranges.push(`${s}-${prev}`);s=-1;}}prev=x;}
if(s>=0)ranges.push(`${s}-${prev}`);
console.log("col>80 ranges:",ranges.join(","));
const rr:string[]=[];s=-1;prev=-2;
for(let y=0;y<H;y++){if(rowN[y]>80){if(s<0)s=y;}else{if(s>=0){rr.push(`${s}-${prev}`);s=-1;}}prev=y;}
if(s>=0)rr.push(`${s}-${prev}`);
console.log("row>80 ranges:",rr.join(","));
// red accent bbox (strict)
let rx0=W,ry0=H,rx1=-1,ry1=-1,rn=0;
for(let y=0;y<H;y++)for(let x=480;x<W;x++){const i=(y*W+x)*4;const r=p.data[i],g=p.data[i+1],b=p.data[i+2];if(r>140&&r-g>60&&r-b>60){if(x<rx0)rx0=x;if(y<ry0)ry0=y;if(x>rx1)rx1=x;if(y>ry1)ry1=y;rn++;}}
console.log(`redR bbox x${rx0}-${rx1} y${ry0}-${ry1} n=${rn}`);
