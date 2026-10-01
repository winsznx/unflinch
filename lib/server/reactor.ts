import "server-only";

export const REACTOR_API_URL = "https://api.reactor.inc";
export const ORBIS_MODEL = "reactor/visko-orbis-stable";

export class ReactorConfigError extends Error {}

/** Mint a JWT scoped to one Orbis session of bounded length. The API key never leaves the server. */
export async function mintReactorJwt(maxSessionS: number): Promise<string> {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) throw new ReactorConfigError("REACTOR_API_KEY is not configured");

  const response = await fetch(`${REACTOR_API_URL}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Reactor-API-Key": apiKey },
    body: JSON.stringify({
      expires_after: 900,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [ORBIS_MODEL] } },
          constraints: { max_sessions: 1, max_session_duration_seconds: maxSessionS },
        },
      ],
    }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Reactor token request failed (${response.status}): ${text.slice(0, 300)}`);
  const result = JSON.parse(text) as { jwt?: string };
  if (!result.jwt) throw new Error("Reactor returned no JWT");
  return result.jwt;
}
