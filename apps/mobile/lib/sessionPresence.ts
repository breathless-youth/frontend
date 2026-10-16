/**
 * 세션 화면이 떠 있는지 알리는 통로
 *
 * 업데이트 알림창처럼 세션 중에 끼어들면 안 되는 일을 세션이 끝난 뒤로 미루는 데 쓴다.
 * 세션 화면이 마운트에서 `markSessionOpen()`을 부르고 언마운트에서 반환값을 부른다.
 * 웹의 `navigate-home` 메시지 대신 화면 수명을 쓰는 이유는 하드웨어 뒤로가기처럼 메시지 없이 닫히는 경우도 잡기 위해서다.
 */

let openCount = 0;
const waiters = new Set<() => void>();

/**
 * 세션 화면이 떴다는 표시
 *
 * 반환값을 부르면 닫혔다고 표시하고 기다리던 일을 실행한다.
 */
export function markSessionOpen(): () => void {
  openCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    if (openCount > 0) return;
    const pending = [...waiters];
    waiters.clear();
    for (const run of pending) run();
  };
}

/**
 * 세션이 끝난 뒤 실행
 *
 * 세션 화면이 없으면 바로 실행하고, 떠 있으면 마지막 세션 화면이 닫힐 때 실행한다.
 */
export function runAfterSession(run: () => void): void {
  if (openCount === 0) {
    run();
    return;
  }
  waiters.add(run);
}

export function __resetSessionPresenceForTests(): void {
  openCount = 0;
  waiters.clear();
}
