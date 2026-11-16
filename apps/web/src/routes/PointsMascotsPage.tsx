import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  usePointsGateway,
  usePointsMembership,
  usePointsUserId,
} from "@/features/points/gateway/PointsGatewayContext";
import { useShopActions } from "@/features/points/model/useShopActions";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { PointsShopRoute } from "@/features/points/PointsShopRoute";
import { MascotCollectionScreen } from "@/features/points/screens/MascotCollectionScreen";
import type { Mascot, MascotId } from "@/features/points/types";
import { chargePacksQuery, earnTodayQuery } from "@/lib/pointsQueries";
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
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const { member } = usePointsMembership();
  const { earn: canEarn, ads, charge } = gateway.capabilities;
  // 모자람 창의 광고 줄과 충전 줄에만 쓰여서 그 기능이 없는 경계에는 묻지 않는다.
  const earn = useQuery({ ...earnTodayQuery(gateway, userId), enabled: canEarn && ads });
  const packs = useQuery({ ...chargePacksQuery(gateway, userId), enabled: charge });
  const { selectMascot, markUnlocksSeen, watchAd, charge: chargePoints } = useShopActions();
  return (
    <PointsShopRoute title={t("points:titles.mascots")}>
      {({ data, balance, back }) => (
        <MascotCollectionScreen
          data={data}
          balance={balance}
          earn={earn.data}
          packs={packs.data ?? []}
          onSelect={(id) => selectMascot(id).catch(() => showToast(t("common:errors.retryLater")))}
          onBack={back}
          onWatchAd={watchAd}
          onCharge={chargePoints}
          // 비회원은 본 것으로 적을 수 없어 들어올 때마다 다시 뜨므로 축하는 로그인한 뒤에 보인다.
          newlyUnlocked={member ? celebratedMascot(data.mascots) : undefined}
          // 본 것으로 적지 못하면 다음에 한 번 더 축하할 뿐이라 알리지 않는다.
          onCelebrated={() => void markUnlocksSeen().catch(() => {})}
        />
      )}
    </PointsShopRoute>
  );
}
