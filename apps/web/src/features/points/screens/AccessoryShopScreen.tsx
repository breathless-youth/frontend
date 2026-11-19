import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { trackPointsSetViewed } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { AccessoryGrid } from "../components/items/AccessoryGrid";
import { AccessoryPreview } from "../components/items/AccessoryPreview";
import { LockedMascotPanel } from "../components/items/LockedMascotPanel";
import { MascotStrip } from "../components/items/MascotStrip";
import { SlotChips } from "../components/items/SlotChips";
import { InsufficientPointsSheet } from "../components/shared/InsufficientPointsSheet";
import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import { PurchaseConfirmSheet } from "../components/shared/PurchaseConfirmSheet";
import { PaymentGuideLink } from "../components/shared/PaymentGuide";
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

/**
 * 소품 사기
 *
 * 마스코트와 부위를 고르면 그 소품 격자가 나오고, 사고 입는 일은 맨 아래 버튼 하나가 맡는다.
 * 포인트로 산 소품은 바로 입은 상태로 만든다.
 * 결제로 산 상품(세트 등)은 처음 입기 전까지 7일 안에 철회할 수 있어서 바로 입히지 않는다.
 * 서버가 착용 요청을 첫 착용으로 기록하므로, 고른 칸을 그대로 둔 채 보유로만 바꾸고 사용자가 착용하기를 누를 때 입힌다.
 * 조회와 변경은 라우트가 맡고 이 화면은 받은 값과 처리기만 쓴다.
 * 상점에서 누른 상품 없이 들어오면 착용 중인 소품이 있는 칸과 그 소품을 먼저 골라, 지금 모습에서 바꿔 보기 시작하게 한다.
 * 마스코트를 바꿀 때도 그 마스코트가 착용 중인 칸과 소품을 먼저 고른다.
 * 착용은 마스코트마다 따로 저장되어 한 마스코트에서 끼고 벗어도 다른 마스코트의 착용은 바뀌지 않는다.
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
  const wornSlotOf = (id: MascotId): AccessorySlot =>
    SLOT_ORDER.find((candidate) =>
      data.items.some(
        (it) => it.kind === "accessory" && it.mascotId === id && it.slot === candidate && it.inUse,
      ),
    ) ?? "head";
  const [pickedSlot, setSlot] = useState<AccessorySlot>(() => entry?.slot ?? wornSlotOf(mascotId));
  const [pickedId, setPickedId] = useState<string | undefined>(entry?.id);
  // 방금 벗긴 소품은 칸에서 고른 채로 두어 다시 입기 쉽게 하되, 미리 보기에서는 빼서 벗은 모습을 보인다.
  const [takenOffId, setTakenOffId] = useState<string | undefined>();
  // 마스코트를 바꾸면 앞 마스코트에서 고르던 칸과 소품을 버리고 새 마스코트의 지금 모습에서 시작한다.
  const pickMascot = (id: MascotId) => {
    setMascotId(id);
    setSlot(wornSlotOf(id));
    setPickedId(undefined);
  };

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

  // 포인트로 산 직후 한 번 입힌다. 보유·착용 표시가 바뀌는 것으로 산 것을 알 수 있어 따로 알리지 않는다.
  // 결제로 산 상품은 이 흐름을 타지 않고 `useStorePurchase`도 입히지 않아, 7일 철회가 가능한 채로 보유만 된다.
  const { step, close } = flow;
  useEffect(() => {
    if (step !== "done" || item === null) {
      return;
    }
    void setInUse(item, true);
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step이 done이 될 때만 돌린다
  }, [step]);

  const choose = (change: () => void) => {
    flow.close();
    setTakenOffId(undefined);
    change();
  };

  const takeOff = (target: ShopItem) => {
    setPickedId(target.id);
    setTakenOffId(target.id);
    void setInUse(target, false);
  };

  const open = (pathname: string, tab?: string) =>
    slideNavigate("forward", () =>
      navigate({ pathname, search: pointsSearch(location.search, tab) }),
    );

  return (
    <PointsScreenFrame
      title={t("title", { name: mascotName })}
      onBack={onBack}
      balance={balance}
      fitScreen
    >
      <MascotStrip
        mascots={mascots}
        worn={wornByMascot(data.items)}
        pickedId={mascot.id}
        onPick={(id) => choose(() => pickMascot(id))}
      />
      <AccessoryPreview
        mascotId={mascot.id}
        item={mascot.unlocked && item?.id !== takenOffId ? item : null}
        worn={mascotItems.filter((it) => it.inUse)}
      />
      {/* 시트는 화면 아래 끝까지 이어진다. 부위 칩은 위에 두고 칸 목록만 스크롤하며, 버튼 줄은 안전 영역 위 화면 아래에 둔다. */}
      <div className="-mx-5 flex min-h-0 flex-1 flex-col rounded-t-3xl bg-muted shadow-[0_-12px_40px_rgb(0_0_0/0.08)]">
        {mascot.unlocked ? (
          <>
            <div className="flex shrink-0 flex-col gap-3.5 px-5 pt-4">
              <SlotChips
                slots={slots}
                value={slot}
                onChange={(next) => choose(() => setSlot(next))}
              />
              {slot === "set" && <p className="text-xs text-muted-foreground">{t("setNotice")}</p>}
            </div>
            <div
              data-slot="accessory-list"
              className={cn(
                "min-h-0 flex-1 px-5 pt-3.5 not-landscape-compact:overflow-y-auto not-landscape-compact:overscroll-contain",
                // 버튼 줄이 없을 때는 마지막 줄이 안전 영역에 깔리지 않게 그만큼 띄운다.
                item === null ? "pb-[calc(env(safe-area-inset-bottom)+24px)]" : "pb-4",
              )}
            >
              {slotItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("grid.empty")}</p>
              ) : null}
              <AccessoryGrid
                items={slotItems}
                pickedId={item?.id}
                storePrice={store.price}
                onPick={(id) => choose(() => setPickedId(id))}
                onTakeOff={takeOff}
              />
            </div>
            {item !== null && (
              // 높이가 낮은 가로 화면은 화면 전체가 스크롤돼서 버튼 줄을 화면 아래에 붙여 둔다.
              <div
                data-slot="accessory-action"
                className="shrink-0 border-t border-border bg-muted px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] landscape-compact:sticky landscape-compact:bottom-0"
              >
                <ActionButton
                  item={item}
                  store={store}
                  onBuy={flow.open}
                  onWear={() => {
                    setTakenOffId(undefined);
                    void setInUse(item, true);
                  }}
                  onTakeOff={() => takeOff(item)}
                />
              </div>
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+24px)] not-landscape-compact:overflow-y-auto">
            <LockedMascotPanel
              mascot={mascot}
              name={mascotName}
              totalFocusSec={data.totalFocusSec}
              onCollect={() => open("/points/mascots")}
            />
          </div>
        )}
      </div>

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
  onTakeOff,
}: {
  item: ShopItem;
  store: ReturnType<typeof useStorePurchase>;
  onBuy: () => void;
  onWear: () => void;
  onTakeOff: () => void;
}) {
  const { t } = useTranslation("points-items");
  const { t: tPoints } = useTranslation("points");
  // 입은 소품은 벗기가 할 수 있는 일이라 회색 버튼으로 두고 누르면 벗는다.
  if (item.inUse) {
    return (
      <Button size="xl" variant="secondary" className="mt-auto w-full" onClick={onTakeOff}>
        {t("grid.takeOff")}
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
    // 스토어 결제는 결제 창이 스토어 것이라 환불 규칙을 이 버튼 바로 위 링크에서 연다.
    // 링크 상자는 버튼에 바로 붙이고 글자를 상자 아래쪽에 두어, 글자가 버튼 위 6px에 보인다.
    // 링크 상자 높이는 32px다. 기본 44px면 버튼 줄 위 선에서 글자까지 27px가 비어 위 목록이 덜 보여서, 15px로 줄이려고 낮췄다.
    // 위로 키우면 누르는 범위가 위쪽 목록과 겹친다. 32px는 WCAG 2.2 AA 최소 24px를 넘고, 낮춘 만큼 가로를 넓혀 누르기 쉽게 한다.
    // 링크 상자가 버튼 줄의 위 여백(pt-3)을 대신하므로, 링크가 있으면 그만큼 끌어올린다.
    return (
      <div className={cn("mt-auto flex flex-col", store.available && "-mt-3")}>
        {store.available && (
          <PaymentGuideLink itemId={item.id} className="min-h-8 items-end px-6 pb-1" />
        )}
        <StoreBuyButton item={item} flow={store} className="w-full shadow-sb-cta" />
      </div>
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
