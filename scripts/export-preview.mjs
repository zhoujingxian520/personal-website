import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const built = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/astro/bin/astro.mjs', root)), 'build'], {
  cwd: fileURLToPath(root), stdio: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
});
if (built.status !== 0) process.exit(built.status || 1);
let html = await readFile(new URL('dist/index.html', root), 'utf8');
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g)];
for (const match of styles) {
  const css = await readFile(new URL(`dist${match[1]}`, root), 'utf8');
  html = html.replace(match[0], `<style>${css}</style>`);
}
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/(?:images\/[^\"]+|favicon\.svg))"/g)].map(match => match[1]))];
for (const path of assets) {
  const bytes = await readFile(new URL(`public${path}`, root));
  const type = path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webp') ? 'image/webp' : 'image/png';
  html = html.replaceAll(path, `data:${type};base64,${bytes.toString('base64')}`);
}
const output = new URL('../首页预览.html', root);
await writeFile(output, html);
console.log(`已导出离线预览：${fileURLToPath(output)}`);
