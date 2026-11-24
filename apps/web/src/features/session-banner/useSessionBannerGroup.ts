import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { setSessionBannerGroupUserProperty } from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { localDateKey } from "@/lib/dateKey";
import { isKoreanLocale } from "@/lib/i18n";
import { profileQuery } from "@/lib/profileQueries";
import { queryClient } from "@/lib/queryClient";
import { periodStatsQuery } from "@/lib/statsQueries";

import {
  assignSessionBannerArm,
  isSessionBannerEligible,
  isSessionBannerRunning,
  sessionBannerStatsRange,
  type SessionBannerGroup,
} from "./sessionBanner";
import { loadSessionBannerGroup, saveSessionBannerGroup } from "./sessionBannerStore";

/**
 * 세션 배너 실험군
 *
 * 앱으로 들어온 한국어 화면의 회원만 판정하고, 처음 정한 군을 저장해 다시 판정하지 않는다.
 * 세션 화면은 Provider 없이도 렌더되므로 공용 queryClient를 직접 넘겨 홈·기록과 캐시를 함께 쓴다.
 * 판정하지 않거나 아직 못 정했으면 null이고, 화면은 배너를 그리지 않는다.
 */
export function useSessionBannerGroup(userId: number | null): SessionBannerGroup | null {
  const [judgeable] = useState(
    () =>
      userId !== null &&
      isNativeBridgeAvailable() &&
      isKoreanLocale() &&
      isSessionBannerRunning(Date.now()),
  );
  const [stored, setStored] = useState(() =>
    judgeable && userId !== null ? loadSessionBannerGroup(userId) : null,
  );
  const [range] = useState(() => sessionBannerStatsRange(localDateKey()));
  const needsJudging = stored === "unset";
  const profile = useQuery({ ...profileQuery(userId ?? 0), enabled: needsJudging }, queryClient);
  const stats = useQuery(
    { ...periodStatsQuery(userId ?? 0, range), enabled: needsJudging },
    queryClient,
  );

  let judged: SessionBannerGroup | null = null;
  if (needsJudging && userId !== null && profile.data !== undefined) {
    // 응답에 로그인 정보가 없는 서버도 회원으로 확인할 수 없어 대상에서 뺀다.
    if (typeof profile.data.loginProvider !== "string") {
      judged = "not_eligible";
    } else if (stats.data !== undefined) {
      judged = isSessionBannerEligible(stats.data.dailyList)
        ? assignSessionBannerArm(userId)
        : "not_eligible";
    }
  }
  // 처음 정한 군을 바로 붙잡아, 세션 중 통계가 다시 와도 군이 바뀌지 않는다.
  if (judged !== null) {
    setStored(judged);
  }

  useEffect(() => {
    if (userId === null || stored === null || stored === "unset") return;
    // 이미 저장된 군을 읽은 경우와 StrictMode가 effect를 두 번 돌린 경우는 저장소를 다시 읽어 건너뛴다.
    if (loadSessionBannerGroup(userId) !== "unset") return;
    saveSessionBannerGroup(userId, stored);
    setSessionBannerGroupUserProperty(stored);
  }, [stored, userId]);

  return stored === "unset" ? null : stored;
}
