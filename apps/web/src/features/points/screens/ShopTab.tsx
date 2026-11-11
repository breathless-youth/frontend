import { useTranslation } from "react-i18next";

import { MascotPickerCard } from "../components/shop/MascotPickerCard";
import { NextMascotCard } from "../components/shop/NextMascotCard";
import { ShopSectionRow } from "../components/shop/ShopSectionRow";
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
  onOpen: (kind: ShopItemKind) => void;
  onOpenMascots: () => void;
  onSelectMascot: (id: MascotId) => void;
}) {
  const { t } = useTranslation(["points-shop", "points"]);
  const nextMascot = data.mascots
    .filter((mascot) => !mascot.unlocked)
    .sort((a, b) => a.unlockFocusSec - b.unlockFocusSec)[0];
  const selected = data.mascots.find((mascot) => mascot.selected);
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
        <MascotPickerCard mascots={data.mascots} onSelect={onSelectMascot} />
      )}
      {selected !== undefined && (
        <ShopSectionRow
          title={t("points-shop:section.accessory", { name: t(`points:mascots.${selected.id}`) })}
          items={preview((item) => item.kind === "accessory" && item.mascotId === selected.id)}
          onOpen={() => onOpen("accessory")}
        />
      )}
      <ShopSectionRow
        title={t("points-shop:section.background")}
        items={preview((item) => item.kind === "timerBackground")}
        dark
        onOpen={() => onOpen("timerBackground")}
      />
    </div>
  );
}
