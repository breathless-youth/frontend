import { useEffect, useEffectEvent, useRef } from "react";

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
 * - 순공시간: 마운트 시 1회 즉시 발행(재입장 시 서버 보존값 잔상 제거) + 1분 주기 갱신
 * - 마이크와 휴식: 그룹 공부방만 값을 넘기고, 넘긴 값은 카메라처럼 마운트에 한 번과 바뀔 때마다 따로 발행한다.
 *   초대코드 방은 서버가 두 필드를 받지 않아서 넘기지 않으면 보내지 않는다.
 */
const STUDY_TIME_INTERVAL_MS = 60_000;

type PublisherInput = {
  sessionState: SessionState;
  focusSec: number;
  cameraOn: boolean;
  micOn?: boolean;
  onBreak?: boolean;
};

/**
 * 값이 있을 때만 처음 한 번과 바뀔 때마다 보내기
 *
 * 다시 그려져도 같은 값이면 보내지 않는다.
 */
function usePublishWhenChanged(value: boolean | undefined, publish: (value: boolean) => void) {
  const send = useEffectEvent(publish);
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (value !== undefined && prevRef.current !== value) {
      prevRef.current = value;
      send(value);
    }
  }, [value]);
}

export function useRoomStatePublisher(channel: RoomChannel, input: PublisherInput): void {
  const cameraOn = input.cameraOn;
  const focusState: RoomFocusState | null =
    input.sessionState.kind === "FOCUS"
      ? "FOCUS"
      : input.sessionState.kind === "DISTRACTION"
        ? "DISTRACTED"
        : null;

  const publishFocusSec = useEffectEvent(() => {
    channel.publishState({ focusSec: input.focusSec });
  });

  const prevCameraOnRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevCameraOnRef.current !== cameraOn) {
      prevCameraOnRef.current = cameraOn;
      channel.publishState({ cameraOn });
    }
  }, [channel, cameraOn]);
  usePublishWhenChanged(input.micOn, (micOn) => channel.publishState({ micOn }));
  usePublishWhenChanged(input.onBreak, (onBreak) => channel.publishState({ onBreak }));

  const prevFocusStateRef = useRef(focusState);
  useEffect(() => {
    // PAUSE(null) 구간은 건너뛰되 이전 값은 유지한다 — 일시정지 전후가 같은 상태면 무발행.
    if (focusState !== null && prevFocusStateRef.current !== focusState) {
      prevFocusStateRef.current = focusState;
      channel.publishState({ focusState });
    }
  }, [channel, focusState]);

  useEffect(() => {
    // 마운트 1회 즉시 발행 — 카메라 초기 발행과 같은 이유의 짝이다. 재입장이면 서버
    // 보존값(이전 세션 시간)이 다른 참가자 화면에 남아 있는데, 첫 정기 발행은 60초
    // 뒤라 그때까지 잔상이 보인다. 연결 전이면 채널 버퍼가 연결 직후 내보낸다.
    publishFocusSec();
    const timer = setInterval(() => {
      publishFocusSec();
    }, STUDY_TIME_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [channel]);
}
