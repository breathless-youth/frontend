import type { InlineControl } from "@focusmakers/types";
import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { __resetGlassChromeForTests, useNativeControlPressRelay } from "@/lib/glassChrome";
import { __resetNativeControlsForTests } from "@/lib/nativeControls";

/**
 * `glassChrome=1` 앱으로 열린 문서
 *
 * 앱의 누름을 받도록 `App`처럼 중계를 마운트하고 앱으로 보낸 메시지를 받는 스텁을 돌려준다.
 * `controls`는 앱이 그린다고 알리는 본문 부품 종류다.
 */
export function enterGlassChrome(
  path: string,
  controls = "segment,switch,button",
): ReturnType<typeof vi.fn> {
  window.history.replaceState(null, "", `${path}?glassChrome=1&glassControls=${controls}`);
  const postMessage = vi.fn();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  __resetGlassChromeForTests();
  renderHook(() => {
    useNativeControlPressRelay();
  });
  return postMessage;
}

/**
 * 부품 측정을 바로 끝내는 스텁
 *
 * jsdom은 크기가 0이라 그대로 두면 측정에서 모두 빠지고, 측정은 다음 프레임에 일어난다.
 */
export function measureControlsNow(): void {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(20, 100, 44, 44),
  );
}

/** 앱으로 마지막에 보낸 본문 부품 목록 */
export function lastInlineControls(postMessage: ReturnType<typeof vi.fn>): InlineControl[] {
  const sent = postMessage.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as { type: string; controls?: InlineControl[] })
    .filter((message) => message.type === "set-inline-controls")
    .at(-1);
  return sent?.controls ?? [];
}

/** 앱이 부품을 눌렀다고 알린다. */
export function pressNative(id: string, value: number): void {
  act(() => {
    (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
      JSON.stringify({ type: "native-control-press", id, value, atMs: 1 }),
    );
  });
}

/**
 * 스텁과 판정 캐시 정리
 *
 * 언마운트가 보내는 마지막 메시지까지 끝난 뒤에 불러야 다음 테스트로 등록이 새지 않는다.
 */
export function resetGlassChrome(): void {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetGlassChromeForTests();
  __resetNativeControlsForTests();
}
