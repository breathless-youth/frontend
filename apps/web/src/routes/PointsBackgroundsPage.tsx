import { useTranslation } from "react-i18next";

import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { TimerBackgroundScreen } from "@/features/points/screens/TimerBackgroundScreen";

export function PointsBackgroundsPage() {
  const { t } = useTranslation("points");
  return (
    <PointsRouteGate>
      <PointsShopRoute title={t("titles.backgrounds")}>
        {({ data, balance, back }) => (
          <TimerBackgroundScreen data={data} balance={balance} onBack={back} />
        )}
      </PointsShopRoute>
    </PointsRouteGate>
  );
}
