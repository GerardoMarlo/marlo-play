import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const dir='editorial/public/brand/fresh/';
const file=dir+'elephant.svg';
const old=await readFile(file,'utf8');
// The two trunk edges are true normal offsets, 18 units either side
// of one centreline. Its width is independent of the spiral curvature.
const points=[];
for(let i=0;i<=100;i++){
 const t=i/100,u=1-t;
 points.push([u*u*u*420+3*u*u*t*450+3*u*t*t*480+t*t*t*510,
 u*u*u*202+3*u*u*t*202+3*u*t*t*243.474+t*t*t*240]);
}
for(let i=1;i<=600;i++){
 const t=6.4*i/600,a=Math.PI/2-t,r=95-11*t;
 points.push([510+r*Math.cos(a),145+r*Math.sin(a)]);
}
for(const p of points){p[0]=420+(p[0]-420)*0.78;p[1]=202+(p[1]-202)*0.78;}
const left=[],right=[];
for(let i=0;i<points.length;i++){
 const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
 const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);
 left.push([points[i][0]+14.04*dy/n,points[i][1]-14.04*dx/n]);
 right.push([points[i][0]-14.04*dy/n,points[i][1]+14.04*dx/n]);
}
left[0]=[420,187.96];right[0]=[420,216.04];
const xy=p=>p.map(v=>v.toFixed(3)).join(' ');
const legs=old.match(/V334C420[\s\S]*?334Z/)[0];
const outline='M100 334V146C100 103.474 134.474 69 177 69H343C385.526 69 420 103.474 420 146V187.96'+left.slice(1).map(p=>'L'+xy(p)).join('')+'A14.04 14.04 0 0 1 '+xy(right.at(-1))+right.slice(0,-1).reverse().map(p=>'L'+xy(p)).join('')+legs;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440" fill="none" color="#28251f"><title>Elefante Marlo con trompa de ancho uniforme</title><desc>Los bordes de la trompa mantienen 28.08 unidades de separación perpendicular, con un remate redondo.</desc><g stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="${outline}"/><path d="M306 140C282 126 260 143 260 166C260 189 282 206 306 192"/></g><circle cx="371" cy="157" r="10" fill="currentColor"/></svg>`;
await writeFile(file,svg);
await writeFile(dir+'elephant.png',await sharp(Buffer.from(svg)).resize(1280).png().toBuffer());
await writeFile(dir+'coiled-preview.png',await sharp(Buffer.from(svg)).resize(960).flatten({background:'#fff8ea'}).png().toBuffer());
console.log('Constant normal edge separation: 28.08 SVG units.');
