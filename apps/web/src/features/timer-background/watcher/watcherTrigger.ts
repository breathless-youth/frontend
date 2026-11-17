import type { DistractionTrigger } from "@/features/study-session/sessionState";

/** 비집중 원인마다 감독관이 들어오기까지 비집중이 이어져야 하는 시간 */
export type WatcherTriggerMs = Readonly<Record<DistractionTrigger, number>>;

export const DEFAULT_WATCHER_TRIGGER_MS: WatcherTriggerMs = {
  AWAY: 9_000,
  PHONE: 9_000,
  DEVICE: 9_000,
  SLEEP: 9_000,
};

/** 감독관이 들어오기 이만큼 전부터 멀리서 다가오는 발소리만 낸다. 기본 기준이면 비집중 2초부터 9초까지다. */
export const WATCHER_APPROACH_LEAD_MS = 7_000;

/** 들어온 감독관이 나가기까지 집중(또는 일시정지)이 이어져야 하는 시간 */
export const WATCHER_LEAVE_MS = 3_000;
