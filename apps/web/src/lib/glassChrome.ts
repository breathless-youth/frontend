import type { GLASS_CONTROLS_BUTTON_STYLE, InlineControl } from "@focusmakers/types";
import { useEffect } from "react";

import { isNativeBridgeAvailable, subscribeToNativeMessages } from "./bridge";

// 앱 안 이동은 URL에서 쿼리가 빠지므로 모듈을 읽는 시점에 한 번 판정해 보관한다(`nativeTabBar.ts`와 같은 이유).
function readGlassFlags(): { version: number; controls: Set<string> } {
  const query = new URLSearchParams(window.location.search);
  const version = Number(query.get("glassChrome"));
  return {
    version: Number.isInteger(version) && version >= 1 ? version : 0,
    controls: new Set(query.get("glassControls")?.split(",")),
  };
}

let glassFlagsCache: { version: number; controls: Set<string> } | null = readGlassFlags();

/**
 * 앱이 그려 주는 고정 요소 모양의 버전
 *
 * iOS 26 이상이면서 `web-glass` 모듈이 든 앱만 웹뷰 URL에 `glassChrome`을 붙인다(`remoteQueryParams.ts`).
 * 원격 웹은 표시를 모르는 구버전 앱에도 바로 배포되므로 표시가 없으면 0이고 웹이 직접 그린다.
 * 같은 URL을 브라우저로 열 수도 있어 브리지가 없으면 0이다.
 */
export function glassChromeVersion(): number {
  glassFlagsCache ??= readGlassFlags();
  return isNativeBridgeAvailable() ? glassFlagsCache.version : 0;
}

/** 앱이 고정 요소와 본문 부품을 네이티브 glass로 그려 주는지 */
export function hasGlassChrome(): boolean {
  return glassChromeVersion() >= 1;
}

/**
 * 앱이 이 종류의 본문 부품이나 버튼 모양 표시를 그리는지
 *
 * 앱이 모르는 종류를 보내면 웹 원본은 숨었는데 앱은 그리지 않아서, 목록에 없는 종류는 웹 원본을 그대로 둔다.
 */
export function supportsInlineKind(
  kind: InlineControl["kind"] | typeof GLASS_CONTROLS_BUTTON_STYLE,
): boolean {
  glassFlagsCache ??= readGlassFlags();
  return glassFlagsCache.controls.has(kind);
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetGlassChromeForTests(): void {
  glassFlagsCache = null;
}

const pressHandlers = new Map<string, (value: number) => void>();

/**
 * 네이티브 부품의 누름을 받을 처리기 등록
 *
 * 같은 id는 마지막 등록이 받는다.
 * 화면 전환 중에는 새 화면이 먼저 등록하고 이전 화면이 나중에 해제할 수 있어서, 해제는 자기 등록일 때만 푼다.
 */
export function registerPressHandler(id: string, handler: (value: number) => void): () => void {
  pressHandlers.set(id, handler);
  return () => {
    if (pressHandlers.get(id) === handler) {
      pressHandlers.delete(id);
    }
  };
}

/**
 * 앱이 보낸 `native-control-press`를 등록된 처리기에 넘긴다.
 *
 * `App`에서 한 번만 마운트한다.
 * 이미 사라진 부품의 누름은 받을 처리기가 없어 버린다.
 */
export function useNativeControlPressRelay(): void {
  useEffect(
    () =>
      subscribeToNativeMessages((message) => {
        if (message.type === "native-control-press") {
          pressHandlers.get(message.id)?.(message.value);
        }
      }),
    [],
  );
}
