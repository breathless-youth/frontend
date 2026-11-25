import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useBackTo } from "@/features/group-room/useBackTo";
import { balanceQuery, shopQuery } from "@/lib/pointsQueries";
import { cannotLoad } from "@/lib/rankingQueries";

import { PointsLoadState } from "./components/shared/PointsLoadState";
import { PointsScreenFrame } from "./components/shared/PointsScreenFrame";
import { usePointsGateway, usePointsUserId } from "./gateway/PointsGatewayContext";
import type { ShopData } from "./types";

/**
 * 상점 데이터로 그리는 하위 화면의 공통 라우트 본문
 *
 * 상점과 잔액을 다 받은 뒤에만 화면을 그리고, 그 전에는 같은 틀 아래에 자리표시나 오류를 둔다.
 * 뒤로 가기는 앞 화면이 없으면 포인트 상점으로 간다.
 */
export function PointsShopRoute({
  title,
  children,
}: {
  title: string;
  children: (input: { data: ShopData; balance: number; back: () => void }) => ReactNode;
}) {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const shop = useQuery(shopQuery(gateway, userId));
  const balance = useQuery(balanceQuery(gateway, userId));
  const back = useBackTo("/points");
  if (shop.data !== undefined && balance.data !== undefined) {
    return children({ data: shop.data, balance: balance.data, back });
  }
  return (
    <PointsScreenFrame title={title} onBack={back} balance={balance.data}>
      <PointsLoadState
        failed={cannotLoad(shop) || cannotLoad(balance)}
        message={t("loadError.screen")}
        onRetry={() => {
          void shop.refetch();
          void balance.refetch();
        }}
      />
    </PointsScreenFrame>
  );
}
