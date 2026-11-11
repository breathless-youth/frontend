import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackTo } from "@/features/group-room/useBackTo";
import { PointsLoadState } from "@/features/points/components/shared/PointsLoadState";
import { PointsScreenFrame } from "@/features/points/components/shared/PointsScreenFrame";
import { usePointsGateway, usePointsUserId } from "@/features/points/gateway/PointsGatewayContext";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { pointsSearch } from "@/features/points/pointsSearch";
import { PointsHistoryScreen } from "@/features/points/screens/PointsHistoryScreen";
import type { HistoryFilter } from "@/features/points/types";
import { slideNavigate } from "@/lib/pageTransition";
import { balanceQuery, historyQuery } from "@/lib/pointsQueries";
import { cannotLoad } from "@/lib/rankingQueries";

export function PointsHistoryPage() {
  return (
    <PointsRouteGate>
      <HistoryGate />
    </PointsRouteGate>
  );
}

/** 기록을 지원하지 않는 경계에서는 들어갈 곳이 없어 포인트 상점으로 돌려보낸다. */
function HistoryGate() {
  const gateway = usePointsGateway();
  const location = useLocation();
  if (!gateway.capabilities.history) {
    return <Navigate to={{ pathname: "/points", search: pointsSearch(location.search) }} replace />;
  }
  return <HistoryContent />;
}

/**
 * 포인트 기록
 *
 * 설정에서 들어와 앞 화면이 없으면 설정으로 돌아간다.
 * 랭킹 기록처럼 목록 끝이 보이면 다음 쪽을 이어 받는다.
 */
function HistoryContent() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const balance = useQuery(balanceQuery(gateway, userId));
  const history = useInfiniteQuery(historyQuery(gateway, userId, filter));
  const { ref, inView } = useInView({ rootMargin: "200px 0px" });
  const { hasNextPage, isFetching, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    history;
  // 다음 쪽이 실패해도 끝 감시 요소는 보이는 채라, 오류 상태에서 다시 부르면 요청이 끝없이 이어진다.
  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);
  const entries = history.data?.pages.flatMap((page) => page.entries);
  const back = useBackTo("/settings");
  const openEarn = () =>
    slideNavigate("forward", () =>
      navigate({ pathname: "/points", search: pointsSearch(location.search, "earn") }),
    );
  return (
    <PointsScreenFrame title={t("titles.history")} onBack={back} balance={balance.data}>
      {entries !== undefined ? (
        <>
          <PointsHistoryScreen
            entries={entries}
            filter={filter}
            onFilter={setFilter}
            onEarn={openEarn}
          />
          {/* 첫 쪽이 오기 전에 두면 자리표시 아래 끝이 바로 보여 다음 쪽을 곧장 부르므로 목록을 그린 뒤에만 둔다. */}
          {entries.length > 0 && <div ref={ref} aria-hidden="true" className="h-px" />}
          {isFetchingNextPage ? (
            <Skeleton className="mb-6 h-13 rounded-lg" />
          ) : isFetchNextPageError ? (
            <div className="pb-6">
              <ErrorState
                message={t("loadError.screen")}
                onRetry={() => void fetchNextPage()}
                screen="points"
              />
            </div>
          ) : null}
        </>
      ) : (
        <PointsLoadState
          failed={cannotLoad(history)}
          message={t("loadError.screen")}
          onRetry={() => void history.refetch()}
        />
      )}
    </PointsScreenFrame>
  );
}
