const readers = [...document.querySelectorAll<HTMLElement>('[data-code-reader]')];
const status = document.querySelector<HTMLElement>('[data-infra-navigation-status]');

function selectFragment(fragment: HTMLDetailsElement) {
  const reader = fragment.closest<HTMLElement>('[data-code-reader]')!;
  for (const panel of reader.querySelectorAll<HTMLDetailsElement>('[data-infra-fragment]')) {
    panel.open = panel === fragment;
    panel.classList.toggle('is-selected', panel === fragment);
  }
  for (const line of reader.querySelectorAll<HTMLElement>('[data-line]')) {
    const number = Number(line.dataset.line);
    line.classList.toggle('is-highlighted', number >= Number(fragment.dataset.start) && number <= Number(fragment.dataset.end));
  }
}

function followHash() {
  if (status) status.textContent = '';
  if (!location.hash) return;
  let id: string;
  try { id = decodeURIComponent(location.hash.slice(1)); }
  catch { if (status) status.textContent = '这个定位链接无效，请从片段列表重新选择。'; return; }
  const target = document.getElementById(id);
  if (!target) {
    if (status) status.textContent = '未找到这个位置，内容可能已更新，请从片段列表重新选择。';
    return;
  }
  if (target.matches('[data-infra-fragment]')) {
    selectFragment(target as HTMLDetailsElement);
    target.querySelector<HTMLElement>('summary')!.focus({ preventScroll: true });
  } else {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

for (const reader of readers) {
  const first = reader.querySelector<HTMLDetailsElement>('[data-infra-fragment]');
  if (first) selectFragment(first);
  for (const panel of reader.querySelectorAll<HTMLDetailsElement>('[data-infra-fragment]')) {
    panel.addEventListener('toggle', () => { if (panel.open) selectFragment(panel); });
  }
  const button = reader.querySelector<HTMLButtonElement>('[data-copy-code]')!;
  button.hidden = false;
  button.addEventListener('click', async () => {
    const feedback = reader.querySelector<HTMLElement>('[data-copy-status]')!;
    try {
      await navigator.clipboard.writeText(button.dataset.code!);
      feedback.textContent = '已复制完整代码。';
    } catch {
      feedback.textContent = '未能复制，请手动选择源码复制。';
    }
  });
}

// Keep real links and native history; only repeat clicks need an extra refresh.
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !(event instanceof MouseEvent)) return;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href]');
  if (link && link.origin === location.origin && link.pathname === location.pathname && link.hash && link.hash === location.hash) {
    requestAnimationFrame(followHash);
  }
});
window.addEventListener('hashchange', followHash);
window.addEventListener('pageshow', followHash);
followHash();
