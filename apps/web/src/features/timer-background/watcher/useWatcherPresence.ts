import { useEffect, useRef, useState } from "react";

import type { DistractionTrigger } from "@/features/study-session/sessionState";

import {
  WATCHER_APPROACH_LEAD_MS,
  WATCHER_LEAVE_MS,
  type WatcherTriggerMs,
} from "./watcherTrigger";

/**
 * 감독자가 있어야 하는가
 *
 * `trigger`는 지금 비집중 원인이고, 비집중이 아니면 null이다.
 * 비집중이 시작된 때부터 잰 시간이 지금 원인의 기준 시간을 넘으면 참이 된다.
 * 원인이 바뀌면 새 원인의 기준과 비교하고, 이미 들어왔으면 원인이 바뀌어도 머문다.
 * 들어온 뒤에는 집중(또는 일시정지)이 `WATCHER_LEAVE_MS` 이어져야 거짓이 되고, 그 전에 다시 비집중이면 머문다.
 * 들어오기 전에 짧게 집중했다 비집중으로 돌아오면 처음부터 다시 잰다.
 * 비집중 판정 자체는 감지 단계가 원인마다 유지 시간을 두고 확정해서 여기서는 따로 디바운스하지 않는다.
 * 자리 비움 기준을 길게 두면 오래 비운 동안 들어와 있다가, 돌아와 집중하면 나간다.
 *
 * `approaching`은 들어오기 `WATCHER_APPROACH_LEAD_MS` 전부터 들어올 때까지 참이라 멀리서 다가오는 발소리를 낸다.
 *
 * 비집중 장면은 매니페스트의 시간으로 같은 계산을 돌려서 두 시간을 인자로 받는다.
 * 예고 소리를 아직 받지 못한 장면은 예고 길이 0을 넘겨 예고 없이 바로 들어온다.
 * 예고 길이를 늦게 알면 예고가 제때보다 늦게 시작해서, 그 늦은 만큼을 `approachLateMs`로 알려 소리를 그만큼 건너뛰게 한다.
 * `approachLateMs`는 다가오는 동안에만 값이 있고, 기존 호출부가 객체 전체를 비교해도 깨지지 않게 그 밖에는 undefined다.
 */
export function useWatcherPresence(
  trigger: DistractionTrigger | null,
  thresholds: WatcherTriggerMs,
  {
    leaveMs = WATCHER_LEAVE_MS,
    approachLeadMs = WATCHER_APPROACH_LEAD_MS,
  }: { leaveMs?: number; approachLeadMs?: number } = {},
): { present: boolean; approaching: boolean; approachLateMs?: number } {
  const distracted = trigger !== null;
  const startedAt = useRef<number | null>(null);
  const [present, setPresent] = useState(false);
  const [approachLateMs, setApproachLateMs] = useState<number | null>(null);
  const approaching = approachLateMs !== null;
  if (approaching && (!distracted || present)) setApproachLateMs(null);
  // 떠나는 시간이 0이면 타이머를 기다리지 않고 이 렌더에서 나가서, 부른 쪽이 장면을 없앨 때 남은 등장 상태를 바로 지울 수 있다.
  if (present && !distracted && leaveMs <= 0) setPresent(false);

  useEffect(() => {
    if (!distracted) return;
    startedAt.current = Date.now();
    return () => {
      startedAt.current = null;
    };
  }, [distracted]);

  useEffect(() => {
    if (trigger === null || present || startedAt.current === null) return;
    const remaining = thresholds[trigger] - (Date.now() - startedAt.current);
    const timer = setTimeout(() => setPresent(true), Math.max(0, remaining));
    // 이미 다가오는 중이면 소리가 벌써 나고 있어서 늦은 시간을 다시 쓰지 않는다.
    const lead =
      approachLeadMs > 0
        ? setTimeout(
            () => setApproachLateMs((prev) => prev ?? Math.max(0, approachLeadMs - remaining)),
            Math.max(0, remaining - approachLeadMs),
          )
        : undefined;
    return () => {
      clearTimeout(timer);
      clearTimeout(lead);
    };
  }, [trigger, thresholds, present, approachLeadMs]);

  useEffect(() => {
    if (distracted || !present) return;
    const timer = setTimeout(() => setPresent(false), leaveMs);
    return () => clearTimeout(timer);
  }, [distracted, present, leaveMs]);

  return { present, approaching, approachLateMs: approachLateMs ?? undefined };
}
