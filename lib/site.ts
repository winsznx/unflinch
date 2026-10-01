export const SITE = {
  name: "Unflinch",
  tagline: "Exposure practice that moves at the speed of your nervous system.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  repo: "https://github.com/winsznx/unflinch",
  therapistMailto: "mailto:hello@unflinch.io?subject=Unflinch%20for%20therapists",
  disclaimer: "Not a medical device.",
} as const;
