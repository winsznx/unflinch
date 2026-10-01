import { z } from "zod";

export const Level = z.object({
  level: z.number().int().min(1).max(6),
  state: z.string(),
  up: z.string(),
  down: z.string(),
  selfApproach: z.string().optional(),
  holds: z.array(z.string()).min(2).max(4),
});

export const Context = z.object({
  id: z.string(),
  safe: z.string(),
  enter: z.string(),
  exit: z.string(),
  levels: z.array(Level).min(4).max(6),
});

export const ExpectancyTest = z.object({
  fearedOutcome: z.string(),
  prompt: z.string(),
});

export const Ladder = z.object({
  fearId: z.string(),
  subject: z.string().max(240),
  contexts: z.array(Context).min(1).max(3),
  ev: z.array(ExpectancyTest).min(1).max(3),
  deepened: z.array(z.string()).max(3),
});

export type Level = z.infer<typeof Level>;
export type LadderContext = z.infer<typeof Context>;
export type Ladder = z.infer<typeof Ladder>;

export type LadderSource = "curated" | "generated" | "fallback";
