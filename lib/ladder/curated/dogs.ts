import type { Ladder, LadderContext } from "../schema";

type DogContext = {
  id: string;
  safe: string;
  enter: string;
  exit: string;
  subject: string;
  short: string;
  place: string;
  camera: string;
  poses: [string, string, string, string, string, string];
  ups: [string, string, string, string, string];
  downs: [string, string, string, string, string];
  selfApproach: string;
  holds: string[];
};

function compose(context: DogContext): LadderContext {
  return {
    id: context.id,
    safe: context.safe,
    enter: context.enter,
    exit: context.exit,
    levels: context.poses.map((pose, index) => ({
      level: index + 1,
      state: `${context.subject} ${pose} ${context.place}. ${context.camera}`,
      up: index === 0 ? context.enter : context.ups[index - 1]!,
      down: index === 0 ? context.exit : context.downs[index - 1]!,
      selfApproach: context.selfApproach,
      holds: context.holds,
    })),
  };
}

const park: DogContext = {
  id: "park",
  safe: "A quiet city park in warm late-afternoon light: a wide mown lawn, a row of plane trees at the far end, a wooden bench on the left, long soft shadows across the grass. Wide shot, eye-level, static camera, deep depth of field.",
  enter: "A small light-brown terrier with a wiry coat and a red collar trots onto the far end of the lawn and lies down in the grass.",
  exit: "The terrier gets up and walks out of frame behind the trees.",
  subject: "A small light-brown terrier with a wiry coat and a red collar",
  short: "terrier",
  place: "in a quiet city park in warm late-afternoon light, plane trees behind it",
  camera: "Wide shot, eye-level, static camera, deep depth of field.",
  poses: [
    "lies in the grass at the far end of the lawn",
    "sits at the far end of the lawn, looking toward the camera",
    "sits in the middle of the lawn",
    "stands about three meters from the camera, tail wagging",
    "sniffs near the camera lens",
    "sits right beside the camera, looking up",
  ],
  ups: [
    "The terrier lifts its head from the grass and looks toward the camera.",
    "The terrier walks slowly to the middle of the lawn and sits down.",
    "The terrier walks closer and stops about three meters from the camera, tail wagging.",
    "The terrier walks up to the camera and sniffs near the lens.",
    "The terrier sits down right beside the camera and looks up, tail wagging slowly.",
  ],
  downs: [
    "The terrier lies down in the grass and rests its head on its paws.",
    "The terrier walks back to the far end of the lawn and sits down.",
    "The terrier trots back to the middle of the lawn and lies down.",
    "The terrier steps back a few meters and sits down on the grass.",
    "The terrier stands up and sniffs the grass beside the camera.",
  ],
  selfApproach: "The camera walks slowly forward across the grass toward the terrier and stops.",
  holds: [
    "The terrier scratches behind its ear with a back paw.",
    "The terrier sniffs the grass and takes one step to the side.",
    "The terrier turns its head to watch a bird fly across the lawn.",
    "The terrier's tail wags slowly.",
  ],
};

const sidewalk: DogContext = {
  id: "sidewalk",
  safe: "A quiet residential sidewalk on a bright morning: a low brick wall with a wooden garden gate on the right, a hedge and a lamp post, parked bicycles along the curb. Wide shot, eye-level, static camera, deep depth of field.",
  enter: "A medium tricolor beagle with long floppy ears walks out through the garden gate far down the sidewalk and sits beside it.",
  exit: "The beagle walks back through the garden gate and out of frame.",
  subject: "A medium tricolor beagle with long floppy ears",
  short: "beagle",
  place: "on a quiet residential sidewalk on a bright morning, a brick wall and garden gate beside it",
  camera: "Wide shot, eye-level, static camera, deep depth of field.",
  poses: [
    "sits beside the garden gate far down the sidewalk",
    "stands by the garden gate far down the sidewalk, looking toward the camera",
    "stands halfway along the sidewalk",
    "stands about three meters from the camera, tail wagging",
    "sniffs the pavement close to the camera",
    "sits on the pavement right beside the camera, looking up",
  ],
  ups: [
    "The beagle stands up and looks down the sidewalk toward the camera.",
    "The beagle trots halfway along the sidewalk and stops.",
    "The beagle walks closer and stops about three meters from the camera, tail wagging.",
    "The beagle walks up to the camera and sniffs the pavement near it.",
    "The beagle sits down right beside the camera and looks up.",
  ],
  downs: [
    "The beagle sits down beside the garden gate.",
    "The beagle trots back to the garden gate and stands beside it.",
    "The beagle walks back to the middle of the sidewalk.",
    "The beagle steps back a few meters along the sidewalk and sits down.",
    "The beagle stands up and sniffs the hedge beside the camera.",
  ],
  selfApproach: "The camera walks slowly forward along the sidewalk toward the beagle and stops.",
  holds: [
    "The beagle sniffs the base of the lamp post.",
    "The beagle shakes its long ears.",
    "The beagle looks over at a bicycle by the curb.",
    "The beagle's tail wags slowly.",
  ],
};

const livingroom: DogContext = {
  id: "livingroom",
  safe: "A sunlit living room in the afternoon: a large woven rug on a wooden floor, a grey sofa along the far wall, a tall window with sheer curtains, a potted plant in the corner. Wide shot, eye-level, static camera, deep depth of field.",
  enter: "A large golden retriever with a fluffy cream coat walks in from the hallway and lies down on the far side of the rug.",
  exit: "The retriever gets up and walks out of the room into the hallway.",
  subject: "A large golden retriever with a fluffy cream coat",
  short: "retriever",
  place: "in a sunlit living room with a woven rug and a grey sofa behind it",
  camera: "Wide shot, eye-level, static camera, deep depth of field.",
  poses: [
    "lies on the far side of the rug by the sofa",
    "sits by the sofa, looking toward the camera",
    "sits in the middle of the rug",
    "stands about two meters from the camera, tail wagging",
    "sniffs near the camera lens",
    "lies on the rug right beside the camera, looking up",
  ],
  ups: [
    "The retriever sits up by the sofa and looks toward the camera.",
    "The retriever walks to the middle of the rug and sits down.",
    "The retriever walks closer and stops about two meters from the camera, tail wagging.",
    "The retriever walks up to the camera and sniffs near the lens.",
    "The retriever lies down right beside the camera and looks up.",
  ],
  downs: [
    "The retriever lies down by the sofa and rests its head on its paws.",
    "The retriever walks back to the sofa and sits down.",
    "The retriever walks back to the middle of the rug and lies down.",
    "The retriever steps back across the rug and sits down.",
    "The retriever stands up and sniffs the rug beside the camera.",
  ],
  selfApproach: "The camera moves slowly forward across the rug toward the retriever and stops.",
  holds: [
    "The retriever yawns and settles its head on its paws.",
    "The retriever turns to look at the window.",
    "The retriever sniffs the edge of the rug.",
    "The retriever's tail thumps slowly on the rug.",
  ],
};

export const DOGS_LADDER: Ladder = {
  fearId: "dogs",
  subject: "dogs",
  contexts: [compose(park), compose(sidewalk), compose(livingroom)],
  ev: [
    {
      fearedOutcome: "it will jump on me",
      prompt: "The dog trots right up to the camera and sits down at the camera's feet, tail wagging.",
    },
    {
      fearedOutcome: "it will bite me",
      prompt: "The dog sniffs the lens and lies down beside the camera.",
    },
    {
      fearedOutcome: "it will chase me",
      prompt: "The dog runs across the scene after a bird and lies down.",
    },
  ],
  deepened: ["The dog barks once at a bird and sits back down."],
};
