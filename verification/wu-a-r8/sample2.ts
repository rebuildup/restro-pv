import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// fine grid over x560-860 y300-800
for(let y=300;y<800;y+=40){let line=`y${y}: `;for(let x=540;x<900;x+=30){const i=(y*p.width+x)*4;line+=`${p.data[i]},${p.data[i+1]},${p.data[i+2]} `;}console.log(line);}
