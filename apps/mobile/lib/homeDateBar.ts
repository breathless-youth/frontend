import type { HomeMenuAction, SetHomeDateBarMessage, ToWebMessage } from "@focusmakers/types";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * 앱이 홈 탭의 재생 버튼과 날짜 줄을 직접 그리는지
 *
 * iOS는 떨어진 재생 버튼과 탭 바 아래 액세서리 자리가 iOS 26부터 있어서 그 아래 버전은 웹이 둘 다 그린다.
 * Android는 커스텀 탭 바라 늘 앱이 그린다.
 */
export function rendersNativeHomeChrome(): boolean {
  if (Platform.OS === "android") {
    return true;
  }
  return Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;
}

/**
 * 홈 날짜 줄 내용과 홈 웹뷰로 가는 신호
 *
 * 내용은 홈 웹뷰 호스트가 받고 그리는 쪽은 탭 바라서 React 트리로 이어지지 않는다.
 * `tabBarVisibility`와 같은 이유로 모듈 스코프에 둔다.
 */
type DateBar = Pick<SetHomeDateBarMessage, "dates" | "selectedKey" | "todayKey">;
export type HomeChromeEvent = Extract<
  ToWebMessage,
  { type: "home-date-selected" | "home-menu-action" | "home-play-pressed" }
>;

let bar: DateBar | null = null;
const barListeners = new Set<() => void>();
const eventListeners = new Set<(event: HomeChromeEvent) => void>();

function setBar(next: DateBar | null): void {
  bar = next;
  for (const listener of [...barListeners]) {
    listener();
  }
}

/** 웹이 빈 목록을 보낼 수 없는 재로드·언마운트에서 앱이 직접 거둔다. */
export function clearHomeDateBar(): void {
  setBar(null);
}

/** 빈 목록이 오면 날짜 줄을 거둔다. */
export function setHomeDateBar(message: SetHomeDateBarMessage): void {
  setBar(message.dates.length === 0 ? null : message);
}

function subscribeBar(listener: () => void): () => void {
  barListeners.add(listener);
  return () => {
    barListeners.delete(listener);
  };
}

export function useHomeDateBar(): DateBar | null {
  return useSyncExternalStore(subscribeBar, () => bar);
}

export function subscribeHomeDateBarEvents(listener: (event: HomeChromeEvent) => void): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

function emit(event: HomeChromeEvent): void {
  for (const listener of [...eventListeners]) {
    listener(event);
  }
}

/**
 * 날짜 칩 누름
 *
 * 웹이 새 선택을 돌려보내기 전에 앱 쪽 선택을 먼저 바꿔 누른 칩이 바로 바뀌어 보이게 한다.
 */
export function selectHomeDate(dateKey: string): void {
  if (bar === null || bar.selectedKey === dateKey) {
    return;
  }
  setBar({ ...bar, selectedKey: dateKey });
  emit({ type: "home-date-selected", dateKey, atMs: Date.now() });
}

export function pressHomeMenu(action: HomeMenuAction): void {
  emit({ type: "home-menu-action", action, atMs: Date.now() });
}

/**
 * 탭 바 재생 버튼 누름
 *
 * 앱이 세션을 바로 열지 않고 홈 웹뷰에 알린다.
 * 웹이 남은 과목 기록 삭제와 옛 세션 마감까지 한 경로로 처리하기 때문이다.
 */
export function pressHomePlay(): void {
  emit({ type: "home-play-pressed", atMs: Date.now() });
}

/** 테스트 전용: 모듈 스코프 상태를 비운다. */
export function __resetHomeDateBarForTests(): void {
  bar = null;
  barListeners.clear();
  eventListeners.clear();
}
