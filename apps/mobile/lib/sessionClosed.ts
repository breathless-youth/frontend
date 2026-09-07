/**
 * 세션 모달이 닫힐 때 탭 웹뷰들에 알리는 신호
 * 발신부(브리지 핸들러)와 수신부(RemoteWebViewHost)가 React 트리에서 조상-자손이 아니라 tabReset과 같은 모듈 스코프 통로를 쓴다.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function emitSessionClosed(): void {
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeSessionClosed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
