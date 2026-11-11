type RewardSession = { startedAt: string; submissionStartedAt?: string };

/**
 * 공부 끝 보상을 물을 시작 시각
 *
 * 서버는 세션 제출에 실은 시작 시각으로 그 제출의 보상을 찾는다.
 * 결과에 세션이 여러 개 오는 것은 자정을 넘겨 쪼개진 조각이고, 조각들은 같은 `submissionStartedAt`을 나눠 가진다.
 * 그 값을 싣지 않는 응답이면 첫 조각의 시작이 곧 제출의 시작이라 가장 이른 시작 시각을 쓴다.
 */
export function rewardStartedAt(sessions: readonly [RewardSession, ...RewardSession[]]): string {
  const submitted = sessions.find((session) => session.submissionStartedAt !== undefined);
  if (submitted?.submissionStartedAt !== undefined) {
    return submitted.submissionStartedAt;
  }
  return sessions.reduce((earliest, session) =>
    Date.parse(session.startedAt) < Date.parse(earliest.startedAt) ? session : earliest,
  ).startedAt;
}
