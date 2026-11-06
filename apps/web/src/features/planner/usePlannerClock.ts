import { useSyncExternalStore } from "react";

import { deviceTimeZone } from "@/lib/dateKey";

import { plannerDateKeyOf } from "./plannerDay";

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 1000);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function readClock(): string {
  return `${Math.floor(Date.now() / 60_000) * 60_000}|${deviceTimeZone()}`;
}

export function usePlannerClock(): { nowMs: number; todayKey: string; timeZone: string } {
  const snapshot = useSyncExternalStore(subscribe, readClock);
  const [minute, timeZone] = snapshot.split("|");
  const nowMs = Number(minute);
  return { nowMs, todayKey: plannerDateKeyOf(new Date(nowMs), timeZone), timeZone: timeZone! };
}
