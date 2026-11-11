import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import type { AccessorySlot, ShopItem } from "../../types";

/**
 * 한 부위의 소품 격자
 *
 * 칸을 누르면 미리 보기만 바뀌고, 사고 입는 일은 아래 버튼이 한다.
 * 마지막 `벗기` 칸은 그 부위에 입은 소품을 벗긴다.
 * 그림이 없는 상품은 이름과 가격만 두어 칸 높이는 그대로다.
 */
export function AccessoryGrid({
  items,
  slot,
  pickedId,
  onPick,
  onTakeOff,
}: {
  items: ShopItem[];
  slot: AccessorySlot;
  pickedId: string | undefined;
  onPick: (id: string) => void;
  onTakeOff: () => void;
}) {
  const { t } = useTranslation("points-items");
  const cell =
    "flex min-h-20 flex-col items-center justify-end gap-0.5 rounded-2xl bg-muted px-0.5 pb-1.5";
  return (
    <div role="group" aria-label={t("grid.label")} className="grid grid-cols-4 gap-2.5">
      {items.map((item) => {
        const picked = item.id === pickedId;
        const sub = subLabel(item, t);
        return (
          <button
            key={item.id}
            type="button"
            aria-label={cellLabel(item, t)}
            aria-pressed={picked}
            onClick={() => onPick(item.id)}
            className={cn(cell, picked ? "border-2 border-primary" : "border border-border")}
          >
            {item.imageUrl !== null && (
              <img
                src={item.imageUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="size-10 object-contain"
              />
            )}
            <span className="text-[10px] break-keep text-muted-foreground">{item.name}</span>
            <span className={cn("text-[11px] font-bold", sub.tone)}>{sub.text}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-label={t("grid.takeOffLabel", { slot: t(`slots.${slot}`) })}
        onClick={onTakeOff}
        className={cn(cell, "border border-border")}
      >
        <span className="text-[10px] text-muted-foreground">{t("grid.takeOff")}</span>
        <span className="h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

type T = TFunction<"points-items">;

function subLabel(item: ShopItem, t: T): { text: string; tone: string } {
  if (item.owned) {
    return { text: t("grid.owned"), tone: "text-feedback-success" };
  }
  if (item.acquire.type === "price") {
    return { text: formatPoints(item.acquire.price), tone: "text-primary" };
  }
  const { condition, target } = item.acquire;
  return {
    text: t(condition === "focusHours" ? "grid.rewardHours" : "grid.rewardDays", { target }),
    tone: "text-state-pause",
  };
}

function cellLabel(item: ShopItem, t: T): string {
  if (item.inUse) {
    return t("grid.wearingLabel", { name: item.name });
  }
  if (item.owned) {
    return t("grid.ownedLabel", { name: item.name });
  }
  if (item.acquire.type === "price") {
    return `${item.name} ${formatPoints(item.acquire.price)}`;
  }
  const { condition, target } = item.acquire;
  return t(condition === "focusHours" ? "grid.rewardHoursLabel" : "grid.rewardDaysLabel", {
    name: item.name,
    target,
  });
}
