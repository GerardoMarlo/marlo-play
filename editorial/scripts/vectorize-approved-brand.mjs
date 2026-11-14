import sharp from 'sharp';
import potrace from '../../.tmp-logo-tools/node_modules/potrace/lib/index.js';
import {writeFile} from 'node:fs/promises';
const source='editorial/assets-originals/marlo-elephant-approved.png';
const {data,info}=await sharp(source).greyscale().raw().toBuffer({resolveWithObject:true});
let x0=info.width,y0=info.height,x1=0,y1=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[y*info.width+x]<128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
const width=x1-x0+1,height=y1-y0+1;
const binary=await sharp(source).extract({left:x0,top:y0,width,height}).extend({top:8,bottom:8,left:8,right:8,background:'#ffffff'}).greyscale().threshold(128).png().toBuffer();
const traced=await new Promise((resolve,reject)=>potrace.trace(binary,{threshold:128,turdSize:20,alphaMax:1,optTolerance:0.3,color:'currentColor'},(e,s)=>e?reject(e):resolve(s)));
const path=traced.match(/<path[^>]+\/>/g).join('').replace(/fill="[^"]*"/g,'fill="currentColor"');
const scale=152/(width+16);
const mark=`<g transform="translate(20 ${(136-(height+16)*scale)/2}) scale(${scale})">${path}</g>`;
await writeFile('editorial/assets-originals/marlo-approved-path.svg',mark);
console.log({width,height,svgBytes:mark.length});

