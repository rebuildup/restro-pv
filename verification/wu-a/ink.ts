import { PNG } from "pngjs";
import { readFileSync } from "fs";
const a = PNG.sync.read(readFileSync(process.argv[2]));
// count dark pixels in panel region and find bbox of dark pixels
let minx=1e9,miny=1e9,maxx=-1,miny2=-1,cnt=0;
for(let y=170;y<910;y++)for(let x=470;x<1040;x++){
  const i=(y*a.width+x)*4;
  const lum=(a.data[i]+a.data[i+1]+a.data[i+2])/3;
  if(lum<100){cnt++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>miny2)miny2=y;}
}
console.log("dark px",cnt,"bbox",minx,miny,maxx,miny2);
// red pixels
let rc=0,rminx=1e9,rmaxx=-1,rminy=1e9,rmaxy=-1;
for(let y=170;y<910;y++)for(let x=470;x<1040;x++){
  const i=(y*a.width+x)*4;
  const r=a.data[i],g=a.data[i+1],b=a.data[i+2];
  if(r>120&&r>g*1.6&&r>b*1.6){rc++;if(x<rminx)rminx=x;if(x>rmaxx)rmaxx=x;if(y<rminy)rminy=y;if(y>rmaxy)rmaxy=y;}
}
console.log("red px",rc,"bbox",rminx,rminy,rmaxx,rmaxy);
