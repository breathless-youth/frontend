import type { ToNativeMessage } from "@focusmakers/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "../../bridge/nativeBridge";
import type { DetectorSignal } from "../focusDetector";
import { createDeviceHandlingDetector } from "../deviceHandlingDetector";

interface BridgeHarness {
  readonly sent: ToNativeMessage[];
  /** 네이티브가 `injectJavaScript`로 밀어 넣는 것과 같은 경로. */
  fromNative(message: unknown): void;
}

function installBridge(): BridgeHarness {
  const sent: ToNativeMessage[] = [];
  vi.stubGlobal("ReactNativeWebView", {
    postMessage(raw: string) {
      sent.push(JSON.parse(raw) as ToNativeMessage);
    },
  });
  return {
    sent,
    fromNative(message) {
      const target = globalThis as unknown as Record<string, ((raw: string) => void) | undefined>;
      target[NATIVE_MESSAGE_ENTRY]?.(JSON.stringify(message));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDeviceHandlingDetector", () => {
  it("start()가 네이티브 센서를 켠다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();

    detector.start();

    expect(bridge.sent.map((message) => message.type)).toEqual(["motion-sensor"]);
    expect(bridge.sent[0]).toMatchObject({ type: "motion-sensor", enabled: true });
  });

  it("device-handling을 DEVICE 원신호로 흘린다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    detector.start();
    bridge.fromNative({ type: "device-handling", active: true, atMs: 1000 });
    bridge.fromNative({ type: "device-handling", active: false, atMs: 2000 });

    expect(seen).toEqual([
      { trigger: "DEVICE", active: true },
      { trigger: "DEVICE", active: false },
    ]);
  });

  it("같은 값이 반복되면 다시 내보내지 않는다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    detector.start();
    bridge.fromNative({ type: "device-handling", active: true, atMs: 1000 });
    bridge.fromNative({ type: "device-handling", active: true, atMs: 1200 });

    expect(seen).toHaveLength(1);
  });

  it("자기 것이 아닌 메시지는 무시한다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    detector.start();
    bridge.fromNative({ type: "app-state", state: "background", atMs: 1000 });

    expect(seen).toEqual([]);
  });

  /**
   * 이걸 빠뜨리면 조작 중에 일시정지한 세션에서 `DEVICE` 원신호가 `true`로 굳고,
   * 재개하는 순간 유지시간을 이미 채운 상태라 곧바로 비집중으로 잘못 진입한다.
   */
  it("stop()이 열려 있던 조작 구간을 닫고 센서를 끈다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    detector.start();
    bridge.fromNative({ type: "device-handling", active: true, atMs: 1000 });
    detector.stop();

    expect(seen).toEqual([
      { trigger: "DEVICE", active: true },
      { trigger: "DEVICE", active: false },
    ]);
    expect(bridge.sent.at(-1)).toMatchObject({ type: "motion-sensor", enabled: false });
  });

  it("stop() 이후에 도착한 신호는 상태를 건드리지 않는다", () => {
    const bridge = installBridge();
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    detector.start();
    detector.stop();
    bridge.fromNative({ type: "device-handling", active: true, atMs: 1000 });

    expect(seen).toEqual([]);
  });

  /** ADR 0001 — `apps/web`은 독립 서비스로도 배포된다. 브리지가 없으면 조용해야 한다. */
  it("브라우저 단독 모드에서 던지지 않는다", () => {
    const detector = createDeviceHandlingDetector();
    const seen: DetectorSignal[] = [];
    detector.subscribe((signal) => seen.push(signal));

    expect(() => {
      detector.start();
      detector.stop();
    }).not.toThrow();
    expect(seen).toEqual([]);
  });
});
