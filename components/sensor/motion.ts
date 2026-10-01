"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

import type { MotionSample } from "@/lib/signal/breath";

export type MotionAccess = "granted" | "denied" | "unsupported";

type DeviceMotionEventIOS = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** How long a listening page waits for its first real sample before deciding there is no sensor. */
const SILENT_AFTER_MS = 3000;

const noopSubscribe = () => () => {};

export function useMotionApi(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "DeviceMotionEvent" in window,
    () => true,
  );
}

/** iOS only grants motion inside a user gesture on HTTPS, so call this straight from a tap handler. */
export async function requestMotionAccess(): Promise<MotionAccess> {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return "unsupported";
  const ctor = DeviceMotionEvent as DeviceMotionEventIOS;
  if (typeof ctor.requestPermission !== "function") return "granted";
  try {
    return (await ctor.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    // Safari throws when the call is not inside a user gesture or the page is not HTTPS.
    return "denied";
  }
}

/** Older WebKit reported epoch milliseconds in `timeStamp`; the spec says time since `timeOrigin`. */
function eventTime(event: Event): number {
  return event.timeStamp > 1e12 ? event.timeStamp : performance.timeOrigin + event.timeStamp;
}

function toSample(event: DeviceMotionEvent): MotionSample | null {
  const g = event.accelerationIncludingGravity;
  if (!g || g.x === null || g.y === null || g.z === null) return null;
  const r = event.rotationRate;
  const rotation = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
  return { t: eventTime(event), ax: g.x, ay: g.y, az: g.z, rotation };
}

/**
 * Streams DeviceMotion samples while `enabled`. Desktop browsers expose the event but never fire it,
 * so `onSilent` runs when nothing usable arrives within a few seconds.
 */
export function useDeviceMotion(
  enabled: boolean,
  onSample: (sample: MotionSample) => void,
  onSilent: () => void,
) {
  const emitSample = useEffectEvent(onSample);
  const emitSilent = useEffectEvent(onSilent);

  useEffect(() => {
    if (!enabled) return;
    let received = false;
    const handle = (event: DeviceMotionEvent) => {
      const sample = toSample(event);
      if (!sample) return;
      received = true;
      emitSample(sample);
    };
    window.addEventListener("devicemotion", handle);
    const silentTimer = window.setTimeout(() => {
      if (!received) emitSilent();
    }, SILENT_AFTER_MS);
    return () => {
      window.removeEventListener("devicemotion", handle);
      window.clearTimeout(silentTimer);
    };
  }, [enabled]);
}

/** Holds a screen wake lock while `enabled`, re-acquiring it when the page becomes visible again. */
export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
        setHeld(true);
        next.addEventListener("release", () => setHeld(false));
      } catch {
        // Denied by the browser (low battery, power saver, not visible). The UI says to keep it awake by hand.
        setHeld(false);
      }
    };

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [enabled]);

  return enabled && held;
}

type BatteryLike = EventTarget & { level: number };
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> };

/** Battery percent where the Battery Status API exists (Chromium on Android), otherwise null. */
export function useBatteryPercent(): number | null {
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== "function") return;
    let battery: BatteryLike | null = null;
    let cancelled = false;
    const update = () => {
      if (battery) setPercent(Math.round(battery.level * 100));
    };
    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        update();
        b.addEventListener("levelchange", update);
      })
      .catch(() => setPercent(null));
    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", update);
    };
  }, []);

  return percent;
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}
