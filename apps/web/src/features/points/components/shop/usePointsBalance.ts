import { useQuery } from "@tanstack/react-query";

import { isPointsEnabled } from "@/lib/pointsCapability";
import { balanceQuery } from "@/lib/pointsQueries";

import { appPointsGateway } from "../../gateway/appPointsGateway";
import { isMemberOnlyError } from "../../gateway/memberOnly";

/**
 * 포인트 화면 밖(홈·설정)에서 쓰는 잔액
 *
 * 플래그가 꺼져 있거나 사용자가 없으면 요청하지 않고 잔액은 undefined다.
 * 받기 전이나 실패했을 때도 undefined라 호출한 쪽이 줄표나 생략을 고른다.
 * 서버가 회원 전용이라고 거절하면 `memberOnly`가 참이라 얹힌 조각을 통째로 숨긴다.
 */
export function usePointsBalance(userId: number | null): {
  balance: number | undefined;
  memberOnly: boolean;
} {
  const enabled = isPointsEnabled() && userId !== null;
  const balance = useQuery({ ...balanceQuery(appPointsGateway(), userId ?? 0), enabled });
  return {
    balance: enabled ? balance.data : undefined,
    memberOnly: enabled && isMemberOnlyError(balance.error),
  };
}
