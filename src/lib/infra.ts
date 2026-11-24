import { getCollection } from 'astro:content';
import { buildInfraModel } from '../../scripts/infra-model.mjs';
import { sitePath } from '../site.config';

export const projectUrl = (id: string) => sitePath(`/projects/ai-infra/projects/${id}/`);
export const knowledgeUrl = (id: string) => sitePath(`/projects/ai-infra/knowledge/${id}/`);
export function infraManifest(model) {
  return {
    notes: Object.fromEntries([...model.blockById, ...model.fragmentById].map(([id, item]) => [id, item.project.data.contentVersion])),
    experiments: Object.fromEntries(model.projects.flatMap(item => [[item.data.projectId, item.data.contentVersion], [`${item.data.projectId}-variant`, item.data.contentVersion]])),
    mastery: Object.fromEntries(model.units.map(item => [item.data.unitId, model.projectById.get(item.data.projectId).data.contentVersion])),
  };
}

export async function loadInfra() {
  const [projects, knowledge, units] = await Promise.all([
    getCollection('infraProjects'), getCollection('infraKnowledge'), getCollection('infraUnits'),
  ]);
  return buildInfraModel(projects, knowledge, units);
}
