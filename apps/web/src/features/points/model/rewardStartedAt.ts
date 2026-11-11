/**
 * 공부 끝 보상을 물을 세션 시작 시각
 *
 * 보상 조회는 세션 하나의 시작 시각을 받는데, 결과 화면에는 이어 공부한 세션이 여러 개 묶여 올 수 있다.
 * 백엔드가 묶음의 기준을 정해 주기 전까지는 묶음 전체가 들어가는 하루를 고르도록 가장 이른 시작 시각을 보낸다.
 * 이 기준을 바꿀 때는 이 함수만 고친다.
 */
export function rewardStartedAt(
  sessions: readonly [{ startedAt: string }, ...{ startedAt: string }[]],
): string {
  return sessions.reduce((earliest, session) =>
    Date.parse(session.startedAt) < Date.parse(earliest.startedAt) ? session : earliest,
  ).startedAt;
}
