import type { VisionEngine, VisionObservation } from "./types";

/**
 * 실제 온디바이스 추론 대신 주기적으로 STUDYING/AWAY를 방출하는 mock.
 * 실제 구현(카메라 프레임 → 얼굴/자세 판정)은 기술 스파이크에서 `VisionEngine`
 * 인터페이스에 맞춰 교체한다. 원본 프레임을 다루지 않으므로 개인정보 경계에 안전하다.
 */
export function createMockVisionEngine(intervalMs = 5000): VisionEngine {
  const listeners = new Set<(observation: VisionObservation) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;

  const emit = () => {
    tick += 1;
    const status: VisionObservation["status"] = tick % 4 === 0 ? "AWAY" : "STUDYING";
    const observation: VisionObservation = {
      timestampMs: Date.now(),
      status,
      confidence: 0.9,
    };
    listeners.forEach((listener) => listener(observation));
  };

  return {
    async initialize() {
      // 실제 구현에서는 모델 로딩. mock은 no-op.
    },
    async start() {
      if (timer) return;
      timer = setInterval(emit, intervalMs);
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    async dispose() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
