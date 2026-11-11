import { useTranslation } from "react-i18next";

import { useShopActions } from "@/features/points/model/useShopActions";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { MascotCollectionScreen } from "@/features/points/screens/MascotCollectionScreen";

export function PointsMascotsPage() {
  return (
    <PointsRouteGate>
      <MascotsContent />
    </PointsRouteGate>
  );
}

function MascotsContent() {
  const { t } = useTranslation("points");
  const { selectMascot } = useShopActions();
  return (
    <PointsShopRoute title={t("titles.mascots")}>
      {({ data, balance, back }) => (
        <MascotCollectionScreen
          data={data}
          balance={balance}
          onSelect={selectMascot}
          onBack={back}
        />
      )}
    </PointsShopRoute>
  );
}
