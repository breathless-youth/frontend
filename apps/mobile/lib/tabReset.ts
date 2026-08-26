/**
 * 시스템 뒤로가기로 탭을 떠날 때 그 탭 웹뷰를 탭 루트로 초기화하는 신호.
 *
 * Android에서 뒤로가기는 홈 탭으로 이동하는데, 떠난 탭의 웹뷰는 내부 히스토리를 유지한 채
 * 남아 재진입 시 이전 하위 페이지가 보인다. 발신부(`app/(tabs)/_layout.tsx`의 BackHandler)와
 * 수신부(`RemoteWebViewHost`)가 React 트리에서 조상-자손이 아니라서 `tabBarVisibility`와 같은
 * 모듈 스코프 통로를 쓴다.
 *
 * 탭바 탭 전환으로 떠난 경우는 초기화하지 않는다 — 문제가 된 경로는 뒤로가기뿐이고, iOS의
 * 탭 전환 동작(히스토리 유지)과 통일을 유지한다.
 */

/** 탭 라우트 이름 → 그 탭이 여는 웹 루트 경로. `app/(tabs)/*.tsx`의 `path` prop과 같아야 한다. */
const WEB_PATH_BY_TAB_ROUTE: Record<string, string> = {
  social: "/social",
  records: "/records",
  settings: "/settings",
};

/**
 * 뒤로가기 시 초기화할 웹 경로. 홈 탭(`index`)은 뒤로가기가 탭 이동이 아니라 앱 종료라
 * 초기화 대상이 아니고, 모르는 라우트는 건드리지 않는 편이 안전하다.
 */
export function tabResetTargetForBack(routeName: string): string | null {
  return WEB_PATH_BY_TAB_ROUTE[routeName] ?? null;
}

type Listener = (webPath: string) => void;
const listeners = new Set<Listener>();

export function emitTabReset(webPath: string): void {
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener(webPath);
  }
}

export function subscribeTabReset(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
