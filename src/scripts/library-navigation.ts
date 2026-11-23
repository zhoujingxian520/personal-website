export function initLibraryNavigation(rootId: string, statusId: string, targetIds: RegExp, missingTarget: string) {
  const library = document.getElementById(rootId);
  const status = document.getElementById(statusId);
  if (!library || !status) return;

  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const handles = (id: string) => id === rootId || targetIds.test(id);
  const reveal = async () => {
    const version = ++revision;
    status.textContent = '';
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(1)); }
    catch { status.textContent = '链接中的位置标识无效，请从知识库目录重新选择。'; return; }
    if (!handles(id)) return;
    const target = document.getElementById(id);
    if (!target || !library.contains(target)) {
      status.textContent = missingTarget; return;
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
  };
  function schedule() { ++revision; clearTimeout(timer); timer = setTimeout(() => void reveal(), 0); }
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', event => { if (event.persisted) schedule(); });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    if (url.hash === location.hash && (library.contains(link) || url.hash === '#' + rootId)) { event.preventDefault(); schedule(); }
  });
  schedule();
}
