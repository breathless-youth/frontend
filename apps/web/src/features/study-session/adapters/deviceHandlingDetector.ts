import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";
import type { DetectorSignal, FocusDetector } from "./focusDetector";

/**
 * 기기 조작(`DEVICE`) 감지기 — 신호원은 **네이티브 가속도 센서**다(설계 §5).
 *
 * Vision 감지기(`createVisionFocusDetector`)와 같은 `FocusDetector`를 구현하므로 훅·상태기계·
 * 화면은 이 감지기가 카메라가 아니라 센서를 본다는 것을 모른다. 유지시간 디바운스는 여기서도
 * 하지 않는다 — `../detection.ts`의 `stepDetection`이 세 트리거를 한 곳에서 판정한다.
 *
 * **브라우저 단독 모드(ADR 0001)에서는 아무 일도 일어나지 않는다.** `postToNative`는 브리지가
 * 없으면 조용히 무시하고, 아무도 `device-handling`을 보내지 않으므로 `DEVICE` 원신호는
 * `false`로 남는다. 브라우저용 `DeviceMotionEvent` 경로는 iOS 권한 프롬프트 UX가 정해진 뒤의
 * 별개 작업이다.
 */
export function createDeviceHandlingDetector(): FocusDetector {
  const listeners = new Set<(signal: DetectorSignal) => void>();
  let unsubscribeBridge: (() => void) | null = null;
  /** 마지막으로 내보낸 원신호. `stop()`이 구간을 닫아야 하는지 판단하는 데 쓴다. */
  let active = false;

  function notify(next: boolean): void {
    if (next === active) {
      return;
    }
    active = next;
    for (const listener of [...listeners]) {
      listener({ trigger: "DEVICE", active: next });
    }
  }

  return {
    /**
     * 멱등. 브리지 구독을 먼저 걸고 센서를 켠다 — 순서를 뒤집으면 켜자마자 올라온 첫 신호를
     * 놓칠 수 있다(`injectJavaScript`는 이 함수의 반환을 기다려 주지 않는다).
     */
    start(): void {
      if (unsubscribeBridge !== null) {
        return;
      }
      unsubscribeBridge = subscribeToNativeMessages((message) => {
        if (message.type === "device-handling") {
          notify(message.active);
        }
      });
      postToNative({ type: "motion-sensor", enabled: true, atMs: Date.now() });
    },

    /**
     * **일시정지·카메라 전환용** — Vision 쪽 `stop()`과 같은 시점에 불린다(설계 §5
     * "샘플링과 수명").
     *
     * ⚠️ **구독을 끊기 전에 원신호를 직접 내린다.** 네이티브도 정지하면서 `false`를 보내지만
     * 그건 구독을 끊은 뒤에 도착하므로 웹에 닿지 않는다. 그대로 두면 조작 중에 일시정지한
     * 세션에서 `DEVICE` 원신호가 `true`로 굳고, 재개하는 순간 유지시간을 이미 채운 상태라
     * **곧바로 비집중으로 잘못 진입한다.** Vision 쪽은 재개 후 첫 프레임이 무조건 신호를
     * 덮어써서(`emitted = null`) 같은 문제가 없지만, 센서는 값이 바뀔 때만 보내므로
     * "재개했는데 조작 중이 아님"이 아무 신호도 만들지 않는다.
     */
    stop(): void {
      notify(false);
      unsubscribeBridge?.();
      unsubscribeBridge = null;
      postToNative({ type: "motion-sensor", enabled: false, atMs: Date.now() });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
