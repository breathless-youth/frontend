import { useEffect, useRef } from "react";

import type { RoomFocusState } from "@focusmakers/types";

import type { SessionState } from "@/features/study-session/sessionState";

import type { RoomChannel } from "./roomChannel";

/**
 * 측정 훅 상태를 STOMP 발행으로 파생한다.
 *
 * 세션 중 API 호출 금지·제출은 종료 시 1회 계약은 그대로다 — 이 채널은 표시용 실시간
 * 공유일 뿐 기록 저장 경로가 아니다.
 *
 * 카메라는 룸에서 일시정지 = 카메라 끔이라 PAUSE 진입·해제 전이를 CAMERA_CHANGED로
 * 발행하고, 백그라운드 pause도 같은 경로로 자연히 알려진다. 집중상태는 FOCUS·DISTRACTED
 * 전이에서만 발행한다 — 일시정지 중에는 집중상태가 무의미하다. 순공시간은 명세의 1분
 * 주기를 따르고, 최신 값은 ref로 읽어 인터벌을 재생성하지 않는다.
 *
 * 마운트 시점에는 아무것도 발행하지 않는다 — 입장 직후의 초기 상태는 입장 플로우가
 * 서버에 알리는 몫이고, 이 훅은 변화만 중계한다.
 */
const STUDY_TIME_INTERVAL_MS = 60_000;

type PublisherInput = {
  sessionState: SessionState;
  focusSec: number;
};

export function useRoomStatePublisher(channel: RoomChannel, input: PublisherInput): void {
  const cameraOn = input.sessionState.kind !== "PAUSE";
  const focusState: RoomFocusState | null =
    input.sessionState.kind === "FOCUS"
      ? "FOCUS"
      : input.sessionState.kind === "DISTRACTION"
        ? "DISTRACTED"
        : null;

  const focusSecRef = useRef(input.focusSec);
  focusSecRef.current = input.focusSec;

  const prevCameraOnRef = useRef(cameraOn);
  useEffect(() => {
    if (prevCameraOnRef.current !== cameraOn) {
      prevCameraOnRef.current = cameraOn;
      channel.publishState({ type: "CAMERA_CHANGED", cameraOn });
    }
  }, [channel, cameraOn]);

  const prevFocusStateRef = useRef(focusState);
  useEffect(() => {
    // PAUSE(null) 구간은 건너뛰되 이전 값은 유지한다 — 일시정지 전후가 같은 상태면 무발행.
    if (focusState !== null && prevFocusStateRef.current !== focusState) {
      prevFocusStateRef.current = focusState;
      channel.publishState({ type: "FOCUS_CHANGED", focusState });
    }
  }, [channel, focusState]);

  useEffect(() => {
    const timer = setInterval(() => {
      channel.publishState({ type: "STUDY_TIME", studySeconds: focusSecRef.current });
    }, STUDY_TIME_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [channel]);
}
