import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import { readFileSync,readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { validateCategories,categoryFor } from './category-model.mjs';
export const categoryURL=pathToFileURL(resolve('data/writing-categories.json'));
export function previousCategories(){const r=spawnSync('git',['show','HEAD:data/writing-categories.json'],{encoding:'utf8',cwd:process.cwd()});return r.status===0?JSON.parse(r.stdout):undefined;}
export function readCategories(){return validateCategories(JSON.parse(readFileSync(categoryURL,'utf8')),previousCategories());}
export function patternCategories(data=readCategories()) {
  const map=new Map();
  function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())scan(url);else if(entry.name.endsWith('.md')){const {frontmatter:f}=parseFrontmatter(readFileSync(url,'utf8'));const c=categoryFor(data,f.categoryId);if((f.demo===true)!==(c.scope==='demo'))throw new Error('[categories] Pattern/category scope mismatch: '+f.stableId);map.set(f.stableId,c);}}}
  scan(pathToFileURL(resolve('src/content/patterns')+'/'));return map;
}
