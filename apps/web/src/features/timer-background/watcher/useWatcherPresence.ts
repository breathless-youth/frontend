import { useEffect, useRef, useState } from "react";

import type { DistractionTrigger } from "@/features/study-session/sessionState";

import {
  WATCHER_APPROACH_LEAD_MS,
  WATCHER_LEAVE_MS,
  type WatcherTriggerMs,
} from "./watcherTrigger";

/**
 * 감시자가 있어야 하는가
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
 */
export function useWatcherPresence(
  trigger: DistractionTrigger | null,
  thresholds: WatcherTriggerMs,
): { present: boolean; approaching: boolean } {
  const distracted = trigger !== null;
  const startedAt = useRef<number | null>(null);
  const [present, setPresent] = useState(false);
  const [approaching, setApproaching] = useState(false);
  if (approaching && (!distracted || present)) setApproaching(false);

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
    const lead = setTimeout(
      () => setApproaching(true),
      Math.max(0, remaining - WATCHER_APPROACH_LEAD_MS),
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(lead);
    };
  }, [trigger, thresholds, present]);

  useEffect(() => {
    if (distracted || !present) return;
    const timer = setTimeout(() => setPresent(false), WATCHER_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [distracted, present]);

  return { present, approaching };
}
