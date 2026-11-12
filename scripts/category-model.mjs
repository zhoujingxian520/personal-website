const fail = m => { throw new Error(`[categories] ${m}`); };
export function validateCategories(data, previous) {
  const tokens = new Map(), categories = new Map(), used = new Set();
  for (const p of data.palette) {
    if (!/^mark-\d{2,}$/.test(p.id) || !/^#[0-9A-Fa-f]{6}$/.test(p.color) || tokens.has(p.id)) fail('Invalid/duplicate palette token');
    tokens.set(p.id, p.color);
  }
  for (const c of data.categories) {
    if (!/^category-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.id) || categories.has(c.id) || !['demo','main'].includes(c.scope) || !['active','retired'].includes(c.state) || !c.label?.trim() || !c.shortLabel?.trim() || !Number.isFinite(c.order)) fail('Invalid category: '+c.id);
    categories.set(c.id,c);
  }
  for (const [id,token] of Object.entries(data.assignments)) {
    const c=categories.get(id); if(!c) fail('Unknown assignment: '+id);
    if(token===null) continue;
    if(!tokens.has(token) || used.has(c.scope+':'+token)) fail('Invalid/duplicate assignment: '+id);
    used.add(c.scope+':'+token);
  }
  if(previous) {
    for(const p of previous.palette) if(tokens.get(p.id)!==p.color) fail('Historical palette changed: '+p.id);
    for(const old of previous.categories) {
      const c=categories.get(old.id);
      if(!c || c.scope!==old.scope || (old.state==='retired' && c.state!=='retired')) fail('Historical category removed/reused: '+old.id);
      const token=previous.assignments[old.id];
      if(token && data.assignments[old.id]!==token) fail('Historical color changed: '+old.id);
    }
  }
  return data;
}
export function allocateCategories(input, previous) {
  const data=structuredClone(input);validateCategories(data,previous);
  for(const c of [...data.categories].sort((a,b)=>a.id.localeCompare(b.id,'en'))) {
    if(c.state!=='active'||data.assignments[c.id])continue;
    const used=new Set(data.categories.filter(x=>x.scope===c.scope).map(x=>data.assignments[x.id]).filter(Boolean));
    data.assignments[c.id]=data.palette.find(p=>!used.has(p.id))?.id??null;
  }
  return validateCategories(data,previous);
}
export function categoryFor(data,id) {
  const c=data.categories.find(c=>c.id===id);
  if(!c || c.state!=='active')fail('Unknown/retired category reference: '+id);
  if(!(id in data.assignments))fail('Run sync:categories before building: '+id);
  const token=data.assignments[id];
  return {...c,token,color:token?data.palette.find(p=>p.id===token).color:'#8A8176',pending:token===null};
}
