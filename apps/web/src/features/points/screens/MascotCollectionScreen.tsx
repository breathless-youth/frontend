import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { formatDuration } from "@/features/records/recordsFormat";

import { LockedMascotSheet } from "../components/mascots/LockedMascotSheet";
import { MascotGrid } from "../components/mascots/MascotGrid";
import { MascotUnlockedScreen } from "../components/mascots/MascotUnlockedScreen";
import { InsufficientPointsSheet } from "../components/shared/InsufficientPointsSheet";
import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import { PurchaseConfirmSheet } from "../components/shared/PurchaseConfirmSheet";
import { usePointsGateway } from "../gateway/PointsGatewayContext";
import { usePurchaseFlow } from "../model/usePurchaseFlow";
import { pointsSearch } from "../pointsSearch";
import type { Mascot, MascotId, ShopData, ShopItem } from "../types";
import { usePointsScreenViewed } from "../model/usePointsScreenViewed";
import type { ShopScreenProps } from "./shopScreenProps";

/**
 * 마스코트 모으기 화면
 *
 * 새로 열린 마스코트는 라우트가 서버 값에서 골라 `newlyUnlocked`로 넘긴다.
 * 받은 값은 이 화면이 떠 있는 동안 한 번만 축하 화면으로 보인다.
 * 바꾸기나 나중에로 축하 화면을 닫으면 `onCelebrated`로 알려 서버가 본 것으로 기억하게 한다.
 * 포인트로 여는 마스코트는 잠금 시트에서 사고, 산 직후 같은 축하 화면을 한 번 보인다.
 * 산 마스코트는 서버가 새로 열린 것으로 치지 않아 본 것으로 알릴 일이 없다.
 * 포인트가 모자라면 소품·배경 화면과 같은 모자람 창에서 광고를 보거나 충전해 이어서 산다.
 */
export function MascotCollectionScreen({
  data,
  balance,
  earn,
  packs = [],
  onSelect,
  onBack,
  onWatchAd,
  onCharge,
  newlyUnlocked,
  onCelebrated,
}: {
  data: ShopData;
  balance: number;
  onSelect: (id: MascotId) => Promise<void>;
  onBack: () => void;
  newlyUnlocked?: MascotId;
  onCelebrated?: () => void;
} & Partial<Pick<ShopScreenProps, "earn" | "packs" | "onWatchAd" | "onCharge">>) {
  const { t } = useTranslation("points");
  const { t: tMascots } = useTranslation("points-mascots");
  usePointsScreenViewed("mascots");
  const gateway = usePointsGateway();
  const navigate = useNavigate();
  const location = useLocation();
  const [pressed, setPressed] = useState<Mascot | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [buying, setBuying] = useState<Mascot | null>(null);
  // 공부 시간으로 여는 마스코트를 기준 순서대로 두고 포인트로 사는 마스코트는 그 뒤에 둔다.
  const mascots = [...data.mascots].sort(
    (a, b) =>
      Number(a.price !== null) - Number(b.price !== null) || a.unlockFocusSec - b.unlockFocusSec,
  );
  const nextId = mascots.find((mascot) => !mascot.unlocked && mascot.price === null)?.id;
  // 구매 확인 창과 모자람 창은 상점 상품의 모양을 받아서 마스코트를 그 모양으로 넘긴다.
  const buyingItem: ShopItem | null =
    buying === null || buying.price === null
      ? null
      : {
          id: `mascot-${buying.id}`,
          kind: "accessory",
          name: t(`mascots.${buying.id}`),
          imageUrl: null,
          acquire: { type: "price", price: buying.price },
          owned: false,
          inUse: false,
        };
  const flow = usePurchaseFlow(
    buyingItem,
    buying === null ? undefined : () => gateway.purchaseMascot(buying.id),
  );
  const { step, close } = flow;
  // 살 마스코트가 정해진 뒤에야 가격을 알 수 있어서 다음 렌더에 창을 연다.
  const buyingId = buying?.id;
  useEffect(() => {
    if (buyingId !== undefined) {
      flow.open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 살 마스코트가 바뀔 때만 연다
  }, [buyingId]);
  // 산 직후에는 같은 축하 화면을 한 번 보이고, 닫으면 구매 흐름을 처음으로 돌린다.
  if (step === "done" && buying !== null) {
    const finish = () => {
      close();
      setBuying(null);
    };
    return (
      <MascotUnlockedScreen
        mascotId={buying.id}
        onSwitch={() => {
          void onSelect(buying.id);
          finish();
        }}
        onLater={finish}
      />
    );
  }

  if (newlyUnlocked !== undefined && !celebrated) {
    return (
      <MascotUnlockedScreen
        mascotId={newlyUnlocked}
        onSwitch={() => {
          setCelebrated(true);
          onCelebrated?.();
          void onSelect(newlyUnlocked);
        }}
        onLater={() => {
          setCelebrated(true);
          onCelebrated?.();
        }}
      />
    );
  }

  return (
    <PointsScreenFrame title={t("titles.mascots")} onBack={onBack} balance={balance}>
      <div className="flex flex-col gap-3.5 pt-1.5">
        <section className="flex flex-col gap-0.5 rounded-xl bg-muted px-4 py-3.5 shadow-sb-card">
          <span className="text-[13px] text-muted-foreground">{tMascots("totalFocus")}</span>
          <span className="text-xl font-extrabold tabular-nums">
            {formatDuration(data.totalFocusSec)}
          </span>
        </section>
        <MascotGrid
          mascots={mascots}
          totalFocusSec={data.totalFocusSec}
          onSelect={(id) => void onSelect(id)}
          onLockedPress={setPressed}
        />
      </div>
      <LockedMascotSheet
        mascot={pressed}
        hidden={pressed !== null && pressed.id !== nextId}
        totalFocusSec={data.totalFocusSec}
        onBuy={(mascot) => {
          setPressed(null);
          setBuying(mascot);
        }}
        onClose={() => setPressed(null)}
      />
      <PurchaseConfirmSheet
        open={step === "confirm" || step === "pending"}
        pending={step === "pending"}
        item={buyingItem}
        balance={balance}
        onConfirm={() => void flow.confirm()}
        onClose={() => {
          close();
          setBuying(null);
        }}
      />
      <InsufficientPointsSheet
        open={step === "insufficient"}
        item={buyingItem}
        balance={balance}
        earn={earn}
        packs={packs}
        onWatchAd={onWatchAd && (() => flow.watchAdForPoints(onWatchAd))}
        onCharge={onCharge && ((productId) => flow.chargeAndBuy(() => onCharge(productId)))}
        onMissions={
          gateway.capabilities.earn
            ? () =>
                void navigate({
                  pathname: "/points",
                  search: pointsSearch(location.search, "earn"),
                })
            : undefined
        }
        onClose={() => {
          close();
          setBuying(null);
        }}
      />
    </PointsScreenFrame>
  );
}
