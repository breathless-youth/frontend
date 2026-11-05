import type { SoundGroupId, SoundId } from "./catalog";

export type AmbientUsageSnapshot = { used: boolean; sec: number };

export type PlayingSound = { readonly id: SoundId; readonly group: SoundGroupId };

export type SoundPlaySeconds = PlayingSound & { readonly sec: number };

export type AmbientUsage = {
  start: () => void;
  stop: () => void;
  setSounds: (sounds: readonly PlayingSound[]) => void;
  snapshot: () => AmbientUsageSnapshot;
  soundSeconds: () => SoundPlaySeconds[];
};

/**
 * 배경음 재생 누적 시간
 *
 * now 는 밀리초를 돌려주는 시계(Date.now 등)를 주입한다.
 * 플레이어가 실제로 재생하는 동안만 센다.
 * 소리별 시간은 재생 구간을 그때 켜져 있던 소리마다 더해서, 일시정지 구간이 전체 시간과 똑같이 빠진다.
 */
export function createAmbientUsage(now: () => number): AmbientUsage {
  let accumulatedMs = 0;
  let startedAt: number | null = null;
  let used = false;
  let sounds: readonly PlayingSound[] = [];
  // 지금 켜진 소리에 아직 더하지 않은 재생 구간의 시작 시각.
  let segmentStartedAt: number | null = null;
  const perSound = new Map<SoundId, { sound: PlayingSound; ms: number }>();

  const credit = (ms: number) => {
    for (const sound of sounds) {
      const entry = perSound.get(sound.id);
      if (entry) entry.ms += ms;
      else perSound.set(sound.id, { sound, ms });
    }
  };
  const flush = () => {
    if (segmentStartedAt === null) return;
    const at = now();
    credit(at - segmentStartedAt);
    segmentStartedAt = at;
  };

  return {
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      segmentStartedAt = startedAt;
      used = true;
    },
    stop() {
      if (startedAt === null) return;
      flush();
      accumulatedMs += now() - startedAt;
      startedAt = null;
      segmentStartedAt = null;
    },
    setSounds(next) {
      flush();
      sounds = next;
    },
    snapshot() {
      const runningMs = startedAt === null ? 0 : now() - startedAt;
      return { used, sec: Math.floor((accumulatedMs + runningMs) / 1000) };
    },
    soundSeconds() {
      flush();
      return [...perSound.values()]
        .map(({ sound, ms }) => ({ ...sound, sec: Math.floor(ms / 1000) }))
        .filter((played) => played.sec > 0);
    },
  };
}
