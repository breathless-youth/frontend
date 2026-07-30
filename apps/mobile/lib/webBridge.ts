import type { ToNativeMessage, ToWebMessage } from "@focuson/types";

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
  if (record.type === "session-ready" && typeof record.atMs === "number") {
    return { type: "session-ready", atMs: record.atMs };
  }
  // TODO(BY-333): open-settings 수신 파싱 추가 — packages/types ToNativeMessage에 2026-07-30 추가됨
  return null;
}

/** WebView `injectJavaScript`로 밀어 넣을 때 쓸 직렬화. */
export function serializeToWebMessage(message: ToWebMessage): string {
  return JSON.stringify(message);
}
