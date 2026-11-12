import { open,readFile,writeFile,rename,unlink } from 'node:fs/promises';
import { allocateCategories } from './category-model.mjs';
import { categoryURL,previousCategories } from './category-data.mjs';
const lock=new URL('../data/.category-sync.lock',import.meta.url),temp=new URL('../data/.category-sync.tmp',import.meta.url);
let handle;
try{handle=await open(lock,'wx');}catch(error){if(error.code==='EEXIST')throw new Error('Category sync already running; inspect the lock before retrying.');throw error;}
try{
 const original=await readFile(categoryURL,'utf8');const next=allocateCategories(JSON.parse(original),previousCategories());const text=JSON.stringify(next,null,2)+'\n';
 if(original!==text){await writeFile(temp,text);await rename(temp,categoryURL);}
 const pending=next.categories.filter(c=>c.state==='active'&&next.assignments[c.id]===null);
 if(pending.length)console.warn('[categories] Color pool exhausted; pending: '+pending.map(c=>c.label).join(', '));
 console.log('[categories] Stable assignments synchronized.');
}finally{await handle.close();await unlink(lock);await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
