import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const digests = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/digests" }),
  schema: z.object({
    date: z.coerce.date(),
    round: z.number(),
    team: z.string().default("Seoul E-Land FC"),
    season: z.coerce.number(),
    opponent: z.string(),
    venue: z.enum(["home", "away", "neutral"]).default("home"),
    result: z.string(), // e.g. "W 2-1"
    tags: z.array(z.string()).default([]),
  }),
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

export const collections = { digests, players, places };
