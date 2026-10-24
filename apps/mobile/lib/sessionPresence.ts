/**
 * 세션 화면이 떠 있는지 알리는 통로
 *
 * 업데이트 알림창처럼 세션 중에 끼어들면 안 되는 일을 세션이 끝난 뒤로 미루는 데 쓴다.
 * 싱글룸은 세션 화면(`app/room/[id]`)이 마운트에서 `markSessionOpen("single")`을 부르고 언마운트에서 반환값을 부른다.
 * 웹의 `navigate-home` 메시지 대신 화면 수명을 쓰는 이유는 하드웨어 뒤로가기처럼 메시지 없이 닫히는 경우도 잡기 위해서다.
 * 소셜룸은 탭 웹뷰 안의 웹 화면이라, 세션이 보내는 `set-back-lock` 잠금 동안 `RemoteScreen`이 `markSessionOpen("social")`로 표시한다.
 */

let openCount = 0;
const waiters = new Set<() => void>();
const nextScreenWaiters = new Set<() => void>();

/**
 * 세션 화면이 떴다는 표시
 *
 * 반환값을 부르면 닫혔다고 표시하고 기다리던 일을 실행한다.
 * 다음 세션 화면을 기다리는 일은 싱글룸 화면만 가져간다.
 * 그 일은 싱글룸 화면을 push한 쪽이 등록하므로, 그 사이 열린 소셜룸 세션이 가져가면 엉뚱한 화면이 닫힐 때 실행된다.
 */
export function markSessionOpen(kind: "single" | "social"): () => void {
  openCount += 1;
  const onClose = kind === "single" ? [...nextScreenWaiters] : [];
  if (kind === "single") nextScreenWaiters.clear();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    for (const run of onClose) run();
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

/**
 * 다음에 뜨는 싱글룸 세션 화면이 닫힐 때 실행
 *
 * 다른 세션 화면이 남아 있어도 기다리지 않고 그 화면 하나가 닫히면 실행한다.
 * 소셜룸 세션은 열리고 닫혀도 이 일을 가져가지 않는다.
 * 반환값은 화면이 아직 뜨지 않았을 때만 등록을 거두고 true를 돌려준다.
 */
export function runAfterNextSessionScreen(run: () => void): () => boolean {
  nextScreenWaiters.add(run);
  return () => nextScreenWaiters.delete(run);
}

export function __resetSessionPresenceForTests(): void {
  openCount = 0;
  waiters.clear();
  nextScreenWaiters.clear();
}
