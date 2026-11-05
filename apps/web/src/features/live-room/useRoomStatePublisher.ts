import { useEffect, useEffectEvent, useRef } from "react";
import type { RefObject } from "react";

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
 * - 서버 값 맞추기: 자리를 새로 잡은 서버는 카메라, 마이크, 휴식을 처음 값으로 돌려 둔다.
 *   그래서 SNAPSHOT의 내 값이 마지막으로 보낸 값과 다르면 그 값만 다시 보낸다.
 */
const STUDY_TIME_INTERVAL_MS = 60_000;

type PublisherInput = {
  sessionState: SessionState;
  focusSec: number;
  cameraOn: boolean;
  micOn?: boolean;
  onBreak?: boolean;
  /** SNAPSHOT에서 내 멤버 값을 찾는다. */
  myUserId: number;
};

/** 마지막으로 서버에 보낸 값이고 아직 보내지 않았으면 null이다. */
type SentValues = { cameraOn: boolean | null; micOn: boolean | null; onBreak: boolean | null };

/**
 * 값이 있을 때만 처음 한 번과 바뀔 때마다 보내기
 *
 * 다시 그려져도 같은 값이면 보내지 않는다.
 */
function usePublishWhenChanged(
  field: keyof SentValues,
  value: boolean | undefined,
  sentRef: RefObject<SentValues>,
  publish: (value: boolean) => void,
) {
  const send = useEffectEvent(publish);
  useEffect(() => {
    if (value !== undefined && sentRef.current[field] !== value) {
      sentRef.current[field] = value;
      send(value);
    }
  }, [field, sentRef, value]);
}

export function useRoomStatePublisher(channel: RoomChannel, input: PublisherInput): void {
  const cameraOn = input.cameraOn;
  const myUserId = input.myUserId;
  const focusState: RoomFocusState | null =
    input.sessionState.kind === "FOCUS"
      ? "FOCUS"
      : input.sessionState.kind === "DISTRACTION"
        ? "DISTRACTED"
        : null;

  const publishFocusSec = useEffectEvent(() => {
    channel.publishState({ focusSec: input.focusSec });
  });

  const sentRef = useRef<SentValues>({ cameraOn: null, micOn: null, onBreak: null });
  usePublishWhenChanged("cameraOn", cameraOn, sentRef, (value) =>
    channel.publishState({ cameraOn: value }),
  );
  usePublishWhenChanged("micOn", input.micOn, sentRef, (value) =>
    channel.publishState({ micOn: value }),
  );
  usePublishWhenChanged("onBreak", input.onBreak, sentRef, (value) =>
    channel.publishState({ onBreak: value }),
  );

  useEffect(
    () =>
      channel.subscribe((message) => {
        if (message.type !== "SNAPSHOT") {
          return;
        }
        const me = message.members.find((member) => member.userId === myUserId);
        if (me === undefined) {
          return;
        }
        // 보낸 적 없는 값은 이 방에서 쓰지 않는 값이라 서버 값과 달라도 보내지 않는다.
        const sent = sentRef.current;
        if (sent.cameraOn !== null && me.cameraOn !== sent.cameraOn) {
          channel.publishState({ cameraOn: sent.cameraOn });
        }
        if (sent.micOn !== null && me.micOn !== sent.micOn) {
          channel.publishState({ micOn: sent.micOn });
        }
        if (sent.onBreak !== null && me.onBreak !== sent.onBreak) {
          channel.publishState({ onBreak: sent.onBreak });
        }
      }),
    [channel, myUserId],
  );

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
