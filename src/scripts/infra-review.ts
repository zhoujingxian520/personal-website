import type { Experiment, InfraData } from './infra-store';

export const hasQuestion = (text: string) => /[?？]|疑问|不懂|不理解/.test(text);
export function comparisonMessage(baseline?: Experiment, variant?: Experiment) {
  if (!baseline || !variant) return '请先填写基线和变体两条实验记录。';
  if (baseline.contentVersion !== variant.contentVersion) return '两条记录的内容版本不同，请先复核代码版本。';
  if (!baseline.environment.trim() || !variant.environment.trim()) return '测量条件尚未填写完整，暂不能判断是否可比。';
  return baseline.environment.trim() === variant.environment.trim()
    ? '记录的条件文字一致，请仍核对输入、硬件、版本和测量方法；结果由你解释。'
    : '两条记录的条件不同，请核对差异，不能直接把数值差当作优化收益。';
}

export function bindReview(getData: () => InfraData) {
  const onlyUnlearned = document.querySelector<HTMLInputElement>('[data-only-unlearned]');
  const knowledgeSearch = document.querySelector<HTMLInputElement>('[data-knowledge-search]');
  function refresh() {
    const data = getData();
    const cards = [...document.querySelectorAll<HTMLElement>('[data-route-unit]')];
    for (const card of cards) {
      const record = data.mastery[card.dataset.routeUnit!];
      card.hidden = !!onlyUnlearned?.checked && !!record?.learned && record.contentVersion === card.dataset.version;
    }
    const routeEmpty = document.querySelector<HTMLElement>('[data-route-empty]');
    if (routeEmpty) routeEmpty.hidden = cards.some(card => !card.hidden);
    const questionItems = [...document.querySelectorAll<HTMLElement>('[data-question-note]')];
    for (const item of questionItems) {
      const note = data.notes[item.dataset.questionNote!];
      item.hidden = !note || !hasQuestion(note.text);
      item.querySelector<HTMLElement>('[data-note-excerpt]')!.textContent = note?.text || '';
    }
    const questionEmpty = document.querySelector<HTMLElement>('[data-question-empty]');
    if (questionEmpty) questionEmpty.hidden = questionItems.some(item => !item.hidden);
    const keyword = knowledgeSearch?.value.trim().toLocaleLowerCase() || '';
    const knowledgeItems = [...document.querySelectorAll<HTMLElement>('[data-review-knowledge]')];
    for (const item of knowledgeItems) item.hidden = !item.textContent!.toLocaleLowerCase().includes(keyword);
    const knowledgeEmpty = document.querySelector<HTMLElement>('[data-knowledge-empty]');
    if (knowledgeEmpty) knowledgeEmpty.hidden = knowledgeItems.some(item => !item.hidden);
    for (const comparison of document.querySelectorAll<HTMLElement>('[data-experiment-comparison]')) {
      const baseline = data.experiments[comparison.dataset.experimentComparison!];
      const variant = data.experiments[`${comparison.dataset.experimentComparison}-variant`];
      comparison.querySelector<HTMLElement>('[data-comparison-message]')!.textContent = comparisonMessage(baseline, variant);
      for (const cell of comparison.querySelectorAll<HTMLElement>('[data-comparison-field]')) {
        const record = cell.dataset.side === 'baseline' ? baseline : variant;
        cell.textContent = record?.[cell.dataset.comparisonField as keyof Experiment] || '未记录';
      }
    }
  }
  onlyUnlearned?.addEventListener('change', refresh);
  knowledgeSearch?.addEventListener('input', refresh);
  document.querySelector('[data-reset-review]')?.addEventListener('click', () => { if (onlyUnlearned) onlyUnlearned.checked = false; if (knowledgeSearch) knowledgeSearch.value = ''; refresh(); });
  refresh();
  return refresh;
}
