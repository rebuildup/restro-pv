import { PNG } from "pngjs";import fs from "fs";
const p=PNG.sync.read(fs.readFileSync(process.argv[2]));
// for each x in 380..620 count dark px in y300..900 -> find left edge of glyph mass
for(let x=380;x<=640;x+=10){let n=0;for(let y=300;y<900;y++){const i=(y*p.width+x)*4;const l=0.299*p.data[i]+0.587*p.data[i+1]+0.114*p.data[i+2];if(l<100)n++;}
 if(n>50)console.log("x"+x,n);}
