import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = stripTypeScriptTypes(await readFile(new URL('../src/scripts/home.ts', import.meta.url), 'utf8'));

// Exercise the production script with a deterministic clock and browser events.
// This checks timing and lifecycle behavior; visual/browser checks remain separate.
function setup({ reduced = false, hidden = false } = {}) {
  const events = new Map();
  const motionEvents = new Map();
  const timers = new Map();
  let nextId = 0;
  let now = 0;
  const writer = { dataset: { text: '欢迎来到我的世界' }, textContent: '' };
  const element = () => ({
    setAttribute() {}, addEventListener() {}, querySelectorAll: () => [],
    classList: { toggle() {}, remove() {} },
  });
  const nodes = new Map(['#menu-toggle', '#radial-links', '#menu-scrim', '.site-header', '#home'].map(id => [id, element()]));
  nodes.set('#typewriter', writer);
  const document = {
    hidden,
    body: element(),
    querySelector: id => nodes.get(id),
    querySelectorAll: () => [],
    addEventListener: (name, callback) => events.set(name, callback),
  };
  const motion = {
    matches: reduced,
    addEventListener: (name, callback) => motionEvents.set(name, callback),
  };
  vm.runInNewContext(source, {
    document, matchMedia: () => motion, window: { addEventListener() {} }, location: { hash: '' },
    IntersectionObserver: class { observe() {} },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return {
    writer, timers, advance,
    visibility(value) { document.hidden = value; events.get('visibilitychange')(); },
    reduced(value) { motion.matches = value; motionEvents.get('change')(); },
  };
}

test('欢迎语逐字显示、停留三秒、删除并再次开始', () => {
  const page = setup();
  page.advance(650);
  assert.equal(page.writer.textContent, '欢');
  page.advance(700);
  assert.equal(page.writer.textContent, '欢迎来到我的世界');
  page.advance(2999);
  assert.equal(page.writer.textContent, '欢迎来到我的世界');
  page.advance(1);
  assert.equal(page.writer.textContent, '欢迎来到我的世');
  page.advance(350);
  assert.equal(page.writer.textContent, '');
  page.advance(650);
  assert.equal(page.writer.textContent, '欢');
});

test('隐藏标签页暂停，恢复后只有一个计时器', () => {
  const page = setup();
  page.advance(750);
  const before = page.writer.textContent;
  page.visibility(true);
  assert.equal(page.timers.size, 0);
  page.advance(20000);
  assert.equal(page.writer.textContent, before);
  page.visibility(false);
  page.visibility(false);
  assert.equal(page.timers.size, 1);
  page.advance(200);
  assert.equal(page.writer.textContent, '欢迎来');
});

test('减少动态效果直接显示全文且不运行计时器', () => {
  const page = setup({ reduced: true });
  assert.equal(page.writer.textContent, '欢迎来到我的世界');
  assert.equal(page.timers.size, 0);
  page.visibility(true);
  page.visibility(false);
  assert.equal(page.timers.size, 0);
});

test('运行中切换动效偏好会清理和恢复计时器', () => {
  const page = setup();
  page.advance(750);
  page.reduced(true);
  assert.equal(page.writer.textContent, '欢迎来到我的世界');
  assert.equal(page.timers.size, 0);
  page.reduced(false);
  assert.equal(page.timers.size, 1);
  page.advance(650);
  assert.equal(page.writer.textContent, '欢');
});

test('初始隐藏时不启动，恢复后开始显示', () => {
  const page = setup({ hidden: true });
  assert.equal(page.timers.size, 0);
  page.visibility(false);
  page.advance(200);
  assert.equal(page.writer.textContent, '欢');
});
