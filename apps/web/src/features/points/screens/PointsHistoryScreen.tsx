import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { CoinIcon } from "../components/shared/CoinIcon";
import { HistoryList } from "../components/shop/HistoryList";
import type { HistoryFilter, PointsHistoryEntry } from "../types";

const FILTERS: HistoryFilter[] = ["all", "earned", "spent"];

/** 포인트 기록의 본문이며 틀과 잔액 알약은 라우트가 그린다. */
export function PointsHistoryScreen({
  entries,
  filter,
  onFilter,
  onEarn,
}: {
  entries: PointsHistoryEntry[];
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
  onEarn: () => void;
}) {
  const { t } = useTranslation("points-shop");
  return (
    <div className="flex flex-col gap-2 pt-3 pb-6">
      <div
        role="group"
        aria-label={t("history.filter.label")}
        className="flex rounded-lg bg-brand-subtle p-1"
      >
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
            className={cn(
              "h-11 flex-1 rounded-[12px] text-sm font-bold",
              filter === value
                ? "bg-muted text-foreground shadow-sb-card"
                : "text-muted-foreground",
            )}
          >
            {t(`history.filter.${value}`)}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-16 text-center">
          <CoinIcon size={56} />
          <h2 className="text-base font-bold">{t("history.empty.title")}</h2>
          <button
            type="button"
            onClick={onEarn}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sb-cta"
          >
            {t("history.empty.action")}
          </button>
        </div>
      ) : (
        <HistoryList entries={entries} />
      )}
    </div>
  );
}
