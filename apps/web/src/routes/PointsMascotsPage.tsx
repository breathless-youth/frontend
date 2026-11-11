import { useTranslation } from "react-i18next";

import { useShopActions } from "@/features/points/model/useShopActions";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { MascotCollectionScreen } from "@/features/points/screens/MascotCollectionScreen";
import type { Mascot, MascotId } from "@/features/points/types";
import { showToast } from "@/lib/toast";

export function PointsMascotsPage() {
  return (
    <PointsRouteGate>
      <MascotsContent />
    </PointsRouteGate>
  );
}

/** 한 번에 여럿이 열렸으면 가장 늦게 열리는 마스코트 하나만 축하한다. */
function celebratedMascot(mascots: Mascot[]): MascotId | undefined {
  return mascots
    .filter((mascot) => mascot.newlyUnlocked)
    .reduce<Mascot | undefined>(
      (best, mascot) =>
        best === undefined || mascot.unlockFocusSec > best.unlockFocusSec ? mascot : best,
      undefined,
    )?.id;
}

function MascotsContent() {
  const { t } = useTranslation(["points", "common"]);
  const { selectMascot, markUnlocksSeen } = useShopActions();
  return (
    <PointsShopRoute title={t("points:titles.mascots")}>
      {({ data, balance, back }) => (
        <MascotCollectionScreen
          data={data}
          balance={balance}
          onSelect={(id) => selectMascot(id).catch(() => showToast(t("common:errors.retryLater")))}
          onBack={back}
          newlyUnlocked={celebratedMascot(data.mascots)}
          // 본 것으로 적지 못하면 다음에 한 번 더 축하할 뿐이라 알리지 않는다.
          onCelebrated={() => void markUnlocksSeen().catch(() => {})}
        />
      )}
    </PointsShopRoute>
  );
}
