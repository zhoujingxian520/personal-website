import { patternCategories } from './category-data.mjs';
export default function writingMarkers(){return tree=>{
 const map=patternCategories();
 function visit(node){
  const p=node.properties;const id=p?.dataPatternId??p?.['data-pattern-id'];
  if(node.tagName==='a'&&id){const c=map.get(id);if(!c)throw new Error('[categories] Unknown pattern '+id);
   p['data-category-id']=c.id;p.style=`--mark-color:${c.color}`;
   node.children.push({type:'element',tagName:'small',properties:{className:['writing-category-short']},children:[{type:'text',value:` [${c.shortLabel}${c.pending?'·待配色':''}]`}]});
  }
  for(const child of node.children||[])visit(child);
 }visit(tree);
};}
