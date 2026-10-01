import type { Ladder } from "../schema";

const SCENE =
  "A high-floor apartment balcony with a waist-high glass railing, a city skyline under a clear blue sky";
const CAMERA = "Medium shot, static camera, deep depth of field.";

const POSITIONS = [
  "The camera stands just inside the open balcony door.",
  "The camera stands in the middle of the balcony.",
  "The glass railing fills the lower edge of the frame.",
  "The camera looks down through the glass railing at the street far below.",
  "The camera leans over the railing above the street and small cars far below.",
] as const;

const UPS = [
  "The camera moves slowly toward the open balcony door.",
  "The camera steps through the doorway onto the balcony and stops in the middle.",
  "The camera moves forward until the glass railing fills the lower edge of the frame.",
  "The camera tilts down to show the street far below through the glass railing.",
  "The camera leans slightly over the railing, the street and small cars far below.",
] as const;

const DOWNS = [
  "The camera moves back inside the living room.",
  "The camera moves back to the open doorway.",
  "The camera steps back to the middle of the balcony.",
  "The camera tilts up to the skyline.",
  "The camera leans back from the railing.",
] as const;

const HOLDS = [
  "A small bird lands on the railing and flies off.",
  "A cloud drifts across the sun and the light softens.",
  "Far below, a bus pulls away from a stop.",
];

export const HEIGHTS_LADDER: Ladder = {
  fearId: "heights",
  subject: "heights",
  contexts: [
    {
      id: "balcony",
      safe: "A bright apartment living room on a high floor, a sliding glass door open to a balcony with a waist-high glass railing, a city skyline under a clear blue sky beyond. Medium wide shot, eye-level, static camera, deep depth of field.",
      enter: UPS[0],
      exit: DOWNS[0],
      levels: POSITIONS.map((position, index) => ({
        level: index + 1,
        state: `${SCENE}. ${position} ${CAMERA}`,
        up: UPS[index]!,
        down: DOWNS[index]!,
        selfApproach: UPS[index]!,
        holds: HOLDS,
      })),
    },
  ],
  ev: [
    {
      fearedOutcome: "I'll lose my balance",
      prompt: "The camera holds steady at the railing as a light breeze moves the leaves of a potted plant beside it.",
    },
  ],
  deepened: ["A gust of wind ruffles the potted plant beside the railing."],
};
