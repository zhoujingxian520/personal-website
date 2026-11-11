import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';

// Markdown files share a single page, so their automatic heading IDs need scopes.
export default function scopedHeadings() {
  return (tree, file) => {
    rehypeHeadingIds()(tree, file);
    const key = relative(process.cwd(), file.path || '').replaceAll('\\', '/');
    const prefix = `md-${createHash('sha256').update(key).digest('hex').slice(0, 12)}-`;
    const aliases = new Map();
    function walk(node, visit) { visit(node); for (const child of node.children || []) walk(child, visit); }
    walk(tree, node => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) {
        const old = String(node.properties.id);
        aliases.set(`#${old}`, `#${prefix}${old}`);
        node.properties.id = `${prefix}${old}`;
      }
    });
    walk(tree, node => {
      if (node.tagName === 'a' && aliases.has(node.properties?.href)) node.properties.href = aliases.get(node.properties.href);
    });
  };
}
