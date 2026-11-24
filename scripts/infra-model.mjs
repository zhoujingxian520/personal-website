// Content relationships are checked when the static pages load their model.
export function buildInfraModel(projects, knowledge, units) {
  const location = entry => entry.filePath || entry.id;
  const fail = (entry, message) => { throw new Error(`[AI Infra] ${location(entry)}: ${message}`); };
  function index(entries, field) {
    const result = new Map();
    for (const entry of entries) {
      const id = entry.data[field];
      if (result.has(id)) fail(entry, `重复 ID ${id}，首次声明于 ${location(result.get(id))}`);
      result.set(id, entry);
    }
    return result;
  }
  const projectById = index(projects, 'projectId');
  const knowledgeById = index(knowledge, 'knowledgeId');
  const unitById = index(units, 'unitId');
  const blockById = new Map();
  const fragmentById = new Map();
  const appearances = new Map(knowledge.map(entry => [entry.data.knowledgeId, []]));
  for (const project of projects) {
    const { data } = project;
    const fences = [...(project.body || '').matchAll(/^```(\S+) infra:(infra-block-[a-z0-9-]+)\r?\n([\s\S]*?)\r?\n```[ \t]*\r?$/gm)];
    const declared = new Set(data.blocks.map(block => block.blockId));
    for (const fence of fences) if (!declared.has(fence[2])) fail(project, `代码围栏未声明 ${fence[2]}`);
    for (const block of data.blocks) {
      if (blockById.has(block.blockId)) fail(project, `重复 ID ${block.blockId}`);
      const matches = fences.filter(fence => fence[2] === block.blockId);
      if (matches.length !== 1) fail(project, `${block.blockId} 必须对应一个代码围栏，实际 ${matches.length}`);
      if (matches[0][1] !== block.language) fail(project, `${block.blockId} 语言与围栏不一致`);
      blockById.set(block.blockId, { ...block, project, code: matches[0][3].replaceAll('\r\n', '\n') });
    }
    for (const fragment of data.fragments) {
      if (fragmentById.has(fragment.fragmentId)) fail(project, `重复 ID ${fragment.fragmentId}`);
      const block = blockById.get(fragment.blockId);
      if (!block || block.project !== project) fail(project, `${fragment.fragmentId} 引用了不存在的本项目代码块 ${fragment.blockId}`);
      const lines = block.code.split('\n');
      if (fragment.startLine < 1 || fragment.endLine < fragment.startLine || fragment.endLine > lines.length) fail(project, `${fragment.fragmentId} 行范围 ${fragment.startLine}—${fragment.endLine} 超出 ${fragment.blockId}（${lines.length} 行）`);
      const item = { ...fragment, project, block, code: lines.slice(fragment.startLine - 1, fragment.endLine).join('\n') };
      fragmentById.set(fragment.fragmentId, item);
      for (const id of new Set(fragment.knowledgeIds)) {
        if (!knowledgeById.has(id)) fail(project, `${fragment.fragmentId} 引用了不存在的知识 ${id}`);
        appearances.get(id).push(item);
      }
    }
    if (new Set(data.unitIds).size !== data.unitIds.length) fail(project, 'unitIds 包含重复单元');
    for (const id of data.unitIds) {
      if (unitById.get(id)?.data.projectId !== data.projectId) fail(project, `学习单元 ${id} 不存在或不属于本项目`);
    }
  }
  for (const unit of units) {
    const project = projectById.get(unit.data.projectId);
    if (!project || !project.data.unitIds.includes(unit.data.unitId)) fail(unit, `项目 ${unit.data.projectId} 不存在或未登记本单元`);
    for (const id of unit.data.fragmentIds) {
      if (fragmentById.get(id)?.project !== project) fail(unit, `片段 ${id} 不存在或不属于本项目`);
    }
  }
  return { projects, knowledge, units, projectById, knowledgeById, unitById, blockById, fragmentById, appearances };
}
