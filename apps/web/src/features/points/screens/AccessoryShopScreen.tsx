import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";

import { AccessoryGrid } from "../components/items/AccessoryGrid";
import { AccessoryPreview } from "../components/items/AccessoryPreview";
import { LockedMascotPanel } from "../components/items/LockedMascotPanel";
import { MascotStrip } from "../components/items/MascotStrip";
import { SlotChips } from "../components/items/SlotChips";
import { InsufficientPointsSheet } from "../components/shared/InsufficientPointsSheet";
import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import { PurchaseConfirmSheet } from "../components/shared/PurchaseConfirmSheet";
import { formatPoints } from "../model/formatPoints";
import { usePurchaseFlow } from "../model/usePurchaseFlow";
import { pointsSearch } from "../pointsSearch";
import type { AccessorySlot, MascotId, ShopItem } from "../types";
import type { ShopScreenProps } from "./shopScreenProps";

const NOTICE_MS = 3000;

/**
 * 소품 사기
 *
 * 마스코트와 부위를 고르면 그 소품 격자가 나오고, 사고 입는 일은 맨 아래 버튼 하나가 맡는다.
 * 산 소품은 바로 입은 상태로 만든다. 조회와 변경은 라우트가 맡고 이 화면은 받은 값과 처리기만 쓴다.
 */
export function AccessoryShopScreen({
  data,
  balance,
  earn,
  packs,
  missions,
  onBack,
  onEquip,
  onWatchAd,
  onCharge,
}: ShopScreenProps & {
  onEquip: (mascotId: MascotId, slot: AccessorySlot, itemId: string | null) => Promise<void>;
}) {
  const { t } = useTranslation("points-items");
  const { t: tPoints } = useTranslation("points");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const [mascotId, setMascotId] = useState<MascotId>(
    () => (data.mascots.find((m) => m.selected) ?? data.mascots[0]).id,
  );
  const [slot, setSlot] = useState<AccessorySlot>("head");
  const [pickedId, setPickedId] = useState<string>();

  const mascot = data.mascots.find((m) => m.id === mascotId) ?? data.mascots[0];
  const mascotName = tPoints(`mascots.${mascot.id}`);
  const slotItems = data.items.filter(
    (it) => it.kind === "accessory" && it.mascotId === mascot.id && it.slot === slot,
  );
  const item = slotItems.find((it) => it.id === pickedId) ?? slotItems[0] ?? null;

  const flow = usePurchaseFlow(item);

  const setInUse = async (target: ShopItem, inUse: boolean) => {
    if (target.mascotId === undefined || target.slot === undefined) {
      return;
    }
    try {
      await onEquip(target.mascotId, target.slot, inUse ? target.id : null);
    } catch {
      showToast(tCommon("errors.retryLater"));
    }
  };

  // 산 직후 한 번 입히고, 알림은 잠시 뒤 거둔다. 단계가 done인 동안이 알림이 보이는 때다.
  const { step, close } = flow;
  useEffect(() => {
    if (step !== "done" || item === null) {
      return;
    }
    void setInUse(item, true);
    const timer = window.setTimeout(close, NOTICE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step이 done이 될 때만 돌린다
  }, [step]);

  const choose = (change: () => void) => {
    flow.close();
    change();
  };

  const open = (pathname: string, tab?: string) =>
    slideNavigate("forward", () =>
      navigate({ pathname, search: pointsSearch(location.search, tab) }),
    );

  return (
    <PointsScreenFrame title={t("title", { name: mascotName })} onBack={onBack} balance={balance}>
      <MascotStrip
        mascots={data.mascots}
        pickedId={mascot.id}
        onPick={(id) => choose(() => setMascotId(id))}
      />
      <AccessoryPreview mascotId={mascot.id} item={mascot.unlocked ? item : null} />
      <div className="-mx-5 flex flex-1 flex-col gap-3.5 rounded-t-3xl bg-white px-5 pt-4 shadow-[0_-12px_40px_rgb(0_0_0/0.08)]">
        {mascot.unlocked ? (
          <>
            <SlotChips value={slot} onChange={(next) => choose(() => setSlot(next))} />
            {slotItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("grid.empty")}</p>
            ) : null}
            <AccessoryGrid
              items={slotItems}
              slot={slot}
              pickedId={item?.id}
              onPick={(id) => choose(() => setPickedId(id))}
              onTakeOff={() => {
                const worn = slotItems.find((it) => it.inUse);
                if (worn) {
                  void setInUse(worn, false);
                }
              }}
            />
            {item !== null && (
              <ActionButton
                item={item}
                onBuy={flow.open}
                onWear={() => void setInUse(item, true)}
              />
            )}
          </>
        ) : (
          <LockedMascotPanel
            mascot={mascot}
            name={mascotName}
            totalFocusSec={data.totalFocusSec}
            onCollect={() => open("/points/mascots")}
          />
        )}
      </div>

      {flow.step === "done" && item !== null && (
        <div
          role="status"
          className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+92px)] left-5 z-50 mx-auto flex max-w-[350px] items-center gap-2 rounded-[14px] bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-lg"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-feedback-success">
            <Check size={12} aria-hidden="true" />
          </span>
          {tPoints("purchase.done", { name: item.name })}
        </div>
      )}

      <PurchaseConfirmSheet
        open={flow.step === "confirm" || flow.step === "pending"}
        pending={flow.step === "pending"}
        item={item}
        balance={balance}
        onConfirm={() => void flow.confirm()}
        onClose={flow.close}
      />
      <InsufficientPointsSheet
        open={flow.step === "insufficient"}
        item={item}
        balance={balance}
        earn={earn}
        packs={packs}
        onWatchAd={onWatchAd && (() => flow.watchAdForPoints(onWatchAd))}
        onMissions={missions ? () => open("/points", "earn") : undefined}
        onCharge={onCharge && ((productId) => flow.chargeAndBuy(() => onCharge(productId)))}
        onClose={flow.close}
      />
    </PointsScreenFrame>
  );
}

/** 고른 소품에 할 수 있는 일 하나를 문구로 보이는 맨 아래 버튼 */
function ActionButton({
  item,
  onBuy,
  onWear,
}: {
  item: ShopItem;
  onBuy: () => void;
  onWear: () => void;
}) {
  const { t } = useTranslation("points-items");
  const { t: tPoints } = useTranslation("points");
  if (item.inUse) {
    return (
      <Button size="xl" variant="secondary" className="mt-auto w-full" disabled>
        {tPoints("status.wearing")}
      </Button>
    );
  }
  if (item.owned) {
    return (
      <Button size="xl" className="mt-auto w-full shadow-sb-cta" onClick={onWear}>
        {tPoints("status.wear")}
      </Button>
    );
  }
  if (item.acquire.type === "price") {
    return (
      <Button size="xl" className="mt-auto w-full shadow-sb-cta" onClick={onBuy}>
        {tPoints("buyFor", { price: formatPoints(item.acquire.price) })}
      </Button>
    );
  }
  const { condition, current, target } = item.acquire;
  const hours = condition === "focusHours";
  return (
    <div className="mt-auto flex flex-col gap-2">
      <span
        role="img"
        aria-label={t(hours ? "action.progressHours" : "action.progressDays", { current, target })}
        className="block h-2 overflow-hidden rounded-full bg-brand-subtle"
      >
        <span
          className="block h-2 rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.round((current / target) * 100))}%` }}
        />
      </span>
      <Button size="xl" variant="secondary" className="w-full" disabled>
        {t(hours ? "action.focusHours" : "action.streakDays", { current, target })}
      </Button>
    </div>
  );
}
