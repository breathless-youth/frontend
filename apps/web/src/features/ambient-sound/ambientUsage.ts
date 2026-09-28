export type AmbientUsageSnapshot = { used: boolean; sec: number };

export type AmbientUsage = {
  start: () => void;
  stop: () => void;
  snapshot: () => AmbientUsageSnapshot;
};

/** 재생 누적 시간. now 는 밀리초를 돌려주는 시계(Date.now 등)를 주입한다. */
export function createAmbientUsage(now: () => number): AmbientUsage {
  let accumulatedMs = 0;
  let startedAt: number | null = null;
  let used = false;

  return {
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      used = true;
    },
    stop() {
      if (startedAt === null) return;
      accumulatedMs += now() - startedAt;
      startedAt = null;
    },
    snapshot() {
      const runningMs = startedAt === null ? 0 : now() - startedAt;
      return { used, sec: Math.floor((accumulatedMs + runningMs) / 1000) };
    },
  };
}
