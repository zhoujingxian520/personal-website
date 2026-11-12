import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, parseFragment, serialize } from 'parse5';
import { build } from 'esbuild';
import { walk, attrs } from './writing-model.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');const output=path.join(root,'outputs/网站预览');
const built=spawnSync(process.execPath,[path.join(root,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:root,stdio:'inherit',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
if(built.status!==0)process.exit(built.status||1);
if(path.dirname(output)!==path.join(root,'outputs')||path.basename(output)!=='网站预览')throw new Error('Unexpected export target');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});await cp(dist,output,{recursive:true});
async function htmlFiles(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await htmlFiles(p));else if(e.name.endsWith('.html'))files.push(p);}return files;}
const sourceFiles=await htmlFiles(dist);
for(const source of sourceFiles){
 const relative=path.relative(dist,source);const dest=path.join(output,relative);const tree=parse(await readFile(source,'utf8'));const nodes=[];walk(tree,n=>nodes.push(n));
 const urlFor=(value)=>{const u=new URL(value,'https://offline.invalid/'+relative.replaceAll('\\','/'));return u;};
 const rel=(value)=>{if(!value||value.startsWith('#')||/^(?:data:|mailto:|tel:|https?:|javascript:)/i.test(value))return value;const u=urlFor(value);let p=decodeURIComponent(u.pathname).slice(1);if(p.endsWith('/')||!p)p+='index.html';return (path.relative(path.dirname(relative),p).replaceAll('\\','/')||'index.html')+u.search+u.hash;};
 const css=(text)=>text.replace(/url\((['"]?)(\/[^)'"\s]+)\1\)/g,(_,q,u)=>`url("${rel(u)}")`);
 function replace(node,html){const next=parseFragment(html).childNodes;const i=node.parentNode.childNodes.indexOf(node);next.forEach(n=>n.parentNode=node.parentNode);node.parentNode.childNodes.splice(i,1,...next);}
 for(const node of nodes){const a=attrs(node);
  if(node.tagName==='script'&&a.type==='module'){
   const code=a.src?await readFile(path.join(dist,decodeURIComponent(a.src).replace(/^\//,'')),'utf8'):(node.childNodes||[]).map(n=>n.value||'').join('');
   const result=await build({stdin:{contents:code,resolveDir:a.src?path.dirname(path.join(dist,a.src.replace(/^\//,''))):path.dirname(source)},bundle:true,format:'iife',platform:'browser',write:false,minify:true,plugins:[{name:'root-assets',setup(b){b.onResolve({filter:/^\//},arg=>({path:path.join(dist,arg.path.slice(1))}));}}]});
   replace(node,'<script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>');continue;
  }
  if(node.tagName==='link'&&a.rel==='stylesheet'){const code=await readFile(path.join(dist,a.href.replace(/^\//,'')),'utf8');replace(node,'<style>'+css(code)+'</style>');continue;}
  for(const attr of node.attrs||[]){if(['href','src','poster'].includes(attr.name))attr.value=rel(attr.value);if(attr.name==='style')attr.value=css(attr.value);}
  if(node.tagName==='style')for(const child of node.childNodes||[])if(child.value)child.value=css(child.value);
 }
 await writeFile(dest,serialize(tree));
}
// Validate the exported folder as a complete local document graph.
const ids=new Map();for(const source of sourceFiles){const file=path.join(output,path.relative(dist,source));const set=new Set();walk(parse(await readFile(file,'utf8')),n=>{const a=attrs(n);if(a.id)set.add(a.id);});ids.set(file,set);}
for(const file of ids.keys()){const tree=parse(await readFile(file,'utf8'));const links=[];walk(tree,n=>{const a=attrs(n);if(n.tagName==='a'&&a.href)links.push(a.href);});for(const href of links){if(/^(?:https?:|mailto:|tel:)/.test(href))continue;const url=new URL(href,'file:///'+file.replaceAll('\\','/'));const target=fileURLToPath(url);if(!ids.has(target))throw new Error('Offline link missing: '+href+' in '+file);if(url.hash&&!ids.get(target).has(decodeURIComponent(url.hash.slice(1))))throw new Error('Offline anchor missing: '+href);}}
await writeFile(path.join(root,'outputs/首页预览.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>打开网站预览</title><p><a id="entry" href="./网站预览/index.html">打开 zhoujingxian 网站预览</a></p><script>const a=document.getElementById('entry');const h=location.hash;const writing=/^#(?:(?:essay|pattern|occ)-|writing-library)/.test(h);location.replace((writing?'./网站预览/learning/cet6/index.html':a.getAttribute('href'))+h);</script></html>`);
console.log('已导出 '+ids.size+' 个离线页面：'+path.join(output,'index.html'));
