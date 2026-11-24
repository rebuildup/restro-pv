import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const thr=8;
for(let y=0;y<1080;y+=30){let row="";
 for(let x=0;x<1080;x+=30){let n=0;for(let yy=y;yy<y+30;yy++)for(let xx=x;xx<x+30;xx++){const i=(yy*p.width+xx)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l>thr)n++;}
 row+=n>200?"#":n>60?"+":n>10?".":" ";}
 console.log(row);}
