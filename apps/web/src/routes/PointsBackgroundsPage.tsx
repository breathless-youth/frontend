import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { usePointsGateway, usePointsUserId } from "@/features/points/gateway/PointsGatewayContext";
import { useShopActions } from "@/features/points/model/useShopActions";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { TimerBackgroundScreen } from "@/features/points/screens/TimerBackgroundScreen";
import { chargePacksQuery, earnTodayQuery } from "@/lib/pointsQueries";

export function PointsBackgroundsPage() {
  return (
    <PointsRouteGate>
      <BackgroundsContent />
    </PointsRouteGate>
  );
}

function BackgroundsContent() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const { earn: canEarn, ads, charge } = gateway.capabilities;
  // 모자람 창의 광고 줄과 충전 줄에만 쓰여서 그 기능이 없는 경계에는 묻지 않는다.
  const earn = useQuery({ ...earnTodayQuery(gateway, userId), enabled: canEarn && ads });
  const packs = useQuery({ ...chargePacksQuery(gateway, userId), enabled: charge });
  const actions = useShopActions();
  return (
    <PointsShopRoute title={t("titles.backgrounds")}>
      {({ data, balance, back }) => (
        <TimerBackgroundScreen
          data={data}
          balance={balance}
          earn={earn.data}
          packs={packs.data ?? []}
          onBack={back}
          missions={canEarn}
          onApply={actions.setTimerBackground}
          onWatchAd={actions.watchAd}
          onCharge={actions.charge}
        />
      )}
    </PointsShopRoute>
  );
}
