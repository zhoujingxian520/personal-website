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
export const collections = { projects, learning, essays, patterns, cet6Translation };
