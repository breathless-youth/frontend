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
 * 포인트 입구는 비회원에게 로그인 화면을 그리지만 결과 화면은 비회원도 보므로,
 * 회원으로 확인된 때만 입구를 거치고 그 밖에는 카드를 그리지 않는다.
 */
export function ResultPointsHost({ startedAt }: { startedAt: string }) {
  if (usePointsAccess().status !== "member") {
    return null;
  }
  return (
    <PointsRouteGate>
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
