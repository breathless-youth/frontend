import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { usePointsGateway, usePointsUserId } from "@/features/points/gateway/PointsGatewayContext";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { MascotCollectionScreen } from "@/features/points/screens/MascotCollectionScreen";
import type { MascotId } from "@/features/points/types";
import { pointsKeys } from "@/lib/pointsQueries";

export function PointsMascotsPage() {
  return (
    <PointsRouteGate>
      <MascotsContent />
    </PointsRouteGate>
  );
}

function MascotsContent() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const select = async (id: MascotId) => {
    await gateway.selectMascot(id);
    await queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
  };
  return (
    <PointsShopRoute title={t("titles.mascots")}>
      {({ data, balance, back }) => (
        <MascotCollectionScreen data={data} balance={balance} onSelect={select} onBack={back} />
      )}
    </PointsShopRoute>
  );
}
