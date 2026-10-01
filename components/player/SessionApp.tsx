"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Ladder, LadderSource } from "@/lib/ladder/schema";
import { loadLocalSession, type LocalSession } from "@/lib/session/local";
import { SessionRuntime, type SessionConfig } from "@/lib/session/runtime";

import { Player } from "./Player";

const CONTEXT_NAMES: Record<string, string> = {
  park: "park",
  sidewalk: "sidewalk",
  livingroom: "living room",
  balcony: "balcony",
};

const TRIALS = 3;

type Plan = { ladder: Ladder; source: LadderSource; sha256: string };

function planLine(ladder: Ladder): string {
  const contexts = Array.from({ length: TRIALS }, (_, i) => ladder.contexts[i % ladder.contexts.length]!.id);
  const names = contexts.map((id) => CONTEXT_NAMES[id] ?? id.replace(/[-_]/g, " "));
  return `${TRIALS} short exposures · ${names.join(" → ")} · you can pause any time.`;
}

export function SessionApp({ id }: { id: string }) {
  const [local] = useState<LocalSession | null | undefined>(() =>
    typeof window === "undefined" ? undefined : loadLocalSession(id),
  );
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!local) return;
    let cancelled = false;
    fetch("/api/ladder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: local.id, key: local.key }),
    })
      .then(async (response) => {
        const body = (await response.json()) as Partial<Plan> & { message?: string };
        if (!response.ok || !body.ladder) throw new Error(body.message ?? "Could not build the plan.");
        if (!cancelled) setPlan({ ladder: body.ladder, source: body.source!, sha256: body.sha256! });
      })
      .catch((error: unknown) => {
        if (!cancelled) setPlanError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [local]);

  if (local === undefined) return null;
  if (local === null) {
    return (
      <div className="pl-center">
        <h1>This session isn&apos;t open in this browser.</h1>
        <p>Session keys stay in the tab that created them. Start a new session to continue.</p>
        <Link className="m-button" href="/start">
          Start a session
        </Link>
      </div>
    );
  }
  if (planError) {
    return (
      <div className="pl-center">
        <h1>We couldn&apos;t build your plan.</h1>
        <p>{planError}</p>
        <Link className="m-button" href="/start">
          Try again
        </Link>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="pl-center" aria-live="polite">
        <span className="pl-spinner" aria-hidden="true" />
        <h1>Building your plan…</h1>
        <p>Turning &ldquo;{local.fear}&rdquo; into small, single steps.</p>
      </div>
    );
  }
  return <Live local={local} plan={plan} />;
}

function Live({ local, plan }: { local: LocalSession; plan: Plan }) {
  const config = useMemo<SessionConfig>(
    () => ({
      sessionId: local.id,
      key: local.key,
      phoneKey: local.phoneKey,
      mode: local.mode,
      signal: local.signal,
      fear: local.fear,
      fearedOutcome: local.fearedOutcome,
      expectancyPre: local.expectancyPre,
      consent: local.consent,
      seed: local.seed,
      trials: TRIALS,
      ladder: plan.ladder,
      ladderSource: plan.source,
      ladderSha256: plan.sha256,
      audio: local.audio,
      intakeAt: local.intakeAt,
      builderDemo: local.builderDemo,
    }),
    [local, plan],
  );
  const [runtime, setRuntime] = useState<SessionRuntime | null>(null);

  useEffect(() => {
    const created = new SessionRuntime(config);
    setRuntime(created);
    return () => created.dispose();
  }, [config]);

  if (!runtime) return null;
  return <Stage runtime={runtime} local={local} plan={plan} />;
}

function Stage({ runtime, local, plan }: { runtime: SessionRuntime; local: LocalSession; plan: Plan }) {
  const snap = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  if (snap.phase === "ready") {
    return <Prepare runtime={runtime} local={local} plan={plan} phoneConnected={snap.phoneConnected} />;
  }
  return <Player runtime={runtime} snap={snap} local={local} />;
}

