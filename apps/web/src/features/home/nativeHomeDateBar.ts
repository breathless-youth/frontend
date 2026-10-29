import type { HomeMenuAction } from "@focusmakers/types";
import { useEffect, useEffectEvent } from "react";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";

import { homeDateAccessibilityLabel, homeDateChipLabel, homeDateKeys } from "./homeDates";

// 앱 안 이동은 URL에서 쿼리를 지우므로 처음 읽은 값을 보관한다.
// 표시는 바이너리와 OS 버전마다 고정이다.
function readNativeDateBarFlag(): boolean {
  return new URLSearchParams(window.location.search).get("nativeDateBar") === "1";
}

let nativeDateBarCache: boolean | null = readNativeDateBarFlag();

/**
 * 앱이 홈 날짜 줄을 웹뷰 바깥에 직접 그리는지
 *
 * 그리는 앱이 웹뷰 URL에 `nativeDateBar=1`을 붙인다.
 * 원격 웹은 날짜 줄을 그리지 못하는 이전 앱과 iOS 26 아래에도 바로 배포되므로 표시가 없으면 웹이 그린다.
 */
export function hasNativeDateBar(): boolean {
  nativeDateBarCache ??= readNativeDateBarFlag();
  return nativeDateBarCache;
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetNativeDateBarForTests(): void {
  nativeDateBarCache = null;
}

/**
 * 앱이 그리는 홈 날짜 줄 연결
 *
 * 날짜 목록과 글자는 웹이 정해 `set-home-date-bar`로 넘기고 앱은 그대로 그린다.
 * 앱에서 누른 날짜는 목록 안의 날짜일 때만 웹 날짜 줄과 같은 `onSelect`로 넘긴다.
 * 홈이 내려가면 빈 목록을 보내 다른 화면 위에 날짜 줄이 남지 않게 한다.
 */
export function useNativeHomeDateBar({
  todayKey,
  selectedKey,
  onSelect,
  onMenuAction,
}: {
  todayKey: string;
  selectedKey: string;
  onSelect: (dateKey: string) => void;
  onMenuAction?: (action: HomeMenuAction) => void;
}): void {
  const enabled = hasNativeDateBar();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    postToNative({
      type: "set-home-date-bar",
      dates: homeDateKeys(todayKey).map((key) => ({
        key,
        label: homeDateChipLabel(key),
        accessibilityLabel: homeDateAccessibilityLabel(key, todayKey),
      })),
      selectedKey,
      todayKey,
      atMs: Date.now(),
    });
  }, [enabled, todayKey, selectedKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return () => {
      postToNative({
        type: "set-home-date-bar",
        dates: [],
        selectedKey: "",
        todayKey: "",
        atMs: Date.now(),
      });
    };
  }, [enabled]);

  const onMessage = useEffectEvent((dateKey: string) => {
    if (homeDateKeys(todayKey).includes(dateKey)) {
      onSelect(dateKey);
    }
  });
  const onMenu = useEffectEvent((action: HomeMenuAction) => onMenuAction?.(action));

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return subscribeToNativeMessages((message) => {
      if (message.type === "home-date-selected") {
        onMessage(message.dateKey);
      } else if (message.type === "home-menu-action") {
        onMenu(message.action);
      }
    });
  }, [enabled]);
}
