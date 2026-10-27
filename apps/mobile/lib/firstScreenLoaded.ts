let loaded = false;
const listeners = new Set<() => void>();

/**
 * 앱 프로세스에서 지금 보이는 웹뷰 화면이 처음 로드를 끝냈다는 신호
 *
 * 실행 직후 오버레이가 이 신호를 기다린다.
 * 푸시로 홈이 아닌 탭이 먼저 열릴 수 있어서 특정 화면이 아니라 보이는 화면을 기다린다.
 * 보이는지는 호출하는 `RemoteScreen`이 가린다.
 * 실패 화면도 사용자에게 보여야 해서 실패 로드도 켠다.
 */
export function markFirstScreenLoaded(): void {
  if (loaded) return;
  loaded = true;
  // 순회 중 구독 해제가 일어나도 안전하게 복사본을 돈다.
  for (const listener of [...listeners]) listener();
  listeners.clear();
}

/**
 * 첫 로드 신호 구독
 *
 * 이미 켜졌으면 listener를 바로 불러 오버레이가 첫 로드보다 늦게 마운트돼도 놓치지 않는다.
 */
export function onFirstScreenLoaded(listener: () => void): () => void {
  if (loaded) {
    listener();
    return () => undefined;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetFirstScreenLoadedForTests(): void {
  loaded = false;
  listeners.clear();
}
