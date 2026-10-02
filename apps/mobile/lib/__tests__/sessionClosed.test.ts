import { emitSessionClosed, subscribeSessionClosed } from "../sessionClosed";

/**
 * 세션 모달 종료 신호 — 발신(브리지 핸들러)과 수신(`RemoteWebViewHost`)이 React 트리에서
 * 조상-자손이 아니라 모듈 스코프 통로를 쓴다(`tabReset`과 같은 구도).
 */

it("구독자 전부에게 알리고 해제한 구독자에게는 알리지 않는다", () => {
  const first = jest.fn();
  const second = jest.fn();
  const unsubscribeFirst = subscribeSessionClosed(first);
  subscribeSessionClosed(second);

  emitSessionClosed();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);

  unsubscribeFirst();
  emitSessionClosed();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
});
