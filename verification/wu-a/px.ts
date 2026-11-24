import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
for(const [x,y] of [[10,10],[540,540],[800,500],[900,700]]){const i=(y*p.width+x)*4;console.log(x,y,p.data[i],p.data[i+1],p.data[i+2]);}
