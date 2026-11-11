import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatSignedPoints } from "../../model/formatPoints";
import type { PointsHistoryEntry } from "../../types";

type Group = { key: string; date: Date; entries: PointsHistoryEntry[] };

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 같은 날(기기 시간대) 기록끼리 묶고 최근 날이 위로 온다. */
function groupByDay(entries: PointsHistoryEntry[]): Group[] {
  const sorted = [...entries].sort((a, b) => b.atMs - a.atMs);
  const groups: Group[] = [];
  for (const entry of sorted) {
    const key = dayKey(entry.atMs);
    const last = groups.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, date: new Date(entry.atMs), entries: [entry] });
  }
  return groups;
}

/** 날짜별로 묶은 포인트 기록 */
export function HistoryList({ entries }: { entries: PointsHistoryEntry[] }) {
  const { t, i18n } = useTranslation("points-shop");
  const [todayKey] = useState(() => dayKey(Date.now()));
  return (
    <div className="flex flex-col gap-1.5">
      {groupByDay(entries).map((group) => (
        <section key={group.key} aria-labelledby={`history-${group.key}`}>
          <h2 id={`history-${group.key}`} className="pt-2 pb-1.5 text-sm font-bold">
            {group.key === todayKey ? t("history.today") : dayLabel(group.date, i18n.language)}
          </h2>
          <ul className="flex flex-col rounded-lg bg-muted px-4 shadow-sb-card">
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <span className="min-w-0 text-sm">{reasonLabel(entry, t)}</span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    entry.amount > 0 ? "text-primary" : "text-foreground",
                  )}
                >
                  {formatSignedPoints(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function dayLabel(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { month: "long", day: "numeric" }).format(date);
}

function reasonLabel(
  entry: PointsHistoryEntry,
  t: ReturnType<typeof useTranslation<"points-shop">>["t"],
): string {
  if (entry.reason === "purchase") {
    return entry.itemName === undefined
      ? t("history.reason.purchaseUnknown")
      : t("history.reason.purchase", { name: entry.itemName });
  }
  return t(`history.reason.${entry.reason}`);
}
