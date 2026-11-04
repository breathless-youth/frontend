import { useId } from "react";
import { useTranslation } from "react-i18next";

import { RankAvatar } from "@/features/ranking/components/RankAvatar";
import { cn } from "@/lib/utils";

import { liveRankSeconds } from "../model/desks";
import { formatClock } from "../model/timeText";
import type { WeeklyRankRow } from "../types";

/**
 * 그룹 홈의 이번 주 순위 카드
 *
 * 순위는 다시 받을 때만 바뀌어서 순공을 올려 보여도 바로 위 줄을 넘지 않게 멈춘다.
 * 내 줄은 바탕을 칠해 바로 찾게 한다.
 * 공부 중인 줄의 점은 색만으로 알리지 않도록 화면 낭독기에 글로 읽힌다.
 */
export function WeeklyRankCard({
  rows,
  elapsedSec,
}: {
  rows: WeeklyRankRow[];
  elapsedSec: number;
}) {
  const { t } = useTranslation("group-room");
  const titleId = useId();
  const shownSec = liveRankSeconds(rows, elapsedSec);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1 rounded-xl bg-muted px-3.5 pt-3.5 pb-2.5 shadow-sb-card"
    >
      <div className="flex items-center justify-between gap-3 px-0.5 pb-1">
        <h2 id={titleId} className="text-[15px] leading-5.5 font-bold text-foreground">
          {t("weeklyRankCard.title")}
        </h2>
        <p className="shrink-0 text-xs leading-4 text-muted-foreground">
          {t("weeklyRankCard.resetNote")}
        </p>
      </div>
      <ol className="flex flex-col gap-1">
        {rows.map((row, index) => (
          <li
            key={row.userId}
            data-me={row.isMe || undefined}
            className={cn(
              "flex min-h-9.5 items-center gap-2.5 rounded-md px-1.5",
              row.isMe && "bg-brand-subtle",
            )}
          >
            <span
              className={cn(
                "w-4.5 shrink-0 text-center text-[13px] leading-4 font-bold tabular-nums",
                row.isMe && "text-foreground",
                !row.isMe && "text-muted-foreground",
              )}
            >
              {row.rank}
            </span>
            <RankAvatar nickname={row.nickname} me={row.isMe} size="xs" imageUrl={row.imageUrl} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm leading-4.5 text-foreground",
                row.isMe && "font-bold",
                !row.isMe && "font-semibold",
              )}
            >
              {row.nickname}
            </span>
            {row.accumulating && (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-feedback-success"
                />
                <span className="sr-only">{t("weeklyRankCard.studying")}</span>
              </>
            )}
            <span className="shrink-0 text-sm leading-4.5 font-bold text-foreground tabular-nums">
              {formatClock(shownSec[index] ?? row.weeklyStudySec)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
