import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
for(let y=250;y<600;y+=25){let l=`y${y}: `;for(let x=450;x<800;x+=25){const i=(y*p.width+x)*4;l+=`${p.data[i]},${p.data[i+1]},${p.data[i+2]} `;}console.log(l);}
