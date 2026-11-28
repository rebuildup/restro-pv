import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// grid sample every 40px in region, print rgb
for(let y=150;y<950;y+=50){let line=`y${y}: `;for(let x=350;x<1080;x+=60){const i=(y*p.width+x)*4;line+=`${p.data[i]},${p.data[i+1]},${p.data[i+2]} | `;}console.log(line);}
