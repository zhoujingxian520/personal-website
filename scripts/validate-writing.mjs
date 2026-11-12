import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateRegistryHistory, validateWritingHTML } from './writing-model.mjs';

export async function validateWritingBuild(directory) {
  const registry = JSON.parse(await readFile(new URL('../data/writing-ids.json', import.meta.url), 'utf8'));
  validateWritingHTML(await readFile(new URL('learning/cet6/index.html', directory), 'utf8'), registry);
  // Keep deleted IDs in the tracked ledger, even when retired.
  const previous = spawnSync('git', ['show', 'HEAD:data/writing-ids.json'], { encoding: 'utf8', cwd: new URL('../', import.meta.url) });
  if (previous.status === 0) {
    validateRegistryHistory(registry, JSON.parse(previous.stdout));
  }
  console.log('[writing] DOM targets, backlinks and ID ledger validated.');
}
