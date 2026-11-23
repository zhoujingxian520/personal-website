import { readFile } from 'node:fs/promises';
import { fromMarkdown } from 'mdast-util-from-markdown';

const notePath = 'notes/cet6-translation.md';

function splitSections(nodes, depth, fail) {
  const sections = [];
  for (const node of nodes) {
    if (node.type === 'heading' && node.depth === depth) {
      sections.push({ heading: node, nodes: [] });
    } else {
      const current = sections.at(-1);
      if (!current && fail) fail(node.position.start.line, '此处应先写对应层级的标题');
      current?.nodes.push(node);
    }
  }
  return sections;
}

function nodeText(node) {
  return node.children ? node.children.map(nodeText).join('') : node.value ?? node.alt ?? '';
}

function headingText(heading) {
  return nodeText(heading).trim();
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function collectMarkers(nodes, source, fail, markers = []) {
  for (const node of nodes) {
    if (node.type === 'text') {
      const { start, end } = node.position;
      const text = source.slice(start.offset, end.offset);
      for (const opening of text.matchAll(/(?<!\\)\[\[tf-/g)) {
        const index = opening.index;
        const line = start.line + text.slice(0, index).split('\n').length - 1;
        const marker = /^\[\[(tf-\d{3,})\|([^\[\]\n]+)\]\]/.exec(text.slice(index));
        if (!marker || !marker[2].trim()) fail(line, '译法标记应使用 [[tf-001|英文片段]]');
        const offset = start.offset + index;
        markers.push({ offset, end: offset + marker[0].length, techniqueId: marker[1], excerpt: marker[2], line });
      }
    } else if (node.children && node.type !== 'link' && node.type !== 'linkReference') {
      collectMarkers(node.children, source, fail, markers);
    }
  }
  return markers;
}

export function parseCet6Translation(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const fail = (line, message) => { throw new Error(notePath + ':' + line + ' ' + message); };
  const groups = splitSections(fromMarkdown(source).children, 1, fail);
  for (const [index, expected] of ['翻译篇目', '译法讲解'].entries()) {
    const heading = groups[index]?.heading;
    if (!heading || headingText(heading) !== expected) {
      fail(heading?.position.start.line ?? source.split('\n').length, '需要一级标题「' + expected + '」');
    }
  }
  if (groups.length > 2) fail(groups[2].heading.position.start.line, '主笔记应包含两个一级标题');

  const entries = new Map();
  const referenceSections = new Map();
  for (const [index, group] of groups.entries()) {
    const translation = index === 0;
    const kind = translation ? 'translation' : 'technique';
    const idPattern = translation ? /^(tr-\d{3,})\s+(.+)$/ : /^(tf-\d{3,})\s+(.+)$/;
    const sections = splitSections(group.nodes, 2, fail);
    for (const [order, { heading, nodes }] of sections.entries()) {
      const line = heading.position.start.line;
      const match = idPattern.exec(headingText(heading));
      if (!match) fail(line, translation ? '篇目标题应使用「tr-001 篇目标题」' : '译法标题应使用「tf-001 译法标题」');
      const [, id, title] = match;
      if (entries.has(id)) fail(line, '编号重复 ' + id);
      const start = heading.position.end.offset;
      const end = nodes.at(-1)?.position.end.offset ?? start;
      const data = { kind, title, order };
      if (translation) {
        const sections = splitSections(nodes, 3);
        for (const label of ['中文原文', '参考译文']) {
          const matches = sections.filter(section => headingText(section.heading) === label);
          if (matches.length > 1) fail(matches[1].heading.position.start.line, '篇目 ' + id + ' 重复填写「' + label + '」');
          const section = matches[0];
          if (!section?.nodes.length) fail(section?.heading.position.start.line ?? line, '篇目 ' + id + ' 缺少「' + label + '」正文');
          if (label === '参考译文') referenceSections.set(id, section.nodes);
        }
      } else {
        if (!nodes.length) fail(line, '译法 ' + id + ' 缺少讲解正文');
        data.examples = [];
      }
      entries.set(id, { id, data, start, end });
    }
  }

  for (const [id, nodes] of referenceSections) {
    const entry = entries.get(id);
    const body = [];
    let cursor = entry.start;
    for (const [index, marker] of collectMarkers(nodes, source, fail).entries()) {
      const technique = entries.get(marker.techniqueId);
      if (!technique) fail(marker.line, '篇目 ' + id + ' 引用了不存在的译法 ' + marker.techniqueId);
      const occurrenceId = 'occ-' + id + '-' + (index + 1);
      technique.data.examples.push({ id: occurrenceId, translationId: id, translationTitle: entry.data.title, excerpt: marker.excerpt });
      body.push(source.slice(cursor, marker.offset));
      body.push('<a id="' + occurrenceId + '" href="#' + marker.techniqueId + '">' + escapeHtml(marker.excerpt) + '</a>');
      cursor = marker.end;
    }
    body.push(source.slice(cursor, entry.end));
    entry.body = body.join('').trim();
  }
  return Array.from(entries.values(), ({ id, data, start, end, body }) => ({
    id, data, body: body ?? source.slice(start, end).trim(),
  }));
}

export const cet6TranslationLoader = {
  name: 'cet6-translation',
  async load({ config, store, parseData, renderMarkdown }) {
    const note = new URL(notePath, config.root);
    const entries = parseCet6Translation(await readFile(note, 'utf8'));
    const rendered = await Promise.all(entries.map(async ({ id, data, body }) => ({
      id,
      body,
      filePath: notePath,
      data: await parseData({ id, data, filePath: notePath }),
      rendered: await renderMarkdown(body, { fileURL: new URL(id + '.md', note) }),
    })));
    store.clear();
    for (const entry of rendered) store.set(entry);
  },
};
