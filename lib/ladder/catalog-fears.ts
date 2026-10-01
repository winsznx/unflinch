/** PRD §2.6 generated catalog. `match` routes free text at intake to the pre-generated ladder. */
export const CATALOG_FEARS = [
  { id: "spiders", prompt: "Spiders", fearedOutcome: "It will crawl onto me", match: /\b(spiders?|arachn\w*|tarantulas?)\b/i },
  { id: "snakes", prompt: "Snakes", fearedOutcome: "It will strike at me", match: /\b(snakes?|serpents?|ophidio\w*)\b/i },
  { id: "birds", prompt: "Birds such as pigeons", fearedOutcome: "It will fly at my face", match: /\b(birds?|pigeons?|seagulls?|gulls?|ornitho\w*)\b/i },
  { id: "flying", prompt: "Flying, seen from an airplane window seat", fearedOutcome: "The plane will drop suddenly", match: /\b(fly|flying|planes?|airplanes?|aeroplanes?|flights?|aviophobia|turbulence)\b/i },
  { id: "thunderstorms", prompt: "Thunderstorms, seen from indoors through a window", fearedOutcome: "Lightning will hit the house", match: /\b(thunder\w*|storms?|lightning|astraphobia)\b/i },
  { id: "water", prompt: "Open deep water, seen from a boat or a dock", fearedOutcome: "I'll be pulled under", match: /\b(deep water|open water|ocean|sea|lakes?|swimming|thalasso\w*|aquaphobia)\b/i },
  { id: "elevators", prompt: "Elevators", fearedOutcome: "It will get stuck with me inside", match: /\b(elevators?|lifts?)\b/i },
  { id: "bridges", prompt: "High bridges, walking or driving across", fearedOutcome: "I'll lose control near the edge", match: /\b(bridges?|gephyro\w*)\b/i },
  { id: "darkness", prompt: "Darkness, a dim room at night", fearedOutcome: "Something will be there in the dark", match: /\b(dark|darkness|night|nyctophobia)\b/i },
] as const;
