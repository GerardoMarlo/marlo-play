import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {portal} from './src/portal.mjs';
const css=await readFile('src/portal.css','utf8'),html=portal(css);
await mkdir('dist/assets',{recursive:true});await writeFile('dist/index.html',html);
const assets={};
for(const name of ['marlo-logo.webp','pigeongod-cover-en.webp']){
 assets['/assets/'+name]=(await readFile('assets/'+name)).toString('base64');
 await copyFile('assets/'+name,'dist/assets/'+name);
}
const generated='export const HTML = '+JSON.stringify(html)+';\nexport const ASSETS = '+JSON.stringify(assets)+';\n';
await writeFile('src/generated.mjs',generated);
const catalog=await readFile('src/catalog.mjs','utf8');const worker=(await readFile('src/worker.mjs','utf8')).replace(/^import .*;$/gm,'');
await writeFile('dist/worker.mjs',catalog+'\n'+generated+worker);
console.log('Built static portal and routing Worker.');
