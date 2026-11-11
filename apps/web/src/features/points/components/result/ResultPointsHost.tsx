import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { useGroupAccess } from "@/features/login/useGroupAccess";
import { slideNavigate } from "@/lib/pageTransition";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../../gateway/PointsGatewayContext";
import { PointsRouteGate } from "../../PointsRouteGate";
import { pointsSearch } from "../../pointsSearch";
import { ResultPointsCard } from "../../screens/ResultPointsCard";

/**
 * 결과 화면에 붙는 포인트 카드
 *
 * 포인트 입구는 비회원에게 로그인 화면을 그리지만 결과 화면은 비회원도 보므로,
 * 로그인 판정이 끝난 회원일 때만 입구를 거친다.
 */
export function ResultPointsHost({ sessionIds }: { sessionIds: number[] }) {
  const access = useGroupAccess();
  if (access !== "ungated" && access !== "member") {
    return null;
  }
  return (
    <PointsRouteGate>
      <RewardCard sessionIds={sessionIds} />
    </PointsRouteGate>
  );
}

function RewardCard({ sessionIds }: { sessionIds: number[] }) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const location = useLocation();
  const navigate = useNavigate();
  const reward = useQuery({
    queryKey: [...pointsKeys.user(userId), "sessionReward", sessionIds],
    queryFn: () => gateway.getSessionReward(sessionIds),
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
