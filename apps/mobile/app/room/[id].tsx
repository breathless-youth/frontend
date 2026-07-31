import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";

import type { ToNativeMessage } from "@focuson/types";

import { RemoteWebViewHost } from "../../components/RemoteWebViewHost";
import { openAppSettings } from "../../lib/cameraPermission";
import { runCameraPermissionGate } from "../../lib/cameraPermissionGate";

/**
 * 싱글룸 세션(S3-1~S3-8) — 화면 구현체는 `apps/web`이고 여기서는 `RemoteWebViewHost`로
 * 원격 URL을 로드한다(전 화면 원격 웹뷰 셸, BY-333). 타이머·상태 판정·이벤트 누적은 전부
 * 웹이 소유한다 — **여기에 세션 로직을 넣지 말 것.**
 *
 * 이 화면이 브리지 3종(start-session·exit-session·open-settings) 수신의 첫 실사용처다.
 * start-session·open-settings는 실제로는 홈·설정이 웹뷰로 이관되는 다음 단계에서나 이
 * 화면 밖에서 발신되지만, 수신 배선 자체는 호스트 어디서나 같은 규칙으로 동작해야 하므로
 * 여기서 전부 처리한다.
 */
function handleBridgeMessage(message: ToNativeMessage): void {
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
        console.warn("[room] 집중 시작(start-session) 처리 실패", error);
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

export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const onBridgeMessage = useCallback((message: ToNativeMessage) => {
    handleBridgeMessage(message);
  }, []);

  return (
    <>
      {/* 세션 화면은 시스템 테마와 무관하게 항상 다크다 — 상태 바 아이콘도 밝게 고정한다
          (라이트 모드 기기에서 `style="auto"`가 어두운 아이콘을 골라 배경에 묻힌다). */}
      <StatusBar style="light" />
      <RemoteWebViewHost
        testID="session-webview"
        path={`/room/${id ?? "1"}`}
        backgroundColor="#0B0F14"
        onBridgeMessage={onBridgeMessage}
      />
    </>
  );
}
