import { PNG } from "pngjs";import fs from "fs";
for (const f of ["f70","f78","f86","f89"]) {
  const p=PNG.sync.read(fs.readFileSync(`verification/wu-a-r7/${f}.png`));
  let n=0,minX=1e9,minY=1e9,maxX=-1,maxY=-1;
  for(let y=0;y<1080;y++)for(let x=480;x<1080;x++){
    const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];
    if(r>150&&g<130&&b<110&&(r-g)>60){n++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  }
  console.log(f,"red",n,"bbox",n?`${minX},${minY},${maxX},${maxY}`:"none");
}
