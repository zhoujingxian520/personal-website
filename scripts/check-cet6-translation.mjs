import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseCet6Translation } from '../src/lib/cet6-translation.mjs';

const template = readFileSync(new URL('../docs/templates/六级翻译笔记模板.md', import.meta.url), 'utf8');
const sample = template.split('```markdown')[1].split('```')[0].trim();
const lineOf = (input, text) => input.split('\n').findIndex(line => line.includes(text)) + 1;

test('the empty master is a valid document', () => {
  assert.deepEqual(parseCet6Translation('# 翻译篇目\n\n# 译法讲解\n'), []);
});

test('one technique indexes each occurrence in source order', () => {
  const [translation, technique] = parseCet6Translation(sample);
  assert.equal(translation.id, 'tr-001');
  assert.equal(technique.id, 'tf-001');
  for (const section of ['中文原文', '参考译文', '我的初译', '订正与笔记']) {
    assert.ok(translation.body.includes('### ' + section));
  }
  assert.deepEqual(technique.data.examples.map(({ id, translationId, excerpt }) => [id, translationId, excerpt]), [
    ['occ-tr-001-1', 'tr-001', 'known for'],
    ['occ-tr-001-2', 'tr-001', 'known for'],
  ]);
  for (const { id } of technique.data.examples) {
    assert.ok(translation.body.includes('<a id="' + id + '" href="#tf-001">known for</a>'));
  }
});

test('same-ID edits and line endings produce the expected entries without duplicates', () => {
  const revised = sample.replace('古镇的传统工艺', '古镇手工艺').replace('traditional woodcarving', 'woodcarving');
  const result = parseCet6Translation(revised);
  assert.equal(result.length, 2);
  assert.equal(result[0].data.title, '古镇手工艺（演示）');
  assert.equal(result[1].data.examples[0].translationTitle, result[0].data.title);
  assert.doesNotMatch(result[0].body, /traditional woodcarving\. Nearby villages are <a/);
  assert.deepEqual(result, parseCet6Translation('\uFEFF' + revised.replaceAll('\n', '\r\n')));
});

test('code and existing Markdown links preserve literal marker examples', () => {
  const addition = '\n\n' + [
    '`[[tf-999|inline]]`',
    '[[[tf-999|link label]]](https://example.test)',
    '```md',
    '# Another root',
    '[[tf-999|fenced example]]',
    '```',
  ].join('\n');
  const [translation, technique] = parseCet6Translation(sample.replace('\n\n### 我的初译', addition + '\n\n### 我的初译'));
  assert.equal(technique.data.examples.length, 2);
  assert.ok(translation.body.includes(addition));
});

test('excerpt HTML is escaped while the example keeps its text', () => {
  const [translation, technique] = parseCet6Translation(sample.replace('[[tf-001|known for]]', '[[tf-001|arts & crafts]]'));
  assert.ok(translation.body.includes('>arts &amp; crafts</a>'));
  assert.equal(technique.data.examples[0].excerpt, 'arts & crafts');
});

test('duplicate IDs report the second heading line', () => {
  const duplicate = sample + '\n\n## tf-001 重复\n\n解释。';
  assert.throws(() => parseCet6Translation(duplicate), {
    message: 'notes/cet6-translation.md:' + lineOf(duplicate, 'tf-001 重复') + ' 编号重复 tf-001',
  });
});

test('missing or blank required sections identify the title or section line', () => {
  const missing = sample.replace('### 参考译文', '### 译文');
  assert.throws(() => parseCet6Translation(missing), {
    message: 'notes/cet6-translation.md:' + lineOf(missing, '## tr-001') + ' 篇目 tr-001 缺少「参考译文」正文',
  });
  const blank = sample.replace(/^The town is \[\[tf-001.*$/m, '');
  assert.throws(() => parseCet6Translation(blank), {
    message: 'notes/cet6-translation.md:' + lineOf(blank, '### 参考译文') + ' 篇目 tr-001 缺少「参考译文」正文',
  });
});

test('a missing technique reports the exact marker line in a multiline paragraph', () => {
  const unknown = sample.replace('Nearby villages are [[tf-001', '\nNearby villages are [[tf-987');
  assert.throws(() => parseCet6Translation(unknown), {
    message: 'notes/cet6-translation.md:' + lineOf(unknown, '[[tf-987') + ' 篇目 tr-001 引用了不存在的译法 tf-987',
  });
});
