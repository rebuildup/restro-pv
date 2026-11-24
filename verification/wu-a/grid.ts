import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
for(let y=100;y<1000;y+=100){let row="";
 for(let x=100;x<1080;x+=80){const i=(y*p.width+x)*4;const l=Math.round(0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2]);row+=String(l).padStart(4);}
 console.log("y"+y,row);}
