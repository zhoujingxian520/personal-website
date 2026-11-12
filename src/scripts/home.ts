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


function legacy(){if(/^(#(?:essay|pattern|occ)-|#writing-library)/.test(location.hash)){const a=document.getElementById('legacy-writing-destination') as HTMLAnchorElement;location.replace(a.href+location.hash);}}
legacy();window.addEventListener('hashchange',legacy);
