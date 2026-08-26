import { emitTabReset, subscribeTabReset, tabResetTargetForBack } from "../tabReset";

/**
 * 뒤로가기 탭 초기화 신호 — 발신(`app/(tabs)/_layout.tsx`)과 수신(`RemoteWebViewHost`)이
 * React 트리에서 조상-자손이 아니라 모듈 스코프 통로를 쓴다(`tabBarVisibility`와 같은 구도).
 */

it("구독자에게 웹 경로를 전달하고 해제 후에는 전달하지 않는다", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeTabReset(listener);

  emitTabReset("/settings");
  expect(listener).toHaveBeenCalledWith("/settings");

  unsubscribe();
  emitTabReset("/records");
  expect(listener).toHaveBeenCalledTimes(1);
});

it("홈이 아닌 탭 라우트는 웹 경로를, 홈·모르는 라우트는 null을 돌려준다", () => {
  expect(tabResetTargetForBack("settings")).toBe("/settings");
  expect(tabResetTargetForBack("social")).toBe("/social");
  expect(tabResetTargetForBack("records")).toBe("/records");
  expect(tabResetTargetForBack("index")).toBeNull();
  expect(tabResetTargetForBack("unknown")).toBeNull();
});
