import type { StudySessionResponse, ToNativeMessage, ToWebMessage } from "@focusmakers/types";

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
 * `postToNative`가 필요해져 탭 공용 위치로 승격했다(`lib/userId.ts`와 같은 패턴). 옛 파일은
 * import하는 소스가 없어 삭제했고, 그 테스트는 이 모듈을 가리키도록 옮겼다.
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
  try {
    nativeBridge()?.postMessage(JSON.stringify(message));
  } catch {
    /**
     * **존재 검사를 통과해도 호출이 실패할 수 있다.** iOS에서 `ReactNativeWebView.postMessage`는
     * 껍데기고, 그 안이 매번 `window.webkit.messageHandlers`를 다시 찾는다. 웹뷰가 파괴되는
     * 중(세션 모달을 네이티브가 닫는 순간, 회전 직후)에는 껍데기만 남고 `window.webkit`이
     * 사라져 `TypeError`가 난다 — 2026-08-05 실기기 iOS 18.7에서 실측
     * (Sentry `FOCUSMAKERS-WEB-1`: 언마운트 cleanup, `FOCUSMAKERS-WEB-2`: `set-tab-bar`).
     *
     * 받을 네이티브가 이미 없는 상태라 어차피 전달할 방법이 없다. 이 파일 상단이 선언한
     * "네이티브가 없으면 조용히 아무것도 안 한다"는 계약대로 삼킨다.
     *
     * 유일하게 응답이 필요한 `submit-session`은 이 실패를 타임아웃으로 감지한다
     * (`features/study-session/bridge/submitViaNative.ts`) — 조용히 유실되지 않는다.
     */
  }
}

/**
 * 네이티브가 `injectJavaScript`로 호출하는 전역 함수 이름 — **양쪽이 공유하는 계약이다**
 * (네이티브 쪽은 `apps/mobile/lib/webBridge.ts`의 `injectMessageScript`가 만든다).
 *
 * `window.postMessage` + `addEventListener("message")`를 쓰지 않는 이유: react-native-webview는
 * 플랫폼에 따라 메시지가 `window`에 오는지 `document`에 오는지가 갈려서, 한쪽에만 리스너를 달면
 * 다른 플랫폼에서 조용히 아무것도 도착하지 않는다. 전역 함수는 어느 플랫폼에서도 같은 한 곳이다.
 */
export const NATIVE_MESSAGE_ENTRY = "__focusonNativeMessage";

type NativeMessageReceiver = (raw: string) => void;

const handlers = new Set<(message: ToWebMessage) => void>();

/**
 * 네이티브에서 오는 메시지를 구독한다. 반환값을 부르면 해제된다.
 *
 * **브라우저 단독 모드에서도 안전하다** — 전역만 설치되고 아무도 호출하지 않을 뿐이다.
 * 파싱에 실패한 메시지(모르는 `type`, 깨진 JSON)는 조용히 버린다: 앱과 웹의 버전이 어긋날 수
 * 있고, 모르는 메시지에 죽으면 세션 전체가 멈춘다(이 파일 상단 주석).
 */
export function subscribeToNativeMessages(handler: (message: ToWebMessage) => void): () => void {
  handlers.add(handler);
  const target = globalThis as unknown as Record<string, NativeMessageReceiver | undefined>;
  target[NATIVE_MESSAGE_ENTRY] ??= (raw: string) => {
    const message = parseToWebMessage(raw);
    if (message === null) {
      return;
    }
    // 복사본을 돌려 순회 중 해제가 일어나도 안전하게 한다.
    for (const each of [...handlers]) {
      each(message);
    }
  };
  return () => {
    handlers.delete(handler);
  };
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
  if (record.type === "ping" && typeof record.id === "number") {
    return { type: "ping", id: record.id, atMs: record.atMs };
  }
  if (record.type === "camera-permission" && typeof record.granted === "boolean") {
    return { type: "camera-permission", granted: record.granted, atMs: record.atMs };
  }
  if (record.type === "submit-result" && typeof record.requestId === "string") {
    if (record.ok === true && Array.isArray(record.sessions)) {
      /**
       * 배열이라는 것만 확인하고 원소는 검증하지 않는다 — 이 값은 백엔드 응답을 네이티브가
       * JSON으로 읽어 그대로 실어 보낸 것이고, 원소 모양은 `StudySessionResponse` 계약이
       * 이미 정한다. 직접 `fetch`하는 경로도 `as StudySessionResponse[]`로 같은 신뢰
       * 경계를 쓰므로, 여기서만 깊게 검증하면 계약이 두 곳에 중복된다.
       */
      return {
        type: "submit-result",
        requestId: record.requestId,
        ok: true,
        sessions: record.sessions as StudySessionResponse[],
        atMs: record.atMs,
      };
    }
    if (record.ok === false && typeof record.message === "string") {
      return {
        type: "submit-result",
        requestId: record.requestId,
        ok: false,
        message: record.message,
        ...(Number.isFinite(record.status) ? { status: record.status as number } : {}),
        atMs: record.atMs,
      };
    }
  }
  return null;
}
