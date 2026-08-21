import type { RoomMember, RoomServerMessage, RoomStatePublish } from "@focusmakers/types";

import type { RoomChannel, RoomChannelStatus } from "./roomChannel";

/**
 * 시나리오 재생 mock 채널 — 테스트와 dev 시연용.
 *
 * `connect()` 시 SNAPSHOT을 즉시 발행하고, `steps`를 connect 기준 지연 시간에 맞춰 재생한다.
 * "실시간처럼 보이게 하는 가짜"가 아니라 메시지 계약을 재생하는 장치다 — 화면·리듀서
 * 로직은 이것만으로 결정적으로 테스트되고, 연결 수립·재연결 같은 실시간성 자체는 mock의
 * 검증 대상이 아니다(실서버 검증 항목).
 */
export type MockRoomScenarioStep = { afterMs: number; message: RoomServerMessage };

export type MockRoomScenario = {
  snapshot: RoomMember[];
  steps?: MockRoomScenarioStep[];
};

export interface MockRoomChannel extends RoomChannel {
  /** 발행 기록 — 테스트가 페이로드를 검증한다. */
  readonly published: RoomStatePublish[];
}

export function createMockRoomChannel(scenario: MockRoomScenario): MockRoomChannel {
  let status: RoomChannelStatus = "idle";
  const listeners = new Set<(message: RoomServerMessage) => void>();
  const published: RoomStatePublish[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  function emit(message: RoomServerMessage) {
    for (const listener of listeners) {
      listener(message);
    }
  }

  return {
    get status() {
      return status;
    },
    published,
    connect() {
      status = "open";
      emit({ type: "SNAPSHOT", members: scenario.snapshot });
      for (const step of scenario.steps ?? []) {
        timers.push(
          setTimeout(() => {
            emit(step.message);
          }, step.afterMs),
        );
      }
    },
    disconnect() {
      status = "closed";
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.length = 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publishState(message) {
      published.push(message);
    },
  };
}
