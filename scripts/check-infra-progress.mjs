import test from 'node:test';
import assert from 'node:assert/strict';
import { countProgress } from '../src/scripts/infra-progress.ts';
import { emptyData, parseBackup } from '../src/scripts/infra-store.ts';

test('手动切换、撤回与备份恢复后的计数一致；重复引用去重', () => {
  const data=emptyData();
  const units=[{unitId:'infra-unit-test',version:'v1'},{unitId:'infra-unit-test',version:'v1'}];
  assert.deepEqual(countProgress(data,units),{learned:0,total:1});
  data.mastery['infra-unit-test']={learned:true,contentVersion:'v1',updatedAt:'2026-11-13'};
  assert.deepEqual(countProgress(parseBackup(JSON.stringify(data)),units),{learned:1,total:1});
  data.mastery['infra-unit-test'].learned=false;
  assert.deepEqual(countProgress(data,units),{learned:0,total:1});
});

test('空路线为零；旧版本与失效单元不计为当前已学会', () => {
  const data=emptyData();
  data.mastery['infra-unit-test']={learned:true,contentVersion:'v1',updatedAt:'2026-11-13'};
  assert.deepEqual(countProgress(data,[]),{learned:0,total:0});
  assert.deepEqual(countProgress(data,[{unitId:'infra-unit-test',version:'v2'}]),{learned:0,total:1});
});
