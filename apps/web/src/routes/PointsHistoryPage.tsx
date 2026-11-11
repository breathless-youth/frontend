import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

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

/** 포인트 기록이며 설정에서 들어와 앞 화면이 없으면 설정으로 돌아간다. */
function HistoryContent() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const balance = useQuery(balanceQuery(gateway, userId));
  const history = useQuery(historyQuery(gateway, userId, filter));
  const back = useBackTo("/settings");
  const openEarn = () =>
    slideNavigate("forward", () =>
      navigate({ pathname: "/points", search: pointsSearch(location.search, "earn") }),
    );
  return (
    <PointsScreenFrame title={t("titles.history")} onBack={back} balance={balance.data}>
      {history.data !== undefined ? (
        <PointsHistoryScreen
          entries={history.data}
          filter={filter}
          onFilter={setFilter}
          onEarn={openEarn}
        />
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
