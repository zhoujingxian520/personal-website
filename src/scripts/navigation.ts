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
  const target = link.pathname === location.pathname && link.hash ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
  if (target) {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}));
document.addEventListener('focusin', event => {
  if (toggle.getAttribute('aria-expanded') === 'true' && !(event.target as HTMLElement).closest('.radial-nav')) closeMenu();
});


const header=document.querySelector<HTMLElement>('.site-header')!;
const hero=document.getElementById('home');
if(hero) new IntersectionObserver(([entry])=>header.classList.toggle('scrolled',!entry.isIntersecting),{rootMargin:'-75px 0px 0px 0px'}).observe(hero);
else header.classList.add('scrolled');
