import { router } from "expo-router";

import type { ToNativeMessage } from "@focuson/types";

import { openAppSettings } from "./cameraPermission";
import { runCameraPermissionGate } from "./cameraPermissionGate";

/**
 * 웹이 보낸 브리지 메시지(세션 상태 모델 스펙 §10)에 대한 네이티브 쪽 공통 반응.
 *
 * `RemoteWebViewHost`를 쓰는 화면(탭 3개 + 세션, BY-333) 전부가 같은 규칙으로 반응해야
 * 한다 — 어느 화면에서 메시지가 와도 동작이 갈리면 안 되므로 화면마다 복붙하지 않고
 * 한 곳에 모았다. 원래 `app/room/[id].tsx`에 있던 로직을 그대로 승격했다.
 */
export function handleBridgeMessage(message: ToNativeMessage): void {
  switch (message.type) {
    case "session-ready":
      // 기존 동작 유지 — 네이티브가 별도로 할 일은 아직 없다.
      break;
    case "start-session":
      void (async () => {
        const result = await runCameraPermissionGate();
        if (result === "show-denied-guide") {
          router.push("/permission-denied");
          return;
        }
        router.push("/room/1");
      })().catch((error: unknown) => {
        console.warn("[bridge] 집중 시작(start-session) 처리 실패", error);
      });
      break;
    case "exit-session":
      if (router.canGoBack()) {
        router.back();
      }
      break;
    case "open-settings":
      void openAppSettings();
      break;
  }
}
