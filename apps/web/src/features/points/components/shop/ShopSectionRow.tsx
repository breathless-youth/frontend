import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
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
  onOpen: () => void;
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
          onClick={onOpen}
          aria-label={`${title}, ${t("section.all")}`}
          className="flex min-h-11 items-center text-[13px] font-semibold text-primary"
        >
          {t("section.all")}
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="flex min-h-11 w-full min-w-0 flex-col gap-0.75 rounded-xl bg-muted p-2 text-left shadow-sb-card"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-12.5 items-center justify-center overflow-hidden rounded-[10px]",
                  item.imageUrl === null && "border border-dashed border-border",
                  dark ? "bg-foreground/90" : "bg-bg-layer-2",
                )}
              >
                {item.imageUrl !== null && (
                  <img src={item.imageUrl} alt="" className="size-full object-cover" />
                )}
              </span>
              <span className="truncate text-xs font-semibold">{item.name}</span>
              <span className="truncate text-xs font-bold text-primary">{caption(item, t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function caption(item: ShopItem, t: ReturnType<typeof useTranslation<"points-shop">>["t"]): string {
  if (item.owned) return t("tile.owned");
  if (item.acquire.type === "price") return formatPoints(item.acquire.price);
  const { condition, current, target } = item.acquire;
  return t(condition === "streakDays" ? "tile.streakDays" : "tile.focusHours", { current, target });
}
