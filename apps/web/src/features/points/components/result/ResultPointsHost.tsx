import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../../gateway/PointsGatewayContext";
import { PointsRouteGate } from "../../PointsRouteGate";
import { pointsSearch } from "../../pointsSearch";
import { ResultPointsCard } from "../../screens/ResultPointsCard";
import { usePointsAccess } from "../../usePointsAccess";

/**
 * 결과 화면에 붙는 포인트 카드
 *
 * 비회원도 공부하면 포인트가 쌓이므로 신원이 확인되면 회원이 아니어도 입구를 다른 화면 속 조각(`embedded`)으로 거쳐 카드를 그린다.
 * 보상 조회가 실패하면 서버의 회원 전용 거절이어도 카드를 그리지 않는다.
 */
export function ResultPointsHost({ startedAt }: { startedAt: string }) {
  const { status } = usePointsAccess();
  if (status !== "member" && status !== "guest") {
    return null;
  }
  return (
    <PointsRouteGate embedded>
      <RewardCard startedAt={startedAt} />
    </PointsRouteGate>
  );
}

function RewardCard({ startedAt }: { startedAt: string }) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const location = useLocation();
  const navigate = useNavigate();
  const reward = useQuery({
    queryKey: [...pointsKeys.user(userId), "sessionReward", startedAt],
    queryFn: () => gateway.getSessionReward(startedAt),
    staleTime: Infinity,
  });
  return (
    <ResultPointsCard
      reward={reward.data ?? null}
      onOpenShop={() =>
        slideNavigate("forward", () =>
          navigate({ pathname: "/points", search: pointsSearch(location.search) }),
        )
      }
    />
  );
}
