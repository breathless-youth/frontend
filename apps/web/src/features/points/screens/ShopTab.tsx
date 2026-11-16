import { useTranslation } from "react-i18next";

import { MascotPickerCard } from "../components/shop/MascotPickerCard";
import { NextMascotCard } from "../components/shop/NextMascotCard";
import { ShopSectionRow } from "../components/shop/ShopSectionRow";
import { sortMascots } from "../model/mascotOrder";
import type { MascotId, ShopData, ShopItem, ShopItemKind } from "../types";

const PREVIEW_COUNT = 3;

/**
 * 꾸미기 상점 탭
 *
 * 다음 마스코트(다 모았으면 고르기 칸) 아래에 고른 마스코트의 소품과 타이머 배경을 세 개씩 미리 보인다.
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
  onOpenMascots: () => void;
  onSelectMascot: (id: MascotId) => void;
}) {
  const { t } = useTranslation(["points-shop", "points"]);
  const nextMascot = data.mascots
    // 포인트로 사는 마스코트는 공부 시간으로 다가가는 것이 아니라 다음 마스코트에서 뺀다.
    .filter((mascot) => !mascot.unlocked && mascot.price === null)
    .sort((a, b) => a.unlockFocusSec - b.unlockFocusSec)[0];
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
          onOpen={onOpenMascots}
        />
      ) : (
        <MascotPickerCard mascots={sortMascots(data.mascots)} onSelect={onSelectMascot} />
      )}
      {selected !== undefined && (
        <ShopSectionRow
          title={t("points-shop:section.accessory", { name: t(`points:mascots.${selected.id}`) })}
          items={preview((item) => item.kind === "accessory" && item.mascotId === selected.id)}
          onOpen={(itemId) => open("accessory", itemId)}
        />
      )}
      <ShopSectionRow
        title={t("points-shop:section.background")}
        items={preview((item) => item.kind === "timerBackground")}
        dark
        onOpen={(itemId) => open("timerBackground", itemId)}
      />
    </div>
  );
}
