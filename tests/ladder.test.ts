import { describe, expect, it } from "vitest";

import { CURATED } from "@/lib/ladder/curated";
import { lintLadder, lintPrompt } from "@/lib/ladder/lint";
import { Ladder } from "@/lib/ladder/schema";

describe("curated ladders", () => {
  for (const [id, ladder] of Object.entries(CURATED)) {
    it(`${id} matches the schema`, () => {
      expect(Ladder.safeParse(ladder).success).toBe(true);
    });
    it(`${id} is lint-clean`, () => {
      expect(lintLadder(ladder)).toEqual([]);
    });
  }
});

describe("lint", () => {
  it("rejects harm, negation and people", () => {
    const rules = lintPrompt("The dog bites a man, no leash.", "transition").map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["harm", "negation", "people"]));
  });
  it("requires camera language on absolute prompts", () => {
    const rules = lintPrompt("A dog in a park.", "absolute").map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["cameraFraming", "cameraMotion"]));
  });
  it("rejects chained actions", () => {
    expect(lintPrompt("The dog sits then walks away.", "transition").map((i) => i.rule)).toContain("bannedConnective");
  });
});
