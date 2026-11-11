const library = document.getElementById('writing-library');
if (library) {
  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;
  const status = document.getElementById('writing-navigation-status')!;
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const handles = (id: string) => id === 'writing-library' || /^(essay|pattern|occ)-/.test(id);
  async function reveal() {
    const version = ++revision;
    status.textContent = '';
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(1)); }
    catch { status.textContent = '链接中的位置标识无效，请从知识库目录重新选择。'; return; }
    if (!handles(id)) return;
    const target = document.getElementById(id);
    if (!target || !library!.contains(target)) {
      status.textContent = '未找到该位置，请从作文目录或句型索引重新选择。'; return;
    }
    const folds: HTMLDetailsElement[] = [];
    for (let el: HTMLElement | null = target; el; el = el.parentElement) {
      if (el instanceof HTMLDetailsElement) folds.unshift(el);
    }
    folds.forEach(fold => fold.open = true);
    await frame(); await frame();
    if (version !== revision || !target.isConnected) return;
    if (!target.matches('a[href],button,input,select,textarea,[tabindex]')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    target.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
    root.style.scrollBehavior = previous;
  }
  function schedule() { ++revision; clearTimeout(timer); timer = setTimeout(() => void reveal(), 0); }
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', event => { if (event.persisted) schedule(); });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    if (url.hash === location.hash && (library!.contains(link) || url.hash === '#writing-library')) { event.preventDefault(); schedule(); }
  });
  schedule();
}
