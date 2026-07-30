import type { ToNativeMessage, ToWebMessage } from "@focuson/types";

/**
 * WebView 브리지의 웹 쪽 끝(세션 상태 모델 스펙 §10).
 *
 * **브라우저 단독 모드에서는 브리지가 없다.** `apps/web`은 독립 서비스로도 배포되므로
 * (ADR 0001) 여기 있는 함수는 전부 "네이티브가 없으면 조용히 아무것도 안 함"이어야 한다 —
 * 던지면 브라우저에서 세션이 시작되지 않는다.
 *
 * 알 수 없는 메시지를 `null`로 흘려보내는 것도 같은 이유다. 앱 버전이 웹보다 앞설 수 있고
 * (번들 동봉이라 대체로 같이 가지만 하이브리드 갱신 여지가 있다), 모르는 메시지에 죽으면
 * 세션 전체가 멈춘다.
 *
 * 원래 `features/study-session/bridge/nativeBridge.ts`에 있었지만, 설정(S6) 화면도
 * `postToNative`가 필요해져 탭 공용 위치로 승격했다(`lib/userId.ts`와 같은 패턴). 옛 위치는
 * re-export로 남겨 기존 세션 코드가 깨지지 않게 한다.
 */

interface ReactNativeWebViewBridge {
  postMessage(message: string): void;
}

function nativeBridge(): ReactNativeWebViewBridge | null {
  const candidate = (globalThis as { ReactNativeWebView?: ReactNativeWebViewBridge })
    .ReactNativeWebView;
  return typeof candidate?.postMessage === "function" ? candidate : null;
}

export function isNativeBridgeAvailable(): boolean {
  return nativeBridge() !== null;
}

export function postToNative(message: ToNativeMessage): void {
  nativeBridge()?.postMessage(JSON.stringify(message));
}

export function parseToWebMessage(raw: string): ToWebMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.atMs !== "number") {
    return null;
  }

  if (record.type === "device-handling" && typeof record.active === "boolean") {
    return { type: "device-handling", active: record.active, atMs: record.atMs };
  }
  if (record.type === "app-state" && (record.state === "active" || record.state === "background")) {
    return { type: "app-state", state: record.state, atMs: record.atMs };
  }
  return null;
}
