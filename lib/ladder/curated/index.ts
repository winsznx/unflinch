import type { Ladder } from "../schema";
import { DOGS_LADDER } from "./dogs";
import { HEIGHTS_LADDER } from "./heights";

export const CURATED: Record<string, Ladder> = {
  dogs: DOGS_LADDER,
  heights: HEIGHTS_LADDER,
};

const KEYWORDS: Record<string, RegExp> = {
  dogs: /\b(dogs?|pupp(y|ies)|canines?|terriers?|beagles?|retrievers?|cynophobia)\b/i,
  heights: /\b(heights?|high places?|balcon(y|ies)|ledges?|acrophobia|tall buildings?)\b/i,
};

export function matchCurated(fear: string): Ladder | null {
  for (const [id, pattern] of Object.entries(KEYWORDS)) {
    if (pattern.test(fear)) return CURATED[id] ?? null;
  }
  return null;
}

/** Closest curated ladder when generation fails twice. Heights for place-like fears, dogs otherwise. */
export function closestCurated(fear: string): Ladder {
  const placeLike = /\b(bridge|elevator|lift|fly|flying|plane|cliff|roof|stairs|water|ocean|sea)\b/i;
  return placeLike.test(fear) ? HEIGHTS_LADDER : DOGS_LADDER;
}
