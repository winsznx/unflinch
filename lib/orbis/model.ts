export const ORBIS_MODEL_NAME = "reactor/visko-orbis-stable";

export const ORBIS_TRACKS = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" },
] as const;

export const DOCUMENTED_RESOLUTIONS = ["1080p", "2k", "4k"];

export type OrbisMessage = {
  type?: string;
  command?: string;
  reason?: string;
  available_resolutions?: string[];
  width?: number;
  height?: number;
  has_image?: boolean;
  image_conditioned?: boolean;
  started?: boolean;
  paused?: boolean;
};

export function unwrapOrbisMessage(raw: unknown): OrbisMessage {
  const envelope = raw as { type?: string; data?: Record<string, unknown> };
  if (envelope?.data && typeof envelope.data === "object") {
    return { ...envelope.data, type: envelope.type } as OrbisMessage;
  }
  return raw as OrbisMessage;
}

/** Dev playground only (/lab/orbis): mint a throwaway judge session, then a token for it. */
export async function requestReactorJwt() {
  const created = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fear: "lab playground", mode: "judge" }),
  });
  const session = (await created.json()) as { id?: string; remoteKey?: string; message?: string };
  if (!created.ok || !session.id) throw new Error(session.message || "Could not create a lab session");

  const response = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id, key: session.remoteKey }),
  });
  const result = (await response.json()) as { jwt?: string; message?: string; error?: string };
  if (!response.ok || !result.jwt) {
    throw new Error(result.message || result.error || "Could not create a Reactor token");
  }
  return result.jwt;
}
