import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBackTo } from "@/features/group-room/useBackTo";
import { PointsLoadState } from "@/features/points/components/shared/PointsLoadState";
import { PointsScreenFrame } from "@/features/points/components/shared/PointsScreenFrame";
import { usePointsGateway, usePointsUserId } from "@/features/points/gateway/PointsGatewayContext";
import { useShopActions } from "@/features/points/model/useShopActions";
import { PointsRouteGate } from "@/features/points/PointsRouteGate";
import { pointsSearch } from "@/features/points/pointsSearch";
import { EarnTab } from "@/features/points/screens/EarnTab";
import { ShopTab } from "@/features/points/screens/ShopTab";
import type { PointsTab, ShopItemKind } from "@/features/points/types";
import { slideNavigate } from "@/lib/pageTransition";
import { balanceQuery, chargePacksQuery, earnTodayQuery, shopQuery } from "@/lib/pointsQueries";
import { cannotLoad } from "@/lib/rankingQueries";
import { showToast } from "@/lib/toast";

const KIND_PATH: Record<ShopItemKind, string> = {
  accessory: "/points/accessories",
  timerBackground: "/points/backgrounds",
};

const TAB_TRIGGER_CLASS =
  "mb-0 h-11 min-h-11 flex-1 justify-center rounded-[12px] border-b-0 text-sm font-bold text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sb-card";

export function PointsPage() {
  return (
    <PointsRouteGate>
      <PointsContent />
    </PointsRouteGate>
  );
}

/**
 * 포인트 상점
 *
 * 꾸미기 상점과 포인트 받기 두 탭이고 고른 탭은 `?tab=shop|earn`으로 주소에 남는다.
 * 탭을 바꾸는 것은 같은 화면 안의 일이라 기록을 쌓지 않는다.
 * 경계가 포인트 받기를 지원하지 않으면 탭 줄 없이 꾸미기 상점만 그리고, `?tab=earn`으로 들어와도 상점을 보인다.
 * 앞 화면이 없으면 뒤로 가기는 홈으로 간다.
 */
function PointsContent() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const balance = useQuery(balanceQuery(gateway, userId));
  const back = useBackTo("/home");
  if (!gateway.capabilities.earn) {
    return (
      <PointsScreenFrame title={t("title")} onBack={back} balance={balance.data}>
        <div className="pt-3">
          <ShopPanel />
        </div>
      </PointsScreenFrame>
    );
  }
  return <TabbedContent balance={balance.data} back={back} />;
}

function TabbedContent({ balance, back }: { balance: number | undefined; back: () => void }) {
  const { t } = useTranslation("points");
  const [params, setParams] = useSearchParams();
  const tab: PointsTab = params.get("tab") === "earn" ? "earn" : "shop";
  const selectTab = (next: string) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("tab", next);
        return out;
      },
      { replace: true },
    );

  return (
    <PointsScreenFrame title={t("title")} onBack={back} balance={balance}>
      <Tabs value={tab} onValueChange={selectTab} className="flex flex-col gap-3.5 pt-3">
        <TabsList
          aria-label={t("tabs.label")}
          className="items-stretch gap-0 rounded-lg border-b-0 bg-brand-subtle p-1"
        >
          <TabsTrigger value="shop" className={TAB_TRIGGER_CLASS}>
            {t("tabs.shop")}
          </TabsTrigger>
          <TabsTrigger value="earn" className={TAB_TRIGGER_CLASS}>
            {t("tabs.earn")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shop">
          <ShopPanel />
        </TabsContent>
        <TabsContent value="earn">
          <EarnPanel />
        </TabsContent>
      </Tabs>
    </PointsScreenFrame>
  );
}

function ShopPanel() {
  const { t } = useTranslation(["points", "common"]);
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const shop = useQuery(shopQuery(gateway, userId));
  const { selectMascot } = useShopActions();
  const open = (pathname: string, tab?: string) =>
    slideNavigate("forward", () =>
      navigate({ pathname, search: pointsSearch(location.search, tab) }),
    );

  if (shop.data === undefined) {
    return (
      <PointsLoadState
        failed={cannotLoad(shop)}
        message={t("points:loadError.shop")}
        onRetry={() => void shop.refetch()}
      />
    );
  }
  return (
    <ShopTab
      data={shop.data}
      onOpen={(kind) => open(KIND_PATH[kind])}
      onOpenMascots={() => open("/points/mascots")}
      onSelectMascot={(id) => {
        selectMascot(id).catch(() => showToast(t("common:errors.retryLater")));
      }}
    />
  );
}

/**
 * 포인트 받기 탭의 데이터와 처리
 *
 * 결과를 그대로 돌려줘서 탭이 완료·실패 창을 고른다.
 */
function EarnPanel() {
  const { t } = useTranslation("points");
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const earn = useQuery(earnTodayQuery(gateway, userId));
  const chargeAvailable = gateway.capabilities.charge;
  const packs = useQuery({ ...chargePacksQuery(gateway, userId), enabled: chargeAvailable });
  const actions = useShopActions();

  if (earn.data === undefined) {
    return (
      <PointsLoadState
        failed={cannotLoad(earn)}
        message={t("loadError.earn")}
        onRetry={() => void earn.refetch()}
      />
    );
  }
  return (
    <EarnTab
      earn={earn.data}
      packs={packs.data ?? []}
      onClaim={actions.claim}
      onWatchAd={actions.watchAd}
      onCharge={actions.charge}
      chargeAvailable={chargeAvailable}
    />
  );
}
