import test from 'node:test';
import assert from 'node:assert/strict';
import { hasQuestion, comparisonMessage } from '../src/scripts/infra-review.ts';
import { emptyData, parseBackup } from '../src/scripts/infra-store.ts';

const experiment = environment => ({contentVersion:'v1',prediction:'预期',environment,observation:'输出',conclusion:'解释',updatedAt:'2026-11-15'});
test('疑问识别和对比说明不把条件缺失、差异或旧版本当优化成功', () => {
  assert.equal(hasQuestion('这里为什么要计时？'),true);
  assert.equal(hasQuestion('已经理解'),false);
  assert.match(comparisonMessage(),/先填写/);
  assert.match(comparisonMessage(experiment(''),experiment('CPU')),/未填写/);
  assert.match(comparisonMessage(experiment('Windows'),experiment('Ubuntu')),/条件不同/);
  assert.match(comparisonMessage(experiment('CPU'),experiment('CPU')),/仍核对/);
});
test('原 v1 备份保留；增加变体与可选指标后可往返', () => {
  const original=emptyData(); original.experiments['infra-project-test']=experiment('CPU');
  const restored=parseBackup(JSON.stringify(original));
  assert.deepEqual(restored,original);
  restored.experiments['infra-project-test-variant']={...experiment('CPU'),elapsed:'5 ms',memory:'未测量',correctness:'输出符合预期'};
  assert.deepEqual(parseBackup(JSON.stringify(restored)),restored);
  assert.deepEqual(restored.experiments['infra-project-test'],original.experiments['infra-project-test']);
});
