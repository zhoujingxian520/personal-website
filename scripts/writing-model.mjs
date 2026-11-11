import { parseFragment } from 'parse5';

export function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}
export const attrs = node => Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
const fail = message => { throw new Error(`[writing] ${message}`); };

export function validateRegistryHistory(registry, old) {
  for (const [id, record] of Object.entries(old)) {
    if (!registry[id]) fail(`Historical ID removed from ledger: ${id}`);
    if (registry[id].kind !== record.kind || registry[id].owner !== record.owner || (record.state === 'retired' && registry[id].state !== 'retired')) fail(`Historical ID reassigned: ${id}`);
  }
}

export function createWritingIndex(essays, patterns, registry) {
  const ids = new Set();
  const occurrences = [];
  function register(id, kind, owner) {
    if (!new RegExp(`^${kind}-[a-z0-9]+(?:-[a-z0-9]+)*$`).test(id)) fail(`Invalid ${kind} ID: ${id}`);
    if (ids.has(id)) fail(`Duplicate ID: ${id}`);
    ids.add(id);
    const record = registry[id];
    if (!record || record.state !== 'active' || record.kind !== kind || record.owner !== owner) fail(`Missing/mismatched active registry entry: ${id}`);
  }
  for (const p of patterns) register(p.data.stableId, 'pattern', p.data.stableId);
  const patternIds = new Set(patterns.map(p => p.data.stableId));
  for (const essay of essays) register(essay.data.stableId, 'essay', essay.data.stableId);
  for (const entry of [...essays, ...patterns]) {
    const isEssay = essays.includes(entry);
    const tree = parseFragment(entry.body || '', { sourceCodeLocationInfo: true });
    walk(tree, node => {
      if (!node.tagName) return;
      const a = attrs(node);
      if (node.tagName === 'a' && !node.sourceCodeLocation?.endTag) fail(`Unclosed or nested link in ${entry.data.stableId}`);
      if (!a.id && !a['data-pattern-id']) return;
      if (!isEssay || node.tagName !== 'a' || !a.id?.startsWith('occ-')) fail(`Only occurrence links may declare body IDs: ${entry.data.stableId}`);
      register(a.id, 'occ', entry.data.stableId);
      const patternId = a['data-pattern-id'];
      if (!patternIds.has(patternId)) fail(`Unknown pattern: ${patternId}`);
      if (a.href !== `#${patternId}` || a.target || a.download !== undefined) fail(`Incorrect occurrence link: ${a.id}`);
      if (!a['data-location']?.trim() || !text(node).trim()) fail(`Missing location/excerpt: ${a.id}`);
      occurrences.push({ id: a.id, essayId: entry.data.stableId, essayTitle: entry.data.title, patternId, location: a['data-location'], excerpt: text(node).trim() });
    });
  }
  for (const [id, record] of Object.entries(registry)) {
    if (!['essay', 'pattern', 'occ'].includes(record.kind) || !new RegExp(`^${record.kind}-[a-z0-9]+(?:-[a-z0-9]+)*$`).test(id)) fail(`Invalid registry ID: ${id}`);
    if (record.state === 'active') { if (!ids.has(id)) fail(`Registered ID removed without retirement: ${id}`); }
    else if (record.state === 'retired') { if (!record.reason?.trim()) fail(`Retirement requires reason: ${id}`); }
    else fail(`Invalid registry state: ${id}`);
  }
  return occurrences;
}

export function validateWritingHTML(html, registry) {
  const tree = parseFragment(html, { sourceCodeLocationInfo: true });
  const ids = new Map();
  const links = [];
  walk(tree, node => {
    const a = attrs(node);
    if (a.id) { if (ids.has(a.id)) fail(`Duplicate DOM ID: ${a.id}`); ids.set(a.id, a); }
    if (node.tagName === 'a') {
      if (!node.sourceCodeLocation?.endTag) fail('Unclosed/nested link in final HTML');
      links.push(a);
    }
  });
  for (const id of Object.keys(registry)) if (!ids.has(id)) fail(`Missing DOM target: ${id}`);
  for (const link of links) {
    if (link.href?.startsWith('#') && !ids.has(link.href.slice(1))) fail(`Broken fragment link: ${link.href}`);
    if (link['data-writing-return']) {
      const target = ids.get(link.href?.slice(1));
      if (!target || target['data-pattern-id'] !== link['data-writing-return']) fail(`Incorrect return link: ${link.href}`);
    }
  }
  for (const [id, record] of Object.entries(registry)) {
    if (record.kind === 'occ' && record.state === 'active') {
      const pattern = ids.get(id)['data-pattern-id'];
      if (ids.get(id).href !== `#${pattern}` || registry[pattern]?.state !== 'active') fail(`Invalid DOM occurrence: ${id}`);
      const returns = links.filter(a => a.href === `#${id}` && a['data-writing-return'] === pattern);
      if (returns.length !== 1) fail(`Expected exactly one generated return link: ${id}`);
    }
  }
}
