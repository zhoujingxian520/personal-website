import { readCategories,patternCategories } from './category-data.mjs';
import {parseFragment} from 'parse5';
import {walk,attrs} from './writing-model.mjs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateRegistryHistory, validateWritingHTML } from './writing-model.mjs';

export async function validateWritingBuild(directory) {
  const registry = JSON.parse(await readFile(new URL('../data/writing-ids.json', import.meta.url), 'utf8'));
  const html=await readFile(new URL('learning/cet6/index.html',directory),'utf8');
  validateWritingHTML(html,registry);
  const colors=patternCategories(readCategories());
  walk(parseFragment(html),node=>{const a=attrs(node);if(a['data-pattern-id']){const c=colors.get(a['data-pattern-id']);if(!c||a['data-category-id']!==c.id||!a.style?.includes('--mark-color:'+c.color))throw new Error('[categories] Rendered marker mapping mismatch: '+a.id);}});

  // Keep deleted IDs in the tracked ledger, even when retired.
  const previous = spawnSync('git', ['show', 'HEAD:data/writing-ids.json'], { encoding: 'utf8', cwd: new URL('../', import.meta.url) });
  if (previous.status === 0) {
    validateRegistryHistory(registry, JSON.parse(previous.stdout));
  }
  console.log('[writing] DOM targets, backlinks and ID ledger validated.');
}
