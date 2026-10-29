import type { PushTarget } from "./pushNotificationRouting";

/**
 * 설정 탭을 드러낸 뒤 여는 통로
 *
 * iOS 26 이상의 홈에서는 설정 트리거가 `hidden`이라 expo-router가 그 라우트를 내비게이터에서 빼서 바로 이동할 수 없다.
 * 탭 레이아웃이 구독해서 설정 칸을 먼저 되살린 뒤 `then`을 부른다.
 * 구독하는 레이아웃이 없으면(Android) 가릴 칸도 없어서 바로 부른다.
 */
type RevealListener = (then: () => void) => void;
const listeners = new Set<RevealListener>();

export function revealSettingsTab(then: () => void): void {
  if (listeners.size === 0) {
    then();
    return;
  }
  listeners.forEach((listener) => listener(then));
}

/** 시스템 링크는 라우팅 직전에 멈출지 정해야 해서, 설정 칸을 가릴 수 있는 레이아웃이 떠 있는지 미리 본다. */
export function settingsMayBeHidden(): boolean {
  return listeners.size > 0;
}

export function subscribeSettingsReveal(listener: RevealListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 콜드 스타트 링크가 설정을 첫 화면으로 고른 표시
 *
 * 레이아웃은 홈에서 시작한다고 보고 설정 트리거를 숨기는데, 숨은 라우트가 첫 포커스가 되면 expo-router가 다른 탭을 연다.
 * 레이아웃이 첫 렌더에서 한 번 읽고 비워, 다시 마운트될 때는 홈에서 시작한다.
 */
let settingsIsInitialRoute = false;

export function markSettingsAsInitialRoute(): void {
  settingsIsInitialRoute = true;
}

export function takeInitialActiveRoute(): "index" | "settings" {
  const route = settingsIsInitialRoute ? "settings" : "index";
  settingsIsInitialRoute = false;
  return route;
}

/** 테스트 전용: 첫 화면 표시를 비운다. */
export function __resetInitialActiveRouteForTests(): void {
  settingsIsInitialRoute = false;
}

/** 알림 대상이 설정 탭인지. 탭 루트는 문자열로, 웹 경로는 탭 href로 온다(`pushTargetForRoute`). */
export function isSettingsTabTarget(target: PushTarget): boolean {
  return typeof target === "string"
    ? target === "/settings"
    : target.pathname === "/(tabs)/settings";
}