function Prepare({
  runtime,
  local,
  plan,
  phoneConnected,
}: {
  runtime: SessionRuntime;
  local: LocalSession;
  plan: Plan;
  phoneConnected: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const phoneUrl = `${origin}/s/${local.code}`;
  const remoteUrl = `${origin}/remote/${local.id}#k=${local.key}`;
  const needsPhone = local.signal === "phone";

  useEffect(() => {
    if (!needsPhone) return;
    let cancelled = false;
    QRCode.toDataURL(phoneUrl, { margin: 1, width: 360, color: { dark: "#0b0b0cff", light: "#ffffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsPhone, phoneUrl]);

  async function copyRemote() {
    try {
      await navigator.clipboard.writeText(remoteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pl-prepare">
      <section className="pl-plan">
        <span className="m-eyebrow">
          <span className="m-small-mark" aria-hidden="true">
            ✳
          </span>
          Your plan
        </span>
        <h1>{local.fear}</h1>
        <p className="pl-plan-line">{planLine(plan.ladder)}</p>
        <dl className="pl-plan-facts">
          <div>
            <dt>Your prediction</dt>
            <dd>
              {local.fearedOutcome} · {local.expectancyPre ?? "?"}%
            </dd>
          </div>
          <div>
            <dt>Steps per round</dt>
            <dd>{plan.ladder.contexts[0]!.levels.length}</dd>
          </div>
          <div>
            <dt>Ladder</dt>
            <dd>
              {plan.source === "curated" && "Hand-written and checked"}
              {plan.source === "generated" && "Generated, then lint-checked"}
              {plan.source === "fallback" && "We used our closest hand-written ladder"}
            </dd>
          </div>
        </dl>
        <ul className="pl-controls-help">
          <li>
            <kbd>↑</kbd> Step closer
          </li>
          <li>
            <kbd>↓</kbd> Step back
          </li>
          <li>
            <kbd>Space</kbd> Pause
          </li>
          <li>
            <kbd>0</kbd>–<kbd>9</kbd> How distressed you feel
          </li>
        </ul>
      </section>

      <section className="pl-pair">
        {needsPhone ? (
          <>
            <h2>Pair your phone</h2>
            <p>Scan with your phone camera, then place the phone flat on your chest.</p>
            <div className="pl-qr">
              {qr ? <img src={qr} alt={`QR code linking to ${phoneUrl}`} width={180} height={180} /> : <span />}
            </div>
            <p className="pl-code">
              or open <strong>{origin.replace(/^https?:\/\//, "")}/s</strong> and enter{" "}
              <code>{local.code}</code>
            </p>
            <p className={`pl-pair-status ${phoneConnected ? "is-on" : ""}`} aria-live="polite">
              <span aria-hidden="true" /> {phoneConnected ? "Phone connected" : "Waiting for your phone…"}
            </p>
          </>
        ) : (
          <>
            <h2>Keyboard mode</h2>
            <p>
              Every 25 seconds we&apos;ll ask how you feel. Press a number from 0 (calm) to 9 (the most you can
              take).
            </p>
          </>
        )}

        {local.mode === "therapist" && (
          <div className="pl-remote">
            <h3>Therapist link</h3>
            <p>Paste this into your telehealth chat. It lets your therapist pace the scene. Keep it private.</p>
            <div className="pl-remote-row">
              <code>{remoteUrl.replace(/#k=.*/, "#k=…")}</code>
              <button type="button" className="m-button m-button-secondary" onClick={copyRemote}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        <button type="button" className="m-button pl-start" onClick={() => void runtime.start()}>
          {needsPhone && !phoneConnected ? "Start without waiting" : "Start round 1"}
        </button>
        <p className="pl-fineprint">Not a medical device. Live sessions are capped and end on their own if left idle.</p>
      </section>
    </div>
  );
}
