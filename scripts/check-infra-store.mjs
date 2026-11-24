import test from 'node:test';
import assert from 'node:assert/strict';
import { InfraStore, emptyData, parseBackup, mergeBackup, previewImport } from '../src/scripts/infra-store.ts';

const record = text => ({projectId:'infra-project-test', contentVersion:'v1', text, updatedAt:'2026-11-13T00:00:00Z'});
const manifest = {notes:{'infra-fragment-test':'v1'}, experiments:{}, mastery:{}};

test('保存刷新、JSON 往返及默认保留冲突；失效记录仍可备份', () => {
  let raw = null;
  const storage = {getItem:()=>raw, setItem:(_,value)=>{raw=value;}};
  const store = new InfraStore(()=>storage);
  const data = emptyData(); data.notes['infra-fragment-test']=record('中文\n<b>文本</b>');
  assert.equal(store.save(data),true);
  const reloaded = new InfraStore(()=>storage);
  assert.deepEqual(parseBackup(reloaded.backup()),data);
  const incoming = emptyData(); incoming.notes['infra-fragment-test']=record('导入内容'); incoming.notes['infra-fragment-removed']=record('保留失效内容');
  assert.deepEqual(previewImport(data,incoming,manifest),{added:1,conflicts:1,missing:1,outdated:0});
  assert.equal(mergeBackup(data,incoming).notes['infra-fragment-test'].text,data.notes['infra-fragment-test'].text);
  assert.equal(mergeBackup(data,incoming,true).notes['infra-fragment-test'].text,'导入内容');
  assert.equal(Object.keys(mergeBackup(data,incoming).notes).length,2);
});

test('损坏或未知版本拒绝导入；写入失败保留原存储并允许导出会话', () => {
  assert.throws(()=>parseBackup('{broken'));
  assert.throws(()=>parseBackup(JSON.stringify({...emptyData(),schemaVersion:2})));
  const original=JSON.stringify(emptyData());
  const storage={getItem:()=>original,setItem:()=>{throw new Error('quota');}};
  const store=new InfraStore(()=>storage);
  const incoming=emptyData(); incoming.notes['infra-fragment-test']=record('草稿');
  assert.throws(()=>store.save(incoming,true));
  assert.deepEqual(store.data,emptyData());
  assert.equal(store.save(incoming),false);
  assert.equal(parseBackup(store.backup()).notes['infra-fragment-test'].text,'草稿');
  assert.equal(storage.getItem(),original);
  const unreadable=new InfraStore(()=>{throw new Error('disabled');});
  assert.equal(unreadable.persistent,false);
});
