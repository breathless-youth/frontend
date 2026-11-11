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
  const earn = useQuery(earnTodayQuery(gateway, userId));
  const packs = useQuery(chargePacksQuery(gateway, userId));
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
          onSetInUse={actions.setInUse}
          onWatchAd={actions.watchAd}
          onCharge={actions.charge}
        />
      )}
    </PointsShopRoute>
  );
}
