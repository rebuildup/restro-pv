import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
const pts:[[number,number],...number[][]]=[];
for(const [x,y] of [[560,500],[600,500],[650,500],[700,500],[750,500],[800,500],[560,700],[650,700],[750,700],[850,700],[600,900],[700,900],[800,900],[900,900],[500,400],[540,600],[560,800],[620,950],[700,300],[800,300],[900,300],[1000,400],[1000,600],[1000,800]]){
  const i=(y*p.width+x)*4;
  console.log(`(${x},${y}) rgb=${p.data[i]},${p.data[i+1]},${p.data[i+2]}`);
}
