import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
let n=0,minx=9999,miny=9999,maxx=-1,maxy=-1;
for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100){n++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}
console.log(p.width+"x"+p.height,"dark:",n,"bbox:",minx===9999?"none":`${minx},${miny}-${maxx},${maxy}`);
