import type { TFunction } from "i18next";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import type { ShopItem } from "../../types";
import { ItemCutout } from "./ItemCutout";

/**
 * 한 부위의 소품 격자
 *
 * 칸을 누르면 미리 보기만 바뀌고, 사고 입는 일은 아래 버튼이 한다.
 * 소품은 투명한 판을 잘라 낸 소품 부분만 칸에 크게 그려서 휴대폰에서도 무엇인지 보인다.
 * 입은 소품을 고른 채로 그 칸을 한 번 더 누르면 벗으므로 벗기 칸을 따로 두지 않는다.
 * 그림이 없는 상품은 그림 자리를 비우고 이름과 가격만 두어 칸 높이는 그대로다.
 */
export function AccessoryGrid({
  items,
  pickedId,
  onPick,
  onTakeOff,
}: {
  items: ShopItem[];
  pickedId: string | undefined;
  onPick: (id: string) => void;
  onTakeOff: (item: ShopItem) => void;
}) {
  const { t } = useTranslation("points-items");
  // 소품은 대개 가로로 넓어 칸을 조금 납작하게 두면 두 줄이 한 화면에 들어온다.
  const stage = "aspect-6/5 w-full rounded-md";
  return (
    <div role="group" aria-label={t("grid.label")} className="grid grid-cols-3 gap-2.5">
      {items.map((item) => {
        const picked = item.id === pickedId;
        const sub = subLabel(item, t);
        return (
          <button
            key={item.id}
            type="button"
            aria-label={cellLabel(item, picked, t)}
            aria-pressed={picked}
            onClick={() => (picked && item.inUse ? onTakeOff(item) : onPick(item.id))}
            className={cn(
              "flex min-h-11 flex-col items-stretch gap-1.5 rounded-lg border bg-muted p-1.5 pb-2",
              // 테두리 두께를 바꾸지 않고 안쪽 선을 더해 고른 칸도 그림 크기가 같다.
              picked ? "border-primary ring-1 ring-primary ring-inset" : "border-border",
            )}
          >
            <ItemCutout item={item} aspect={6 / 5} className={cn(stage, "bg-bg-layer-2")} />
            <span className="text-center text-xs leading-4 font-medium break-keep text-foreground">
              {item.name}
            </span>
            <span
              className={cn(
                "flex items-center justify-center gap-0.5 text-[13px] leading-4 font-bold tabular-nums",
                sub.tone,
              )}
            >
              {sub.wearing && <Check size={12} strokeWidth={3} aria-hidden="true" />}
              {sub.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type T = TFunction<"points-items">;

function subLabel(item: ShopItem, t: T): { text: string; tone: string; wearing?: true } {
  if (item.inUse) {
    return { text: t("grid.wearing"), tone: "text-feedback-success", wearing: true };
  }
  if (item.owned) {
    return { text: t("grid.owned"), tone: "text-feedback-success" };
  }
  if (item.acquire.type === "price") {
    return { text: formatPoints(item.acquire.price), tone: "text-primary" };
  }
  if (item.acquire.type === "store") {
    return { text: t("grid.store"), tone: "text-primary" };
  }
  const { condition, target } = item.acquire;
  return {
    text: t(condition === "focusHours" ? "grid.rewardHours" : "grid.rewardDays", { target }),
    tone: "text-state-pause",
  };
}

function cellLabel(item: ShopItem, picked: boolean, t: T): string {
  if (item.inUse) {
    // 고른 입은 칸은 누르면 벗으므로 그 동작을 이름 뒤에 함께 읽는다.
    return t(picked ? "grid.wearingPickedLabel" : "grid.wearingLabel", { name: item.name });
  }
  if (item.owned) {
    return t("grid.ownedLabel", { name: item.name });
  }
  if (item.acquire.type === "price") {
    return `${item.name} ${formatPoints(item.acquire.price)}`;
  }
  if (item.acquire.type === "store") {
    return t("grid.storeLabel", { name: item.name });
  }
  const { condition, target } = item.acquire;
  return t(condition === "focusHours" ? "grid.rewardHoursLabel" : "grid.rewardDaysLabel", {
    name: item.name,
    target,
  });
}
