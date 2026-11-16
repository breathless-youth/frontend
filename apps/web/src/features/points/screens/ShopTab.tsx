import { useTranslation } from "react-i18next";

import { MascotPickerCard } from "../components/shop/MascotPickerCard";
import { NextMascotCard } from "../components/shop/NextMascotCard";
import { ShopSectionRow } from "../components/shop/ShopSectionRow";
import { sortMascots } from "../model/mascotOrder";
import { TIMER_BACKGROUNDS_ON_SALE } from "../model/onSale";
import { wornByMascot } from "../model/wornAccessories";
import type { MascotId, ShopData, ShopItem, ShopItemKind } from "../types";

const PREVIEW_COUNT = 3;

/**
 * 꾸미기 상점 탭
 *
 * 다음 마스코트(모두 가졌으면 고르기 칸) 아래에 고른 마스코트의 소품을 세 개씩 미리 보인다.
 * 타이머 배경 줄은 배경을 파는 출시에서만 그린다.
 * 받은 데이터만 그리고 불러오기 실패는 라우트가 그린다.
 */
export function ShopTab({
  data,
  onOpen,
  onOpenMascots,
  onSelectMascot,
}: {
  data: ShopData;
  onOpen: (kind: ShopItemKind, itemId?: string) => void;
  /** 마스코트 모으기를 열며, 마스코트를 넘기면 그 마스코트를 사거나 여는 안내를 바로 연다. */
  onOpenMascots: (id?: MascotId) => void;
  onSelectMascot: (id: MascotId) => void;
}) {
  const { t } = useTranslation(["points-shop", "points"]);
  const mascots = sortMascots(data.mascots);
  // 포인트로 사는 마스코트는 늘어놓는 순서가 맨 뒤라 공부 시간 마스코트를 다 연 뒤에야 다음 차례가 된다.
  const nextMascot = mascots.find((mascot) => !mascot.unlocked);
  const selected = data.mascots.find((mascot) => mascot.selected);
  // 전체 보기에서는 상품 자리를 비워 종류만 넘긴다.
  const open = (kind: ShopItemKind, itemId?: string) =>
    itemId === undefined ? onOpen(kind) : onOpen(kind, itemId);
  const preview = (matches: (item: ShopItem) => boolean) =>
    data.items.filter(matches).slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {nextMascot !== undefined ? (
        <NextMascotCard
          mascot={nextMascot}
          totalFocusSec={data.totalFocusSec}
          onOpen={() =>
            nextMascot.price === null ? onOpenMascots() : onOpenMascots(nextMascot.id)
          }
        />
      ) : (
        <MascotPickerCard
          mascots={mascots}
          worn={wornByMascot(data.items)}
          onSelect={onSelectMascot}
          onLockedPress={onOpenMascots}
        />
      )}
      {selected !== undefined && (
        <ShopSectionRow
          title={t("points-shop:section.accessory", { name: t(`points:mascots.${selected.id}`) })}
          items={preview((item) => item.kind === "accessory" && item.mascotId === selected.id)}
          onOpen={(itemId) => open("accessory", itemId)}
        />
      )}
      {TIMER_BACKGROUNDS_ON_SALE && (
        <ShopSectionRow
          title={t("points-shop:section.background")}
          items={preview((item) => item.kind === "timerBackground")}
          dark
          onOpen={(itemId) => open("timerBackground", itemId)}
        />
      )}
    </div>
  );
}
