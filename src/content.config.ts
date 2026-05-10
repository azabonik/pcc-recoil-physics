import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    /** Optional italic accent suffix appended after the title in the article header. */
    headlineSuffix: z.string().optional(),
    /** Short label rendered above h1 (kicker). */
    headerLabel: z.string(),
    /** Subtitle / dek under the title. */
    headerSubtitle: z.string(),
    /** Plain description used for meta/og/twitter and the homepage card. */
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** Topical tags shown on the homepage card. */
    tags: z.array(z.string()).default([]),
    /** schema.org "about" entries for TechArticle structured data. */
    about: z.array(z.string()).default([]),
    /** Comma-separated keywords for <meta name="keywords">. */
    keywords: z.string().optional(),
    /** Hide from the homepage list (drafts). */
    draft: z.boolean().default(false),
    /**
     * Editorial classification.
     * - "article" (default): long-form writing. Eligible for the homepage hero.
     * - "tool": interactive tool / calculator / reference. Lives in the
     *   homepage's "Bonus" section, never the hero, regardless of pubDate.
     */
    kind: z.enum(['article', 'tool']).default('article'),
  }),
});

export const collections = { articles };
