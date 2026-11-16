import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { trackPointsSetViewed } from "@/lib/amplitude";
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
import { StoreBuyButton } from "../components/shared/StoreBuyButton";
import { StorePurchaseDialogs } from "../components/shared/StorePurchaseDialogs";
import { formatPoints } from "../model/formatPoints";
import { sortMascots } from "../model/mascotOrder";
import { SLOT_ORDER } from "../model/slotOrder";
import { usePurchaseFlow } from "../model/usePurchaseFlow";
import { useStorePurchase } from "../model/useStorePurchase";
import { wornByMascot } from "../model/wornAccessories";
import { pickedItemFrom, pointsSearch } from "../pointsSearch";
import type { AccessorySlot, MascotId, ShopItem } from "../types";
import type { ShopScreenProps } from "./shopScreenProps";
import { usePointsScreenViewed } from "../model/usePointsScreenViewed";

const NOTICE_MS = 3000;

/**
 * 소품 사기
 *
 * 마스코트와 부위를 고르면 그 소품 격자가 나오고, 사고 입는 일은 맨 아래 버튼 하나가 맡는다.
 * 산 소품은 바로 입은 상태로 만든다. 조회와 변경은 라우트가 맡고 이 화면은 받은 값과 처리기만 쓴다.
 * 상점에서 누른 상품 없이 들어오면 착용 중인 소품이 있는 칸과 그 소품을 먼저 골라, 지금 모습에서 바꿔 보기 시작하게 한다.
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
  usePointsScreenViewed("accessories");
  const navigate = useNavigate();
  const location = useLocation();
  const mascots = sortMascots(data.mascots);
  // 상점에서 누르고 들어온 소품이 있으면 그 소품의 마스코트와 칸을 처음부터 골라 둔다.
  const [entry] = useState(() => {
    const id = pickedItemFrom(location.search);
    return data.items.find((it) => it.kind === "accessory" && it.id === id);
  });
  const [mascotId, setMascotId] = useState<MascotId>(
    () => entry?.mascotId ?? (mascots.find((m) => m.selected) ?? mascots[0]).id,
  );
  // 착용 중인 소품이 여러 칸에 있으면 칩 순서에서 가장 앞 칸을 연다.
  const [pickedSlot, setSlot] = useState<AccessorySlot>(
    () =>
      entry?.slot ??
      SLOT_ORDER.find((candidate) =>
        data.items.some(
          (it) =>
            it.kind === "accessory" &&
            it.mascotId === mascotId &&
            it.slot === candidate &&
            it.inUse,
        ),
      ) ??
      "head",
  );
  const [pickedId, setPickedId] = useState<string | undefined>(entry?.id);

  const mascot = mascots.find((m) => m.id === mascotId) ?? mascots[0];
  const mascotName = tPoints(`mascots.${mascot.id}`);
  const mascotItems = data.items.filter(
    (it) => it.kind === "accessory" && it.mascotId === mascot.id,
  );
  // 상품이 있는 부위만 칩으로 보이고, 고른 부위에 상품이 없는 마스코트로 바꾸면 첫 부위로 간다.
  const withItems = SLOT_ORDER.filter((s) => mascotItems.some((it) => it.slot === s));
  const slots: readonly AccessorySlot[] =
    withItems.length > 0 ? withItems : ["head", "face", "body"];
  const slot = slots.includes(pickedSlot) ? pickedSlot : slots[0];
  const slotItems = mascotItems.filter((it) => it.slot === slot);
  const store = useStorePurchase(mascotItems);
  // 이 칸에서 직접 고른 소품이 없으면 착용 중인 소품을, 그것도 없으면 첫 소품을 고른다.
  const item =
    slotItems.find((it) => it.id === pickedId) ??
    slotItems.find((it) => it.inUse) ??
    slotItems[0] ??
    null;

  const flow = usePurchaseFlow(item);

  const viewingSetOf = slot === "set" ? mascot.id : null;
  useEffect(() => {
    if (viewingSetOf !== null) {
      trackPointsSetViewed(viewingSetOf);
    }
  }, [viewingSetOf]);

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

  // 결제로 산 소품도 바로 입히고 알린다.
  const storeStep = store.step;
  useEffect(() => {
    if (storeStep !== "done" || store.target === null) {
      return;
    }
    void setInUse(store.target, true);
    showToast(tPoints("purchase.done", { name: store.target.name }));
    store.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 결제가 끝난 때만 돌린다
  }, [storeStep]);

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
        mascots={mascots}
        worn={wornByMascot(data.items)}
        pickedId={mascot.id}
        onPick={(id) => choose(() => setMascotId(id))}
      />
      <AccessoryPreview
        mascotId={mascot.id}
        item={mascot.unlocked ? item : null}
        worn={mascotItems.filter((it) => it.inUse)}
      />
      <div className="-mx-5 flex flex-1 flex-col gap-3.5 rounded-t-3xl bg-muted px-5 pt-4 shadow-[0_-12px_40px_rgb(0_0_0/0.08)]">
        {mascot.unlocked ? (
          <>
            <SlotChips
              slots={slots}
              value={slot}
              onChange={(next) => choose(() => setSlot(next))}
            />
            {slot === "set" && <p className="text-xs text-muted-foreground">{t("setNotice")}</p>}
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
                store={store}
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

      <StorePurchaseDialogs flow={store} />
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
  store,
  onBuy,
  onWear,
}: {
  item: ShopItem;
  store: ReturnType<typeof useStorePurchase>;
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
  if (item.acquire.type === "store") {
    return <StoreBuyButton item={item} flow={store} className="mt-auto w-full shadow-sb-cta" />;
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
