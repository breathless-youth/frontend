import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import { itemThumbnail } from "../../model/itemThumbnail";
import type { ShopItem } from "../../types";

/** 상점 탭의 한 종류(소품·타이머 배경)의 제목과 미리보기 상품 줄 */
export function ShopSectionRow({
  title,
  items,
  dark = false,
  onOpen,
}: {
  title: string;
  items: ShopItem[];
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
                {/* 영어 이름은 한 줄에 다 들어가지 않아서 소품 화면 격자처럼 두 줄까지 보인다. */}
                <span className="line-clamp-2 text-xs font-semibold break-keep">{item.name}</span>
                <span className="truncate text-xs font-bold text-primary">{caption(item, t)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function caption(item: ShopItem, t: ReturnType<typeof useTranslation<"points-shop">>["t"]): string {
  if (item.owned) return t("tile.owned");
  if (item.acquire.type === "price") return formatPoints(item.acquire.price);
  if (item.acquire.type === "store") return t("tile.store");
  const { condition, current, target } = item.acquire;
  return t(condition === "streakDays" ? "tile.streakDays" : "tile.focusHours", { current, target });
}
