import type { InfraData } from './infra-store';

export function countProgress(data: InfraData, units: { unitId: string; version: string }[]) {
  const unique = new Map(units.map(unit => [unit.unitId, unit.version]));
  let learned = 0;
  for (const [id, version] of unique) {
    const record = data.mastery[id];
    if (record?.learned && record.contentVersion === version) learned++;
  }
  return { learned, total: unique.size };
}

export function bindProgress(getData: () => InfraData, change: (id: string, version: string, learned: boolean) => void) {
  const controls = [...document.querySelectorAll<HTMLInputElement>('[data-infra-mastery]')];
  function refresh() {
    const data = getData();
    for (const input of controls) {
      const record = data.mastery[input.dataset.unitId!];
      const current = record?.contentVersion === input.dataset.version;
      input.checked = !!record?.learned && current;
      const container = input.closest<HTMLElement>('[data-mastery-control]')!;
      container.hidden = false;
      container.querySelector<HTMLElement>('[data-mastery-label]')!.textContent = record && !current ? '内容已更新，请重新自评' : input.checked ? '已学会（可撤回）' : '未学会';
    }
    for (const counter of document.querySelectorAll<HTMLElement>('[data-progress-units]')) {
      const result = countProgress(data, JSON.parse(counter.dataset.progressUnits!));
      counter.textContent = `已学会 ${result.learned} / ${result.total}`;
    }
  }
  for (const input of controls) input.addEventListener('change', () => {
    change(input.dataset.unitId!, input.dataset.version!, input.checked);
    refresh();
  });
  refresh();
  return refresh;
}
