import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const digestSchema = z.object({
  date: z.coerce.date(),
  round: z.number(),
  team: z.string().default("Seoul E-Land FC"),
  season: z.coerce.number(),
  opponent: z.string(),
  venue: z.enum(["home", "away", "neutral"]).default("home"),
  result: z.string(), // e.g. "W 2-1"
  tags: z.array(z.string()).default([]),
});

const digests = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/digests" }),
  schema: digestSchema,
});

const digestsPt = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/digests-pt" }),
  schema: digestSchema,
});

const players = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/players" }),
  schema: z
    .object({
      name_en: z.string().optional(),
      name_kr: z.string().optional(),
      position: z.string().optional(),
      number: z.number().optional(),
    })
    .passthrough(),
});

const places = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/places" }),
  schema: z
    .object({
      city: z.string().optional(),
      capacity: z.number().optional(),
    })
    .passthrough(),
});

const koreanCupSchema = z.object({
  title: z.string(),
  order: z.number().default(0),
  description: z.string().default(""),
  date: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
});

const koreanCup = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/korean-cup" }),
  schema: koreanCupSchema,
});

const koreanCupPt = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/korean-cup-pt" }),
  schema: koreanCupSchema,
});

export const collections = { digests, digestsPt, players, places, koreanCup, koreanCupPt };
