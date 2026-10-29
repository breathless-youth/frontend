// 재생 버튼 탭의 라우트 key를 탭 레이아웃에 넘기는 통로. 레이아웃은 내비게이터 자신이라 첫 상태를 받을 이벤트가 없다.
let startKey: string | undefined;
const listeners = new Set<() => void>();

export function publishStartKey(key: string): void {
  startKey = key;
  listeners.forEach((listener) => listener());
}

export function subscribeStartKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStartKey(): string | undefined {
  return startKey;
}

/** 테스트 전용: 모듈 스코프 상태를 비운다. */
export function __resetStartKeyForTests(): void {
  startKey = undefined;
  listeners.clear();
}
