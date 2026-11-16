import type { EarnToday } from "../types";

/**
 * 포인트 받기 탭에서 지금 받을 보상이 남았는지
 *
 * 받기 탭이 받기 버튼을 그리는 조건과 같게 출석, 채운 하루 목표, 받지 않은 메달만 본다.
 * 시작 미션 보상은 홈 띠에서 받아서 받기 탭에 점을 띄우지 않는다.
 */
export function hasClaimableReward(earn: EarnToday): boolean {
  return (
    !earn.attendance.claimed ||
    (earn.dailyGoal.achieved && !earn.dailyGoal.claimed) ||
    earn.medals.length > 0
  );
}
