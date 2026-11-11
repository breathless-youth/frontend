import { useTranslation } from "react-i18next";

import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { AccessoryShopScreen } from "@/features/points/screens/AccessoryShopScreen";

export function PointsAccessoriesPage() {
  const { t } = useTranslation("points");
  return (
    <PointsRouteGate>
      <PointsShopRoute title={t("titles.accessories")}>
        {({ data, balance, back }) => (
          <AccessoryShopScreen data={data} balance={balance} onBack={back} />
        )}
      </PointsShopRoute>
    </PointsRouteGate>
  );
}
