import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { cet6TranslationLoader } from './lib/cet6-translation.mjs';

const base = {
  title: z.string(),
  description: z.string(),
  order: z.number().default(0),
  demo: z.boolean().default(false),
};
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({ ...base, status: z.enum(['计划中', '进行中', '已完成']), tags: z.array(z.string()).default([]), link: z.url().optional() }),
});
const learning = defineCollection({
  loader: glob({ base: './src/content/learning', pattern: '**/*.md' }),
  schema: z.object({ ...base, topic: z.string(), updated: z.string(), status: z.enum(['计划中', '学习中', '已完成']) }),
});
const writingSchema = z.object({
  stableId: z.string(), title: z.string(), description: z.string(),
  order: z.number().default(0), demo: z.boolean(),
});
const essays = defineCollection({ loader: glob({ base: './src/content/essays', pattern: '**/*.md' }), schema: writingSchema });
const patterns = defineCollection({ loader: glob({ base: './src/content/patterns', pattern: '**/*.md' }), schema: writingSchema.extend({ categoryId: z.string().min(1) }) });
const infraId = (kind: string) => z.string().regex(new RegExp(`^infra-${kind}-[a-z0-9]+(?:-[a-z0-9]+)*$`));
const infraProjects = defineCollection({
  loader: glob({ base: './src/content/infra-projects', pattern: '**/*.md' }),
  schema: z.object({
    projectId: infraId('project'), title: z.string(), description: z.string(),
    topics: z.array(z.string()), prerequisites: z.array(z.string()),
    environment: z.object({ python: z.string(), platforms: z.array(z.string()), device: z.string(), dependencies: z.array(z.string()) }),
    materialStatus: z.enum(['材料待补齐', '材料齐备']), demo: z.boolean(), contentVersion: z.string(),
    source: z.object({ kind: z.string(), version: z.string(), reference: z.string() }),
    blocks: z.array(z.object({ blockId: infraId('block'), file: z.string(), language: z.string() })),
    fragments: z.array(z.object({
      fragmentId: infraId('fragment'), blockId: infraId('block'), startLine: z.number().int().positive(), endLine: z.number().int().positive(),
      title: z.string(), explanation: z.string(), knowledgeIds: z.array(infraId('knowledge')),
    })),
    unitIds: z.array(infraId('unit')),
  }),
});
const infraKnowledge = defineCollection({
  loader: glob({ base: './src/content/infra-knowledge', pattern: '**/*.md' }),
  schema: z.object({ knowledgeId: infraId('knowledge'), title: z.string(), description: z.string(), demo: z.boolean(), contentVersion: z.string(), sources: z.array(z.url()) }),
});
const infraUnits = defineCollection({
  loader: glob({ base: './src/content/infra-units', pattern: '**/*.md' }),
  schema: z.object({ unitId: infraId('unit'), projectId: infraId('project'), title: z.string(), order: z.number(), fragmentIds: z.array(infraId('fragment')), questions: z.array(z.string()).min(2).max(3) }),
});
const translationEntry = { title: z.string(), order: z.number().int() };
const cet6Translation = defineCollection({
  loader: cet6TranslationLoader,
  schema: z.discriminatedUnion('kind', [
    z.object({ ...translationEntry, kind: z.literal('translation') }),
    z.object({
      ...translationEntry,
      kind: z.literal('technique'),
      examples: z.array(z.object({
        id: z.string(), translationId: z.string(), translationTitle: z.string(), excerpt: z.string(),
      })),
    }),
  ]),
});
export const collections = { projects, learning, essays, patterns, infraProjects, infraKnowledge, infraUnits, cet6Translation };
