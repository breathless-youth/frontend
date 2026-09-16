import { useCallback, useEffect, useRef } from "react";

import { renewLiveRoomSeat } from "@/lib/roomApi";

import type { RoomChannel } from "./roomChannel";

// renew가 dangling되면 재호출이 영원히 끝나지 않아 재연결·종료·안내가 모두 멈춘다.
// 이 시간이 지나면 응답을 못 받은 것으로 보고 fail-closed로 종료 처리로 넘긴다.
const REJOIN_TIMEOUT_MS = 8000;

/**
 * 방에 다시 들어갈 수 없다는 신호(ROOM_UNAVAILABLE·SNAPSHOT 미도착)를 하나의 재호출로 모은다.
 * 자리를 다시 잡으면 채널을 재연결해 구독·스냅샷을 처음부터 다시 만든다(세션 타이머는 유지).
 *
 * 상태는 셋이다.
 * - idle: 재호출을 걸 수 있다.
 * - rejoining: renew 응답을 기다리는 중. 이 사이 온 재신호는 그 시도가 끝나게 두고 무시한다.
 * - awaiting-recovery: 재연결까지 했고 SNAPSHOT 복구를 기다리는 중. 복구 전 재신호가 오면
 *   재호출로도 못 살린 것이니 종료 처리로 넘긴다("1회 재호출 → 실패 시 닫고 안내").
 *
 * renew의 성공·실패·타임아웃 콜백은 상태가 아직 rejoining일 때만 동작한다
 * — 셋 중 먼저 상태를 바꾼 하나만 이기고 나머지는 무효가 되어 늦은 reconnect·중복 안내가 나지 않는다.
 * 언마운트 시에도 전부 무효화한다.
 */
export function useRoomRejoin({
  channel,
  userId,
  inviteCode,
  onUnavailable,
}: {
  channel: RoomChannel;
  userId: number;
  inviteCode: string;
  onUnavailable: () => void;
}): () => void {
  const stateRef = useRef<"idle" | "rejoining" | "awaiting-recovery">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "SNAPSHOT" && stateRef.current === "awaiting-recovery") {
        stateRef.current = "idle";
      }
    });
    return () => {
      unsubscribe();
      cancelledRef.current = true;
      clearTimer();
    };
  }, [channel]);

  return useCallback(() => {
    if (cancelledRef.current || stateRef.current === "rejoining") {
      return;
    }
    if (stateRef.current === "awaiting-recovery") {
      stateRef.current = "idle";
      onUnavailable();
      return;
    }
    stateRef.current = "rejoining";
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (cancelledRef.current || stateRef.current !== "rejoining") {
        return;
      }
      stateRef.current = "idle";
      onUnavailable();
    }, REJOIN_TIMEOUT_MS);
    void renewLiveRoomSeat(userId, inviteCode)
      .then(() => {
        if (cancelledRef.current || stateRef.current !== "rejoining") {
          return;
        }
        clearTimer();
        stateRef.current = "awaiting-recovery";
        channel.reconnect();
      })
      .catch(() => {
        if (cancelledRef.current || stateRef.current !== "rejoining") {
          return;
        }
        clearTimer();
        stateRef.current = "idle";
        onUnavailable();
      });
  }, [channel, userId, inviteCode, onUnavailable]);
}
