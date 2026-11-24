import { PNG } from "pngjs";
import { readFileSync } from "fs";
const a = PNG.sync.read(readFileSync(process.argv[2]));
let cnt=0,minx=1e9,miny=1e9,maxx=-1,maxy=-1;
for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  const i=(y*a.width+x)*4;const lum=(a.data[i]+a.data[i+1]+a.data[i+2])/3;
  if(lum<100){cnt++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
}
console.log("dark",cnt,"bbox",minx,miny,maxx,maxy);
