"use client";

import type { Condition, SessionMode, SignalMode } from "@/lib/orbis/receipts";

/**
 * Session secrets live only in the patient's tab (PRD §4.9): the phone and remote keys are minted
 * to this browser and never rendered anywhere except the pairing and therapist-link panels.
 */
export type LocalSession = {
  id: string;
  code: string;
  key: string;
  phoneKey: string;
  mode: SessionMode;
  signal: SignalMode;
  fear: string;
  fearedOutcome: string;
  expectancyPre: number | null;
  consent: boolean;
  audio: boolean;
  seed: number;
  intakeAt: number;
  builderDemo: boolean;
  /** Set only by the campaign runner (scripts/campaign.ts); sessions from the UI use the product condition. */
  experiment?: Condition;
};

const storageKey = (id: string) => `unflinch:session:${id}`;

export function saveLocalSession(session: LocalSession) {
  try {
    sessionStorage.setItem(storageKey(session.id), JSON.stringify(session));
  } catch {
    // Private mode can refuse storage; the session page then explains it can't resume.
  }
}

export function loadLocalSession(id: string): LocalSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

export type IntakeInput = {
  fear: string;
  fearedOutcome: string;
  expectancyPre: number | null;
  mode: SessionMode;
  signal: SignalMode;
  consent: boolean;
  audio: boolean;
  builderDemo?: boolean;
};

export async function createSession(input: IntakeInput): Promise<LocalSession> {
  const intakeAt = Date.now();
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fear: input.fear,
      fearedOutcome: input.fearedOutcome,
      expectancyPre: input.expectancyPre,
      mode: input.mode,
      consent: input.consent,
    }),
  });
  const body = (await response.json()) as {
    id?: string;
    code?: string;
    phoneKey?: string;
    remoteKey?: string;
    seed?: number;
    message?: string;
  };
  if (!response.ok || !body.id) throw new Error(body.message ?? "Could not create the session.");
  const session: LocalSession = {
    id: body.id,
    code: body.code!,
    key: body.remoteKey!,
    phoneKey: body.phoneKey!,
    mode: input.mode,
    signal: input.signal,
    fear: input.fear,
    fearedOutcome: input.fearedOutcome,
    expectancyPre: input.expectancyPre,
    consent: input.consent,
    audio: input.audio,
    seed: body.seed ?? 2026,
    intakeAt,
    builderDemo: input.builderDemo ?? false,
  };
  saveLocalSession(session);
  return session;
}
