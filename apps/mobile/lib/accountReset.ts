/**
 * 로그아웃이나 탈퇴로 계정이 바뀌었을 때 모든 웹뷰에 알리는 신호
 *
 * 탭 웹뷰마다 이전 계정의 조회 캐시와 화면을 들고 있어서, 받은 호스트가 문서를 탭 첫 화면으로 새로 띄운다.
 * 발신부(브리지 핸들러)와 수신부(RemoteWebViewHost)가 React 트리에서 조상과 자손이 아니라 sessionClosed와 같은 모듈 스코프 통로를 쓴다.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function emitAccountReset(): void {
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeAccountReset(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
