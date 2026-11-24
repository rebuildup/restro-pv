import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// find leftmost dark pixel per row-band in x<560, and count ink x<480
for(let y=0;y<1080;y+=60){let minx=9999,n480=0,n560=0;
 for(let yy=y;yy<y+60;yy++)for(let x=0;x<600;x++){const i=(yy*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];
  if(l<120){if(x<minx)minx=x;if(x<480)n480++;if(x<560)n560++;}}
 console.log("y"+y,"minx<600:",minx===9999?"-":minx,"n<480:",n480,"n<560:",n560);}
