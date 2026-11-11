import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { InsufficientPointsSheet } from "@/features/points/components/shared/InsufficientPointsSheet";
import { PointsBalancePill } from "@/features/points/components/shared/PointsBalancePill";
import { PurchaseConfirmSheet } from "@/features/points/components/shared/PurchaseConfirmSheet";
import { POINTS_SCENES, type PointsScene } from "@/features/points/fixtures";
import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import {
  PointsGatewayProvider,
  usePointsGateway,
  usePointsUserId,
} from "@/features/points/gateway/PointsGatewayContext";
import { usePurchaseFlow } from "@/features/points/model/usePurchaseFlow";
import { ResultPointsCard } from "@/features/points/screens/ResultPointsCard";
import { balanceQuery, chargePacksQuery, earnTodayQuery, shopQuery } from "@/lib/pointsQueries";
import { cn } from "@/lib/utils";

import { PointsAccessoriesPage } from "./PointsAccessoriesPage";
import { PointsBackgroundsPage } from "./PointsBackgroundsPage";
import { PointsHistoryPage } from "./PointsHistoryPage";
import { PointsMascotsPage } from "./PointsMascotsPage";
import { PointsPage } from "./PointsPage";

const PREVIEW_USER = -1238;

const SCREENS = {
  points: { label: "포인트 상점", render: () => <PointsPage /> },
  history: { label: "포인트 기록", render: () => <PointsHistoryPage /> },
  accessories: { label: "소품", render: () => <PointsAccessoriesPage /> },
  backgrounds: { label: "타이머 배경", render: () => <PointsBackgroundsPage /> },
  mascots: { label: "마스코트 모으기", render: () => <PointsMascotsPage /> },
  sheets: { label: "구매 시트", render: () => <SheetsPreview /> },
  result: { label: "공부 끝 칸", render: () => <ResultPreview /> },
} as const;

type ScreenKey = keyof typeof SCREENS;

function isScene(value: string | null): value is PointsScene {
  return (POINTS_SCENES as readonly (string | null)[]).includes(value);
}

/**
 * 포인트 화면 모음
 *
 * 장면마다 새 가짜 경계와 새 조회 캐시를 만들어 장면을 바꾸면 처음 상태에서 다시 그린다.
 * 라우트 화면을 그대로 그리고, 화면 안에서 다른 포인트 화면으로 이동하면 앱의 기본 경계(주소에 `pointsMock`이 없으면 실제 API)로 넘어간다.
 */
export function DevPointsPage() {
  const [params, setParams] = useSearchParams();
  const scene: PointsScene = isScene(params.get("scene"))
    ? (params.get("scene") as PointsScene)
    : "default";
  const screenParam = params.get("screen") ?? "points";
  const screen: ScreenKey = screenParam in SCREENS ? (screenParam as ScreenKey) : "points";
  const { gateway, client } = useMemo(
    () => ({ gateway: createFakePointsGateway(scene), client: new QueryClient() }),
    [scene],
  );
  const pick = (name: "scene" | "screen", value: string) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set(name, value);
        if (name === "screen") out.delete("tab");
        return out;
      },
      { replace: true },
    );

  return (
    <div className="theme-soft-blue bg-soft-blue min-h-dvh text-foreground">
      <div className="flex flex-col gap-2 border-b border-border px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <ChipRow
          items={POINTS_SCENES.map((name) => ({ key: name, label: name }))}
          value={scene}
          onPick={(value) => pick("scene", value)}
        />
        <ChipRow
          items={Object.entries(SCREENS).map(([key, { label }]) => ({ key, label }))}
          value={screen}
          onPick={(value) => pick("screen", value)}
        />
      </div>
      <QueryClientProvider client={client} key={scene}>
        <PointsGatewayProvider gateway={gateway} userId={PREVIEW_USER}>
          {SCREENS[screen].render()}
        </PointsGatewayProvider>
      </QueryClientProvider>
    </div>
  );
}

function ChipRow({
  items,
  value,
  onPick,
}: {
  items: { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.key === value}
          onClick={() => onPick(item.key)}
          className={cn(
            "min-h-8 rounded-full px-3 text-xs font-semibold",
            item.key === value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 왕관 하나로 구매 확인·모자람 시트를 연다. */
function SheetsPreview() {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const shop = useQuery(shopQuery(gateway, userId));
  const balance = useQuery(balanceQuery(gateway, userId));
  const earn = useQuery(earnTodayQuery(gateway, userId));
  const packs = useQuery(chargePacksQuery(gateway, userId));
  const crown = shop.data?.items.find((item) => item.id === "acc-stopwatch-crown") ?? null;
  const flow = usePurchaseFlow(crown);
  return (
    <div className="flex flex-col items-start gap-3 p-5">
      <PointsBalancePill size="home" balance={balance.data} onPress={() => {}} />
      <PointsBalancePill size="screen" balance={balance.data} />
      <p className="text-sm">
        단계 {flow.step}, 소유 {String(crown?.owned ?? false)}
      </p>
      <Button onClick={flow.open}>왕관 사기</Button>
      <PurchaseConfirmSheet
        open={flow.step === "confirm" || flow.step === "pending"}
        pending={flow.step === "pending"}
        item={crown}
        balance={balance.data ?? 0}
        onConfirm={() => void flow.confirm()}
        onClose={flow.close}
      />
      {earn.data && (
        <InsufficientPointsSheet
          open={flow.step === "insufficient"}
          item={crown}
          balance={balance.data ?? 0}
          earn={earn.data}
          packs={packs.data ?? []}
          onWatchAd={flow.close}
          onMissions={flow.close}
          onCharge={flow.close}
          onClose={flow.close}
        />
      )}
    </div>
  );
}

function ResultPreview() {
  const gateway = usePointsGateway();
  const reward = useQuery({
    queryKey: ["dev-points", "sessionReward"],
    queryFn: () => gateway.getSessionReward(new Date().toISOString()),
  });
  return (
    <div className="p-5">
      <ResultPointsCard reward={reward.data ?? null} onOpenShop={() => {}} />
    </div>
  );
}
