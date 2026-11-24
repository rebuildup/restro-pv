import { PNG } from "pngjs";
import fs from "fs";
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
// interior of panel only, excluding border+caption zone
const x0=480,y0=200,x1=1025,y2=880;
let n=0,minX=1e9,minY=1e9,maxX=-1,maxY=-1,red=0,rMinX=1e9,rMinY=1e9,rMaxX=-1,rMaxY=-1;
for(let y=y0;y<y2;y++)for(let x=x0;x<x1;x++){
  const i=(y*png.width+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];
  const lum=0.299*r+0.587*g+0.114*b;
  const isRed=r>150&&g<110&&b<90;
  if(isRed){red++;if(x<rMinX)rMinX=x;if(x>rMaxX)rMaxX=x;if(y<rMinY)rMinY=y;if(y>rMaxY)rMaxY=y;}
  else if(lum<140){n++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
}
console.log(`dark ${n} bbox ${minX} ${minY} ${maxX} ${maxY}`);
console.log(`red ${red} bbox ${red?rMinX:0} ${red?rMinY:0} ${red?rMaxX:0} ${red?rMaxY:0}`);
