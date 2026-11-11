import { useQuery } from "@tanstack/react-query";

import { isPointsEnabled } from "@/lib/pointsCapability";
import { balanceQuery } from "@/lib/pointsQueries";

import { appPointsGateway } from "./appPointsGateway";

/**
 * 포인트 화면 밖(홈·설정)에서 쓰는 잔액
 *
 * 플래그가 꺼져 있으면 요청하지 않고 undefined다.
 * 받기 전이나 실패했을 때도 undefined라 호출한 쪽이 줄표나 생략을 고른다.
 */
export function usePointsBalance(userId: number | null): number | undefined {
  const enabled = isPointsEnabled() && userId !== null;
  const balance = useQuery({ ...balanceQuery(appPointsGateway, userId ?? 0), enabled });
  return enabled ? balance.data : undefined;
}
