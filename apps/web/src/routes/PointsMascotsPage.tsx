import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { readHomeSubject, reconcileHomeSubject } from "@/features/home-v3/subjectSelection";
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
import { SubjectStartUnavailableError } from "@/lib/sessionStart";
import { listSubjects } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";
import { useFocusStart } from "@/lib/useFocusStart";

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

/**
 * 홈의 공부 시작과 같은 흐름
 *
 * 홈에서 고른 과목이 있으면 지금 과목 목록으로 확인해 지워진 과목은 빼고 같은 시작 함수로 넘긴다.
 * 셸 브리지, 가이드 먼저 보기, 옛 세션 마감은 시작 함수(useFocusStart)가 맡는다.
 * 과목을 확인하지 못했거나 시작하지 못하면 홈과 같은 안내를 토스트로 띄운다.
 */
function useStartStudyLikeHome(userId: number) {
  const { t } = useTranslation(["home", "planner"]);
  const startFocus = useFocusStart(userId);
  return async () => {
    let subjectId = readHomeSubject(userId);
    if (subjectId !== null) {
      try {
        subjectId = reconcileHomeSubject(subjectId, await listSubjects());
      } catch {
        showToast(t("home:v3.subject.verifyFailed"));
        return;
      }
    }
    const failure = await startFocus(
      "mascot_collection",
      subjectId === null ? undefined : { subjectId },
    );
    if (failure !== null) {
      showToast(
        failure instanceof SubjectStartUnavailableError
          ? t("planner:studyStart.updateApp")
          : t("home:v3.startFailed"),
      );
    }
  };
}

function MascotsContent() {
  const { t } = useTranslation(["points", "common"]);
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const startStudy = useStartStudyLikeHome(userId);
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
          // 공부 시작은 포인트와 상관없어 비회원도 홈처럼 로그인 없이 시작한다.
          onStartStudy={() => void startStudy()}
          // 비회원은 본 것으로 적을 수 없어 들어올 때마다 다시 뜨므로 축하는 로그인한 뒤에 보인다.
          newlyUnlocked={member ? celebratedMascot(data.mascots) : undefined}
          // 본 것으로 적지 못하면 다음에 한 번 더 축하할 뿐이라 알리지 않는다.
          onCelebrated={() => void markUnlocksSeen().catch(() => {})}
        />
      )}
    </PointsShopRoute>
  );
}
