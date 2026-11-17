import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import { itemLayers, itemThumbnail } from "../../model/itemThumbnail";
import type { StorePrice } from "../../model/useStorePrices";
import type { ShopItem } from "../../types";
import { ItemCutout } from "../items/ItemCutout";
import { StorePriceText } from "../shared/StorePriceText";

/**
 * 상점 탭의 한 종류(소품·타이머 배경)의 제목과 미리보기 상품 줄
 *
 * 소품은 소품 화면 격자처럼 투명한 판을 잘라 소품만 그림 칸 가운데에 크게 그린다.
 * 그래서 칸도 격자와 같은 가로세로 비율로 둔다.
 * 타이머 배경은 판이 그림으로 꽉 차 있어 그림 칸을 덮는 한 장으로 그린다.
 */
export function ShopSectionRow({
  title,
  items,
  storePrice,
  dark = false,
  onOpen,
}: {
  title: string;
  items: ShopItem[];
  storePrice: (item: ShopItem) => StorePrice;
  dark?: boolean;
  /** 전체 보기는 상품 없이, 상품 칸은 그 상품의 id와 함께 부른다. */
  onOpen: (itemId?: string) => void;
}) {
  const { t } = useTranslation("points-shop");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="text-[15px] font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => onOpen()}
          aria-label={`${title}, ${t("section.all")}`}
          className="flex min-h-11 items-center text-[13px] font-semibold text-primary"
        >
          {t("section.all")}
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const thumbnail = itemThumbnail(item);
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex min-h-11 w-full min-w-0 flex-col gap-0.75 rounded-xl bg-muted p-2 text-left shadow-sb-card"
              >
                {item.kind === "accessory" ? (
                  <ItemCutout
                    item={item}
                    aspect={6 / 5}
                    className={cn(
                      "aspect-6/5 w-full rounded-[10px] bg-bg-layer-2",
                      itemLayers(item).length === 0 && "border border-dashed border-border",
                    )}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-12.5 items-center justify-center overflow-hidden rounded-[10px]",
                      thumbnail === null && "border border-dashed border-border",
                      dark ? "bg-foreground/90" : "bg-bg-layer-2",
                    )}
                  >
                    {thumbnail !== null && (
                      <img src={thumbnail} alt="" className="size-full object-cover" />
                    )}
                  </span>
                )}
                {/* 영어 이름은 한 줄에 다 들어가지 않아서 소품 화면 격자처럼 두 줄까지 보인다. */}
                <span className="line-clamp-2 text-xs font-semibold break-keep">{item.name}</span>
                <span className="truncate text-xs font-bold text-primary">
                  {caption(item, storePrice(item), t)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function caption(
  item: ShopItem,
  price: StorePrice,
  t: ReturnType<typeof useTranslation<"points-shop">>["t"],
): ReactNode {
  if (item.owned) return t("tile.owned");
  if (item.acquire.type === "price") return formatPoints(item.acquire.price);
  if (item.acquire.type === "store") {
    return <StorePriceText price={price} fallback={t("tile.store")} />;
  }
  const { condition, current, target } = item.acquire;
  return t(condition === "streakDays" ? "tile.streakDays" : "tile.focusHours", { current, target });
}
