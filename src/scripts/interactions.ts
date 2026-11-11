const toggle = document.querySelector<HTMLButtonElement>('#menu-toggle')!;
const links = document.querySelector<HTMLElement>('#radial-links')!;
const scrim = document.querySelector<HTMLButtonElement>('#menu-scrim')!;
const navLinks = [...links.querySelectorAll<HTMLAnchorElement>('a')];
function closeMenu(restoreFocus = false) {
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', '展开导航');
  links.inert = true;
  navLinks.forEach(link => link.tabIndex = -1);
  scrim.hidden = true;
  document.body.classList.remove('nav-open');
  if (restoreFocus) toggle.focus();
}
toggle.addEventListener('click', () => {
  if (toggle.getAttribute('aria-expanded') === 'true') return closeMenu();
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', '收起导航');
  links.inert = false;
  navLinks.forEach(link => link.tabIndex = 0);
  scrim.hidden = false;
  document.body.classList.add('nav-open');
});
scrim.addEventListener('click', () => closeMenu(true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
navLinks.forEach(link => link.addEventListener('click', () => {
  closeMenu();
  const target = document.querySelector<HTMLElement>(link.hash);
  if (target) {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}));
document.addEventListener('focusin', event => {
  if (toggle.getAttribute('aria-expanded') === 'true' && !(event.target as HTMLElement).closest('.radial-nav')) closeMenu();
});

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const writer = document.querySelector<HTMLElement>('#typewriter')!;
const phrase = [...(writer.dataset.text || '')];
let timer: ReturnType<typeof setTimeout> | undefined;
let count = 0;
let deleting = false;
function tick() {
  if (motion.matches || document.hidden) return;
  count += deleting ? -1 : 1;
  writer.textContent = phrase.slice(0, count).join('');
  let delay = deleting ? 50 : 100;
  if (count === phrase.length) { deleting = true; delay = 3000; }
  else if (count === 0) { deleting = false; delay = 650; }
  timer = setTimeout(tick, delay);
}
function resetWriter() {
  clearTimeout(timer);
  if (motion.matches) { writer.textContent = phrase.join(''); return; }
  count = 0;
  deleting = false;
  writer.textContent = '';
  if (!document.hidden) timer = setTimeout(tick, 650);
}
motion.addEventListener('change', resetWriter);
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (!document.hidden && !motion.matches) timer = setTimeout(tick, 200);
});
resetWriter();

const header = document.querySelector<HTMLElement>('.site-header')!;
const observer = new IntersectionObserver(([entry]) => header.classList.toggle('scrolled', !entry.isIntersecting), { rootMargin: '-75px 0px 0px 0px' });
observer.observe(document.querySelector('#home')!);
const filters = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
const records = [...document.querySelectorAll<HTMLDetailsElement>('.learning-card')];
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => { const selected = filter === button; filter.classList.toggle('selected', selected); filter.setAttribute('aria-pressed', String(selected)); });
  records.forEach(record => { record.hidden = button.dataset.filter !== '全部' && record.dataset.status !== button.dataset.filter; });
  document.querySelector<HTMLElement>('#learning-empty')!.hidden = records.some(record => !record.hidden);
}));
