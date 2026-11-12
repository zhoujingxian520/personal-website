import { defineConfig } from 'astro/config';
import { validateWritingBuild } from './scripts/validate-writing.mjs';
import rehypeRaw from 'rehype-raw';
import categoryConfig from './data/writing-categories.json';
import writingMarkers from './scripts/writing-markers.mjs';
import scopedHeadings from './scripts/markdown-heading-ids.mjs';
import { unified } from '@astrojs/markdown-remark';
export default defineConfig({
  output: 'static', devToolbar: { enabled: false },
  markdown: { processor: unified({ rehypePlugins: [rehypeRaw, scopedHeadings, [writingMarkers, {categoryConfig}]] }) },
  integrations: [{ name: 'writing-validation', hooks: { 'astro:build:done': ({ dir }) => validateWritingBuild(dir) } }],
});
