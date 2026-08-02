import { Accelerometer } from "expo-sensors";

import type { MotionWindow } from "./deviceMotion";
import {
  EMPTY_MOTION_WINDOW,
  MOTION_SAMPLE_INTERVAL_MS,
  MOTION_STDDEV_THRESHOLD,
  isHandlingActive,
  pushSample,
} from "./deviceMotion";

/**
 * 가속도 센서 구독 어댑터 — 기기 조작(`DEVICE`) **원신호**를 만든다.
 *
 * 판정 계산은 `deviceMotion.ts`(순수)가, 유지시간 디바운스는 웹의 `stepDetection`이 갖는다.
 * 이 파일은 **구독 수명과 변화 감지**만 맡는다(`apps/mobile/CLAUDE.md` 경계 규칙 — 화면이
 * 센서 SDK를 직접 부르지 않는다).
 *
 * 내보내는 것은 boolean뿐이다. 원시 가속도 값은 브리지를 건너지 않는다
 * (스펙 §3 "가속도 신호의 경계") — 초당 20개짜리 스트림을 WebView로 넘길 이유가 없고,
 * 판정이 두 곳으로 갈라지는 것도 막는다.
 */

/** 테스트 주입점. `expo-sensors`의 `Accelerometer`가 이 모양을 그대로 만족한다. */
export interface AccelerometerAdapter {
  setUpdateInterval(intervalMs: number): void;
  addListener(listener: (measurement: { x: number; y: number; z: number }) => void): {
    remove(): void;
  };
  isAvailableAsync(): Promise<boolean>;
}

export interface DeviceMotionSource {
  /** 멱등. 센서가 없는 기기에서는 조용히 아무 일도 일어나지 않는다. */
  start(): void;
  /** 멱등. 열려 있던 조작 구간을 `false`로 닫고 창을 비운다. */
  stop(): void;
  subscribe(listener: (active: boolean) => void): () => void;
}

export interface DeviceMotionSourceOptions {
  readonly accelerometer?: AccelerometerAdapter;
  /**
   * 표본 시각. 기본값이 센서가 주는 `timestamp`가 **아닌** 이유는 그 값의 기준점이 플랫폼마다
   * 다르기 때문이다(iOS는 부팅 이후, Android는 별도 기준). 창 길이는 300ms짜리 상대 구간이라
   * 어느 쪽이든 계산은 되지만, 세션의 다른 모든 시각이 `Date.now()` 벽시계라 기준을 하나로
   * 맞춰 두는 편이 디버깅에서 훨씬 낫다.
   */
  readonly nowMs?: () => number;
  readonly threshold?: number;
  readonly sampleIntervalMs?: number;
}

export function createDeviceMotionSource(
  options: DeviceMotionSourceOptions = {},
): DeviceMotionSource {
  const {
    accelerometer = Accelerometer,
    nowMs = () => Date.now(),
    threshold = MOTION_STDDEV_THRESHOLD,
    sampleIntervalMs = MOTION_SAMPLE_INTERVAL_MS,
  } = options;

  const listeners = new Set<(active: boolean) => void>();
  let subscription: { remove(): void } | null = null;
  /** `start()`가 걸려 있는가. 비동기 가용성 확인이 끝나기 전에 `stop()`이 오면 이 값이 막는다. */
  let running = false;
  let window: MotionWindow = EMPTY_MOTION_WINDOW;
  let active = false;

  function notify(next: boolean): void {
    if (next === active) {
      return;
    }
    active = next;
    for (const listener of [...listeners]) {
      listener(next);
    }
  }

  function handleMeasurement(measurement: { x: number; y: number; z: number }): void {
    window = pushSample(window, { ...measurement, atMs: nowMs() });
    notify(isHandlingActive(window, threshold));
  }

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      void accelerometer.isAvailableAsync().then((availableOnDevice) => {
        // 가용성 확인이 끝나기 전에 stop()이 왔을 수 있다. 그때 구독을 걸면 아무도 해제하지
        // 않는 리스너가 남아 일시정지 중에도 센서가 계속 돈다.
        if (!running || !availableOnDevice || subscription !== null) {
          return;
        }
        accelerometer.setUpdateInterval(sampleIntervalMs);
        subscription = accelerometer.addListener(handleMeasurement);
      });
    },

    stop(): void {
      running = false;
      subscription?.remove();
      subscription = null;
      // 창을 비우는 것이 중요하다 — 재개 시 정지 전 표본과 재개 후 표본 사이에는 임의 길이의
      // 공백이 있어서, 둘을 한 창에 섞으면 실제로는 없었던 움직임이 편차로 잡힌다.
      window = EMPTY_MOTION_WINDOW;
      // 열려 있던 조작 구간을 닫는다. 이걸 빠뜨리면 웹의 `DEVICE` 원신호가 `true`로 굳어
      // 재개 직후 곧바로 비집중으로 잘못 진입한다.
      notify(false);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
