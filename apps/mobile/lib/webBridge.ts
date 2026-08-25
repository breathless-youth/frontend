import type { SubmitSessionMessage, ToNativeMessage, ToWebMessage } from "@focusmakers/types";

/**
 * 웹이 설치하는 전역 수신 함수 이름 — 웹 쪽 `NATIVE_MESSAGE_ENTRY`와 **같은 값이어야 한다.**
 * 한쪽만 바꾸면 메시지가 조용히 사라진다(예외도 나지 않는다).
 */
const NATIVE_MESSAGE_ENTRY = "__focusonNativeMessage";

/**
 * WebView 브리지의 네이티브 쪽 끝(세션 상태 모델 스펙 §10).
 *
 * 웹 쪽(`apps/web/src/lib/bridge.ts`)과 **대칭**이다 —
 * 한쪽 유니온을 고치면 반드시 다른 쪽도 고친다. 알 수 없는 메시지를 `null`로 흘리는 이유도
 * 같다: 웹 번들이 앱보다 앞설 수 있고, 모르는 메시지에 죽으면 세션이 멈춘다.
 */
export function parseToNativeMessage(raw: string): ToNativeMessage | null {
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
  switch (record.type) {
    case "session-ready":
      return { type: "session-ready", atMs: record.atMs };
    case "start-session":
      return { type: "start-session", atMs: record.atMs };
    case "navigate-home":
      return { type: "navigate-home", atMs: record.atMs };
    case "open-settings":
      return { type: "open-settings", atMs: record.atMs };
    case "request-camera-permission":
      return { type: "request-camera-permission", atMs: record.atMs };
    case "share":
      if (typeof record.text !== "string") {
        return null;
      }
      return { type: "share", text: record.text, atMs: record.atMs };
    case "navigate-tab":
      // 목적지가 계약에 없는 값이면 통째로 버린다 — 모르는 경로로 navigate하면 죽거나
      // 엉뚱한 화면이 뜬다. 유니온이 넓어지면 여기 검사도 함께 넓힌다.
      if (record.tab !== "records") {
        return null;
      }
      return { type: "navigate-tab", tab: record.tab, atMs: record.atMs };
    case "set-tab-bar":
      // `visible`이 boolean이 아니면 통째로 버린다 — 기본값(보임)이 유지되는 편이 안전하다.
      // 여기서 truthy 판정으로 넘기면 오타 하나에 탭 바가 사라져 이동 수단이 없어진다.
      if (typeof record.visible !== "boolean") {
        return null;
      }
      return { type: "set-tab-bar", visible: record.visible, atMs: record.atMs };
    case "set-back-gesture":
      // `enabled`가 boolean이 아니면 통째로 버린다 — 기본값(켜짐)이 유지되는 편이 안전하다.
      // 여기서 truthy 판정으로 넘기면 오타 하나에 문의하기 스와이프 복귀가 사라진다.
      if (typeof record.enabled !== "boolean") {
        return null;
      }
      return { type: "set-back-gesture", enabled: record.enabled, atMs: record.atMs };
    case "set-back-lock":
      // `locked`가 boolean이 아니면 통째로 버린다 — 기본값(풀림)이 유지되는 편이 안전하다.
      // truthy 판정으로 넘기면 오타 하나에 뒤로가기가 영구적으로 잠긴다.
      if (typeof record.locked !== "boolean") {
        return null;
      }
      return { type: "set-back-lock", locked: record.locked, atMs: record.atMs };
    case "set-orientation":
      // `unlocked`가 boolean이 아니면 통째로 버린다 — 기본값(세로 잠금)이 유지되는 편이 안전하다.
      if (typeof record.unlocked !== "boolean") {
        return null;
      }
      return { type: "set-orientation", unlocked: record.unlocked, atMs: record.atMs };
    case "request-camera-gate":
      return { type: "request-camera-gate", atMs: record.atMs };
    case "motion-sensor":
      // `enabled`가 boolean이 아니면 통째로 버린다 — 애매한 값으로 센서 구독을 잘못
      // 켜고 끄는 것보다 기존 상태를 유지하는 편이 안전하다.
      if (typeof record.enabled !== "boolean") {
        return null;
      }
      return { type: "motion-sensor", enabled: record.enabled, atMs: record.atMs };
    case "submit-session":
      if (
        typeof record.requestId !== "string" ||
        typeof record.request !== "object" ||
        record.request === null
      ) {
        return null;
      }
      /**
       * `request`가 객체라는 것만 확인하고 필드는 검증하지 않는다 — **의도된 것이다.**
       * 이 값은 웹이 `buildSessionRequest`로 완성한 최종 요청 본문이고, 네이티브는 그것을
       * 고치지 않고 그대로 POST한다(루트 `CLAUDE.md` 아키텍처 경계: 네이티브 셸에 세션 로직을
       * 두지 않는다). 여기서 필드를 검증하면 계약이 두 곳에 중복되고, 웹이 계약을 넓힐 때마다
       * 네이티브가 조용히 요청을 떨어뜨리는 원인이 된다. 값의 유효성은 서버가 판정한다.
       */
      return {
        type: "submit-session",
        requestId: record.requestId,
        request: record.request as SubmitSessionMessage["request"],
        atMs: record.atMs,
      };
    default:
      return null;
  }
}

/** WebView `injectJavaScript`로 밀어 넣을 때 쓸 직렬화. */
export function serializeToWebMessage(message: ToWebMessage): string {
  return JSON.stringify(message);
}

/**
 * 네이티브 → 웹 메시지를 `injectJavaScript`에 넣을 스크립트로 만든다.
 *
 * 웹이 설치한 전역 함수를 호출한다 — 이름은 양쪽이 공유하는 계약이고 웹 쪽
 * (`apps/web/src/lib/bridge.ts`)의 `NATIVE_MESSAGE_ENTRY`와 같아야 한다.
 * `window.postMessage`를 쓰지 않는 이유는 그쪽 주석에 있다(플랫폼마다 메시지가
 * `window`/`document`로 갈려 한쪽에서 조용히 도착하지 않는다).
 *
 * 세부 두 가지가 중요하다.
 *
 * - **`JSON.stringify`를 한 번 더 건다.** 직렬화된 JSON을 JS 소스에 그대로 이어 붙이면 안의
 *   따옴표·개행이 스크립트를 깨뜨린다. 한 번 더 감싸면 안전한 문자열 리터럴이 된다.
 * - **전역이 있는지 먼저 본다.** 웹이 아직 로드되지 않았거나 세션 화면이 아니면 전역이 없고,
 *   그때 그냥 호출하면 WebView 안에서 예외가 난다.
 * - **`true;`로 끝낸다.** iOS에서 `injectJavaScript`의 마지막 표현식 값이 그대로 돌아오는데,
 *   객체를 반환하면 직렬화 경고가 난다.
 */
export function injectMessageScript(message: ToWebMessage): string {
  const payload = JSON.stringify(serializeToWebMessage(message));
  return `if (window.${NATIVE_MESSAGE_ENTRY}) { window.${NATIVE_MESSAGE_ENTRY}(${payload}); } true;`;
}
