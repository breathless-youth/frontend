import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { PointAmount } from "../shared/PointAmount";
import type { ShopItem } from "../../types";

/** 배경 격자 3열. 칸 아래에는 가격이나 얻는 조건, 가진 상태를 보인다. */
export function BackgroundGrid({
  items,
  selectedId,
  onSelect,
}: {
  items: ShopItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("points-decor");
  return (
    <div role="list" aria-label={t("grid.label")} className="grid grid-cols-3 gap-2.5">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <div role="listitem" key={item.id} className="min-w-0">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex min-h-11 w-full flex-col gap-1.5 rounded-lg bg-muted p-2 text-left shadow-sb-card",
                selected ? "border-2 border-primary" : "border-2 border-transparent",
              )}
            >
              <span
                aria-hidden
                className="flex h-17.5 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-bg-layer-2 data-[filled=true]:border-0"
                data-filled={item.imageUrl !== null}
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                )}
              </span>
              <span className="text-[13px] font-semibold break-keep">{item.name}</span>
              <Status item={item} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Status({ item }: { item: ShopItem }) {
  const { t } = useTranslation(["points-decor", "points"]);
  if (item.inUse) {
    return <span className="text-xs font-bold text-primary">{t("points:status.using")}</span>;
  }
  if (item.owned) {
    return <span className="text-xs font-bold text-primary">{t("points-decor:grid.owned")}</span>;
  }
  if (item.acquire.type === "price") {
    return (
      <span className="text-xs font-bold text-primary">
        <PointAmount value={item.acquire.price} size="sm" />
      </span>
    );
  }
  return (
    <span className="text-xs font-bold break-keep text-muted-foreground">
      {t(`points-decor:grid.${item.acquire.condition}`, { target: item.acquire.target })}
    </span>
  );
}
