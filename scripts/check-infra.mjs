import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInfraModel } from './infra-model.mjs';

function fixture() {
  return {
    projects: [{ id: 'project.md', body: '```python infra:infra-block-test\nprint(1)\n```', data: {
      projectId: 'infra-project-test', blocks: [{ blockId: 'infra-block-test', language: 'python' }],
      fragments: [{ fragmentId: 'infra-fragment-test', blockId: 'infra-block-test', startLine: 1, endLine: 1, knowledgeIds: ['infra-knowledge-test'] }],
      unitIds: ['infra-unit-test'],
    } }],
    knowledge: [{ id: 'knowledge.md', data: { knowledgeId: 'infra-knowledge-test' } }],
    units: [{ id: 'unit.md', data: { unitId: 'infra-unit-test', projectId: 'infra-project-test', fragmentIds: ['infra-fragment-test'] } }],
  };
}
const build = ({ projects, knowledge, units }) => buildInfraModel(projects, knowledge, units);

test('有效内容生成代码片段与知识反向索引；空内容可用', () => {
  const model = build(fixture());
  assert.equal(model.appearances.get('infra-knowledge-test')[0].code, 'print(1)');
  assert.equal(buildInfraModel([], [], []).projects.length, 0);
});

test('内容错误给出文件与问题：重复 ID、越界行号、悬空知识', () => {
  const duplicate = fixture();
  duplicate.knowledge.push({ id: 'duplicate.md', data: { knowledgeId: 'infra-knowledge-test' } });
  assert.throws(() => build(duplicate), /duplicate.md: 重复 ID/);
  const range = fixture();
  range.projects[0].data.fragments[0].endLine = 2;
  assert.throws(() => build(range), /project.md: .*行范围/);
  const missing = fixture();
  missing.knowledge = [];
  assert.throws(() => build(missing), /project.md: .*不存在的知识/);
});
