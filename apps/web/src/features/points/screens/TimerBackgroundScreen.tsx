import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/toast";

import { BackgroundGrid } from "../components/decor/BackgroundGrid";
import { CategoryChips } from "../components/decor/CategoryChips";
import { TimerPreview } from "../components/decor/TimerPreview";
import { InsufficientPointsSheet } from "../components/shared/InsufficientPointsSheet";
import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import { PurchaseConfirmSheet } from "../components/shared/PurchaseConfirmSheet";
import { StoreBuyButton } from "../components/shared/StoreBuyButton";
import { StorePurchaseDialogs } from "../components/shared/StorePurchaseDialogs";
import { formatPoints } from "../model/formatPoints";
import { usePurchaseFlow } from "../model/usePurchaseFlow";
import { useStorePurchase } from "../model/useStorePurchase";
import { pickedItemFrom, pointsSearch } from "../pointsSearch";
import type { ShopItem } from "../types";
import type { ShopScreenProps } from "./shopScreenProps";
import { usePointsScreenViewed } from "../model/usePointsScreenViewed";

/**
 * 타이머 배경 고르기
 *
 * 산 배경은 바로 쓰는 상태로 만든다. 조회와 변경은 라우트가 맡고 이 화면은 받은 값과 처리기만 쓴다.
 */
export function TimerBackgroundScreen({
  data,
  balance,
  earn,
  packs,
  missions,
  onBack,
  onApply,
  onWatchAd,
  onCharge,
}: ShopScreenProps & { onApply: (itemId: string | null) => Promise<void> }) {
  const { t } = useTranslation(["points", "points-decor", "common"]);
  usePointsScreenViewed("backgrounds");
  const navigate = useNavigate();
  const location = useLocation();
  const [category, setCategory] = useState<string | null>(null);
  // 상점에서 누르고 들어온 배경이 있으면 처음부터 골라 둔다.
  const [pickedId, setPickedId] = useState<string | null>(() => pickedItemFrom(location.search));

  const all = data.items.filter((item) => item.kind === "timerBackground");
  const categories = [...new Set(all.flatMap((item) => (item.category ? [item.category] : [])))];
  const visible = category === null ? all : all.filter((item) => item.category === category);
  // 고른 칸이 분류 밖으로 나가면 쓰는 배경, 없으면 첫 칸을 미리 보인다.
  const selected: ShopItem | undefined =
    visible.find((item) => item.id === pickedId) ??
    visible.find((item) => item.inUse) ??
    visible[0];

  const flow = usePurchaseFlow(selected ?? null);
  const store = useStorePurchase(all);
  const { step, close } = flow;
  // 포인트로 샀든 결제로 샀든 산 배경은 바로 쓰는 상태로 만들고, 사용 중 표시로 알 수 있어 따로 알리지 않는다.
  const bought = step === "done" ? selected : store.step === "done" ? store.target : undefined;
  const purchasedId = bought?.id;

  const apply = (itemId: string) => {
    onApply(itemId).catch(() => showToast(t("common:errors.retryLater")));
  };

  // 단계를 닫아야 산 배경을 한 번만 적용한다.
  useEffect(() => {
    if (purchasedId === undefined) {
      return;
    }
    close();
    store.close();
    apply(purchasedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 산 배경이 정해질 때만 돌린다
  }, [purchasedId]);

  return (
    <PointsScreenFrame title={t("points:titles.backgrounds")} onBack={onBack} balance={balance}>
      <div className="flex flex-1 flex-col gap-4 pt-4">
        <TimerPreview item={selected} />
        <CategoryChips categories={categories} value={category} onChange={setCategory} />
        <BackgroundGrid items={visible} selectedId={selected?.id} onSelect={setPickedId} />
        <div className="mt-auto pt-2">
          {selected && (
            <ActionButton
              item={selected}
              store={store}
              onBuy={flow.open}
              onApply={(item) => apply(item.id)}
            />
          )}
        </div>
      </div>
      <StorePurchaseDialogs flow={store} />
      <PurchaseConfirmSheet
        open={step === "confirm" || step === "pending"}
        pending={step === "pending"}
        item={selected ?? null}
        balance={balance}
        onConfirm={() => void flow.confirm()}
        onClose={close}
      />
      <InsufficientPointsSheet
        open={step === "insufficient"}
        item={selected ?? null}
        balance={balance}
        earn={earn}
        packs={packs}
        onWatchAd={onWatchAd && (() => flow.watchAdForPoints(onWatchAd))}
        onMissions={
          missions
            ? () =>
                void navigate({
                  pathname: "/points",
                  search: pointsSearch(location.search, "earn"),
                })
            : undefined
        }
        onCharge={onCharge && ((productId) => flow.chargeAndBuy(() => onCharge(productId)))}
        onClose={close}
      />
    </PointsScreenFrame>
  );
}

function ActionButton({
  item,
  store,
  onBuy,
  onApply,
}: {
  item: ShopItem;
  store: ReturnType<typeof useStorePurchase>;
  onBuy: () => void;
  onApply: (item: ShopItem) => void;
}) {
  const { t } = useTranslation(["points", "points-decor"]);
  if (item.inUse) {
    return (
      <Button size="xl" className="w-full" disabled>
        {t("points:status.using")}
      </Button>
    );
  }
  if (item.owned) {
    return (
      <Button size="xl" className="w-full shadow-sb-cta" onClick={() => onApply(item)}>
        {t("points:status.apply")}
      </Button>
    );
  }
  if (item.acquire.type === "price") {
    return (
      <Button size="xl" className="w-full shadow-sb-cta" onClick={onBuy}>
        {t("points:buyFor", { price: formatPoints(item.acquire.price) })}
      </Button>
    );
  }
  if (item.acquire.type === "store") {
    return <StoreBuyButton item={item} flow={store} className="w-full shadow-sb-cta" />;
  }
  return (
    <Button size="xl" className="w-full" disabled>
      {t(`points-decor:button.${item.acquire.condition}`, {
        current: item.acquire.current,
        target: item.acquire.target,
      })}
    </Button>
  );
}
