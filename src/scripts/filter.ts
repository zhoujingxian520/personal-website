const filters = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
const records = [...document.querySelectorAll<HTMLDetailsElement>('.note-summary')];
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => { const selected = filter === button; filter.classList.toggle('selected', selected); filter.setAttribute('aria-pressed', String(selected)); });
  records.forEach(record => { record.hidden = button.dataset.filter !== '全部' && record.dataset.status !== button.dataset.filter; });
  document.querySelector<HTMLElement>('#learning-empty')!.hidden = records.some(record => !record.hidden);
}));
