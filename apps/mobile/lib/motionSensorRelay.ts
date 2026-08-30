import { AppState } from "react-native";

import type { ToNativeMessage } from "@focusmakers/types";

import { createDeviceMotionSource, type DeviceMotionSource } from "./deviceMotionSource";
import type { BridgeReply } from "./nativeBridgeHandler";

/**
 * 공용 브리지 경로(소셜 탭·딥링크 join WebView)의 가속도 센서 릴레이.
 *
 * 싱글룸은 전용 화면(`app/room/[id].tsx`)이 화면 수명에 묶어 센서를 소유하지만, 소셜룸은
 * 탭 WebView 안 SPA 라우팅으로 진입해 묶을 화면 수명이 없다 — 그래서 모듈 수명 싱글턴이
 * 소유하고, 화면 cleanup이 못 잡는 정리는 AppState 가드가 맡는다: 백그라운드 진입 시 끄고,
 * 웹이 켜둔 상태였으면 복귀 시 다시 켠다. 복귀 재시작이 네이티브 몫인 이유는 웹 detector의
 * `start()`가 멱등이라 복귀 시 `motion-sensor: true`를 다시 보내지 않기 때문이다.
 */

type MotionSensorMessage = Extract<ToNativeMessage, { type: "motion-sensor" }>;

export interface MotionSensorRelay {
  handle(message: MotionSensorMessage, reply: BridgeReply): void;
}

/** 테스트 주입점. react-native `AppState`가 이 모양을 그대로 만족한다. */
export interface AppStateAdapter {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export function createMotionSensorRelay(
  source: DeviceMotionSource,
  appState: AppStateAdapter = AppState,
): MotionSensorRelay {
  let reply: BridgeReply | null = null;
  let enabledByWeb = false;
  let foreground = true;

  source.subscribe((active) => {
    reply?.({ type: "device-handling", active, atMs: Date.now() });
  });

  appState.addEventListener("change", (state) => {
    foreground = state === "active";
    if (foreground) {
      if (enabledByWeb) {
        source.start();
      }
      return;
    }
    // iOS의 inactive(앱 전환기·알림 센터)도 끈다 — 그 상태의 움직임은 공부 중 조작이 아니고,
    // active 복귀에서 어차피 다시 켠다.
    source.stop();
  });

  return {
    handle(message, nextReply) {
      reply = nextReply;
      enabledByWeb = message.enabled;
      // 백그라운드 중 지연 도착한 켜기 요청은 바로 켜지 않는다
      // — 플래그만 남겨 두면 active 복귀 분기가 켠다.
      // 그 상태의 움직임은 공부 중 조작이 아니다.
      if (message.enabled && foreground) {
        source.start();
      } else if (!message.enabled) {
        source.stop();
      }
    },
  };
}

let defaultRelay: MotionSensorRelay | null = null;

/** import 시점에 센서 어댑터가 만들어지지 않게 지연 생성한다. */
export function getMotionSensorRelay(): MotionSensorRelay {
  defaultRelay ??= createMotionSensorRelay(createDeviceMotionSource());
  return defaultRelay;
}
