import type { DistractionTrigger } from "../sessionState";

/**
 * 비집중 감지기 어댑터 — **인터페이스 + mock만** 있다.
 *
 * 실제로는 전면 카메라 Vision(자리 이탈·휴대폰 사용)과 가속도 센서(기기 조작)를 묶는 계층이지만,
 * 실기기 스파이크 전에는 어떤 SDK도 설치하지 않는다. 여기서 내보내는 건 **원신호**뿐이고,
 * 유지시간 판정·대표 트리거 선택은 `../detection.ts`(순수 TS)가 한다.
 */

export interface DetectorSignal {
  readonly trigger: DistractionTrigger;
  readonly active: boolean;
}

export interface FocusDetector {
  start(): void;
  stop(): void;
  subscribe(listener: (signal: DetectorSignal) => void): () => void;
}

export interface MockFocusDetector extends FocusDetector {
  /**
   * 원신호를 수동으로 밀어넣는다. **개발/테스트 전용** —
   * 프로덕션 UI에 감지 상태를 바꾸는 버튼을 만들지 않는다(SCR-S3-1·S3-2 구현 노트 4번).
   */
  emit(signal: DetectorSignal): void;
}

export function createMockFocusDetector(): MockFocusDetector {
  const listeners = new Set<(signal: DetectorSignal) => void>();
  let running = false;

  return {
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(signal) {
      if (!running) {
        return;
      }
      for (const listener of listeners) {
        listener(signal);
      }
    },
  };
}
