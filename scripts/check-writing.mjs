import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWritingIndex, validateWritingHTML, validateRegistryHistory } from './writing-model.mjs';
function fixture() {
  const body = '<a id="occ-test-001" data-pattern-id="pattern-test" data-location="第一段" href="#pattern-test">Example</a>';
  return {
    essays: [{ data: { stableId: 'essay-test', title: 'Test' }, body }],
    patterns: [{ data: { stableId: 'pattern-test' }, body: '' }],
    registry: {
      'essay-test': { kind: 'essay', owner: 'essay-test', state: 'active' },
      'pattern-test': { kind: 'pattern', owner: 'pattern-test', state: 'active' },
      'occ-test-001': { kind: 'occ', owner: 'essay-test', state: 'active' },
    },
  };
}
test('extract exact occurrence without deriving IDs from text', () => {
  const f = fixture();
  const index = createWritingIndex(f.essays, f.patterns, f.registry);
  assert.equal(index[0].excerpt, 'Example');
  f.essays[0].body = f.essays[0].body.replace('Example', 'Revised example');
  assert.equal(createWritingIndex(f.essays, f.patterns, f.registry)[0].id, index[0].id);
});
for (const [name, change] of [
  ['duplicate ID', f => { f.essays[0].body += f.essays[0].body; }],
  ['missing pattern', f => { f.patterns = []; }],
  ['wrong outbound URL', f => { f.essays[0].body = f.essays[0].body.replace('href="#pattern-test"', 'href="#essay-test"'); }],
  ['nested anchors', f => { f.essays[0].body = f.essays[0].body.replace('Example', '<a href="#pattern-test">nested</a>'); }],
  ['unregistered deletion', f => { f.essays[0].body = ''; }],
  ['missing location', f => { f.essays[0].body = f.essays[0].body.replace('data-location="第一段"', ''); }],
]) test(`reject ${name}`, () => {
  const f = fixture(); change(f);
  assert.throws(() => createWritingIndex(f.essays, f.patterns, f.registry), /\[writing\]/);
});
test('retired IDs need a reason and renderable compatibility target', () => {
  const f = fixture(); f.essays[0].body = '';
  f.registry['occ-test-001'].state = 'retired';
  assert.throws(() => createWritingIndex(f.essays, f.patterns, f.registry));
  f.registry['occ-test-001'].reason = 'Example removed';
  assert.deepEqual(createWritingIndex(f.essays, f.patterns, f.registry), []);
});
test('final HTML validates targets and exactly one correct return link', () => {
  const f = fixture();
  const html = `<details id="essay-test">${f.essays[0].body}</details><section id="pattern-test"><a href="#occ-test-001" data-writing-return="pattern-test">Return</a></section>`;
  validateWritingHTML(html, f.registry);
  assert.throws(() => validateWritingHTML(html.replace('data-writing-return="pattern-test"', 'data-writing-return="pattern-other"'), f.registry));
  assert.throws(() => validateWritingHTML(html.replace('id="occ-test-001"', ''), f.registry));
  assert.throws(() => validateWritingHTML(html + '<p id="essay-test">duplicate</p>', f.registry));
});
test('historical IDs cannot disappear, change owners or be reused after retirement', () => {
  const f = fixture(); const old = structuredClone(f.registry);
  delete f.registry['occ-test-001'];
  assert.throws(() => validateRegistryHistory(f.registry, old));
  const moved = structuredClone(old); moved['occ-test-001'].owner = 'essay-other';
  assert.throws(() => validateRegistryHistory(moved, old));
  const retired = structuredClone(old); retired['occ-test-001'].state = 'retired';
  validateRegistryHistory(retired, old);
  assert.throws(() => validateRegistryHistory(old, retired));
});
