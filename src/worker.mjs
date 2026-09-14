import { origins } from './catalog.mjs';
import { HTML } from './generated.mjs';
export function targetFor(url){
 const slug=url.pathname.split('/')[1],origin=origins[slug];
 if(!Object.hasOwn(origins,slug))return null;
 const path=url.pathname.slice(slug.length+1)||'/';
 return {slug,url:new URL(origin+path+url.search)};
}
export async function handle(request,fetchOrigin=fetch){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const target=targetFor(url);
 if(!target){
  const home=url.pathname==='/';
  if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\n');
  return new Response(request.method==='HEAD'?null:home?HTML:'<!doctype html><html lang="en"><title>Not found · MARLO</title><body><h1>Nothing here yet.</h1><a href="/">Back to MARLO</a></body></html>',{status:home?200:404,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
 }
 try{
  // No cookies or authorization are forwarded between independent projects.
  const headers=new Headers();for(const name of ['Accept','Accept-Language','Range','If-Range'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
  let response=await fetchOrigin(target.url.href,{method:request.method,headers,redirect:'manual'});
  const out=new Headers(response.headers);out.delete('Set-Cookie');out.delete('X-Robots-Tag');out.delete('Link');
  const location=out.get('Location');
  if(location){const next=new URL(location,target.url);if(next.origin!==target.url.origin)return new Response('Unsupported origin redirect',{status:502});out.set('Location',`/${target.slug}${next.pathname==='/'?'':next.pathname}${next.search}${next.hash}`);}
  const html=(out.get('Content-Type')??'').includes('text/html');
  if(html&&/\.[a-z0-9]+$/i.test(target.url.pathname)&&!target.url.pathname.endsWith('.html'))return new Response('Asset not found',{status:404});
  if(html){out.delete('Content-Length');out.delete('ETag');out.set('Cache-Control','no-cache');out.set('Link',`<https://play.marlo.games/${target.slug}>; rel="canonical"`);}
  response=new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
  if(html&&request.method!=='HEAD')return new HTMLRewriter().on('base',{element(e){e.setAttribute('href',`/${target.slug}/`);}}).on('link[rel="canonical"]',{element(e){e.remove();}}).on('head',{element(e){e.append(`<link rel="canonical" href="https://play.marlo.games/${target.slug}">`,{html:true});}}).transform(response);
  return response;
 }catch{return new Response('This game is temporarily unavailable. Please try again shortly.',{status:502,headers:{'Cache-Control':'no-store'}});}
}
export default {fetch:request=>handle(request)};
