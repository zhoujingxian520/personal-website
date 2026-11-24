import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileNotebook } from '../src/scripts/infra-file.ts';
import { emptyData } from '../src/scripts/infra-store.ts';

test('同一个文件连续写入，并重新打开恢复内容', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'infra-notebook-'));
  const path = join(folder, 'notes.json');
  const handle = {name:'notes.json', getFile:async()=>({text:()=>readFile(path,'utf8')}), requestPermission:async()=> 'granted', createWritable:async()=>{
    let buffer=''; return {write:async text=>{buffer=text;},close:()=>writeFile(path,buffer,'utf8')};
  }};
  const notebook = new FileNotebook(); await notebook.connect(handle);
  const first = emptyData();
  first.notes['infra-fragment-test']={projectId:'infra-project-test',contentVersion:'1',text:'第一次中文输入',updatedAt:'2026-11-13'};
  const second=structuredClone(first); second.notes['infra-fragment-test'].text='第二次\n仍是同一个文件';
  await Promise.all([notebook.write(first),notebook.write(second)]);
  const reopened = new FileNotebook();
  assert.deepEqual(await reopened.read(handle),second);
  console.log(`File roundtrip: ${path}`);
});

test('拒绝授权或写入失败时明确失败，不伪造保存成功', async () => {
  const notebook=new FileNotebook();
  await assert.rejects(notebook.connect({name:'blocked.json', requestPermission:async()=> 'denied'}), /授权/);
  assert.equal(notebook.handle,null);
  await notebook.connect({name:'failed.json', createWritable:async()=>{throw new Error('disk unavailable');}});
  await assert.rejects(notebook.write(emptyData()), /disk unavailable/);
});
