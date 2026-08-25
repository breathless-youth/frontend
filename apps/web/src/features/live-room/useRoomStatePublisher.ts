import { useEffect, useRef } from "react";

import type { RoomFocusState } from "@focusmakers/types";

import type { SessionState } from "@/features/study-session/sessionState";

import type { RoomChannel } from "./roomChannel";

/**
 * 측정 훅 상태를 STOMP 발행으로 파생 — 카메라 상태 발행의 단일 소유자
 * - 이 채널은 표시용 실시간 공유일 뿐 기록 저장 경로가 아니다.
 *
 * - 카메라: 호출부가 준 실제 켜짐 값(의도 ∧ 비일시정지 ∧ 실제 획득)을 그대로 발행한다.
 *   서버 기본값이 꺼짐이라 마운트 시 초기값도 1회 발행하고, 이후에는 변화만 중계한다.
 *   발행 주체를 이 훅 하나로 고정한다 — 초기 발행·획득 실패 정정이 각자 발행하면
 *   순서 경쟁으로 거짓 켜짐이 새 나간다.
 * - 집중상태: FOCUS·DISTRACTED 전이에서만 발행 (일시정지 중에는 집중상태가 무의미)
 * - 순공시간: 1분 주기 갱신
 */
const STUDY_TIME_INTERVAL_MS = 60_000;

type PublisherInput = {
  sessionState: SessionState;
  /**
   * 발행할 순공시간. `null`은 "아직 발행할 값을 모른다"는 뜻이다 — 유예 재입장 직후
   * 첫 SNAPSHOT(기준값)이 오기 전에 발행하면 0 기준의 낡은 값이 나가고, 연결 전이면
   * 채널 버퍼에 쌓였다가 연결 직후 flush되어 서버 보존값을 덮어쓴다. 그동안은 틱을 쉰다.
   */
  focusSec: number | null;
  cameraOn: boolean;
};

export function useRoomStatePublisher(channel: RoomChannel, input: PublisherInput): void {
  const cameraOn = input.cameraOn;
  const focusState: RoomFocusState | null =
    input.sessionState.kind === "FOCUS"
      ? "FOCUS"
      : input.sessionState.kind === "DISTRACTION"
        ? "DISTRACTED"
        : null;

  const focusSecRef = useRef(input.focusSec);
  focusSecRef.current = input.focusSec;

  const prevCameraOnRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevCameraOnRef.current !== cameraOn) {
      prevCameraOnRef.current = cameraOn;
      channel.publishState({ cameraOn });
    }
  }, [channel, cameraOn]);

  const prevFocusStateRef = useRef(focusState);
  useEffect(() => {
    // PAUSE(null) 구간은 건너뛰되 이전 값은 유지한다 — 일시정지 전후가 같은 상태면 무발행.
    if (focusState !== null && prevFocusStateRef.current !== focusState) {
      prevFocusStateRef.current = focusState;
      channel.publishState({ focusState });
    }
  }, [channel, focusState]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (focusSecRef.current !== null) {
        channel.publishState({ studySeconds: focusSecRef.current });
      }
    }, STUDY_TIME_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [channel]);
}
