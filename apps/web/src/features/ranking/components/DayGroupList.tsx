import type { RankingDayGroup } from "@focusmakers/types";

import { cn } from "@/lib/utils";

import type { DayBoardType } from "../model/board";
import { formatRank, formatValue } from "../model/format";
import { Nickname } from "./Nickname";

const LIST_LABEL: Record<DayBoardType, string> = {
  TOTAL_DAYS: "내 주변 누적 일수 순위",
  MAX_STREAK: "내 주변 연속 공부 순위",
};

/**
 * 일수 판의 내 주변 목록
 *
 * 누적 일수·연속 공부 판이 함께 쓰고, 목록 이름만 판에 따라 다르다.
 * 같은 일수끼리 한 줄로 묶고 순위, 이름, 일수만 쓴다.
 * 줄 간격은 50px이고 내 줄은 그 안에 42px 알약으로 칠한다.
 * 이름은 한 줄이라 알약 가운데에 맞춘다.
 * 순위 칸은 가장 긴 순위의 글자 수만큼 넓히고, 한 자리여도 시안처럼 24px은 둔다.
 */
export function DayGroupList({
  type,
  groups,
}: {
  type: DayBoardType;
  groups: readonly RankingDayGroup[];
}) {
  const rankWidth = `${Math.max(1, ...groups.map((group) => formatRank(group.rank).length))}ch`;
  return (
    <section aria-label={LIST_LABEL[type]} className="rounded-xl bg-muted px-2 py-1 shadow-sb-card">
      <ol>
        {groups.map((group) => (
          <li
            key={group.days}
            aria-current={group.me ? "true" : undefined}
            className="flex min-h-[50px] items-center py-1"
          >
            <div
              className={cn(
                "flex min-h-[42px] w-full items-center gap-3 rounded-[14px] px-3.5",
                group.me && "bg-primary-deep text-primary-foreground",
              )}
            >
              <span
                className={cn(
                  "min-w-6 shrink-0 text-[13px] leading-[15px] font-extrabold tabular-nums",
                  !group.me && "text-text-tertiary",
                )}
                style={{ width: rankWidth }}
              >
                {formatRank(group.rank)}
              </span>
              <span
                className={cn(
                  "flex min-w-0 flex-1 text-sm leading-4",
                  group.me ? "font-extrabold" : "font-semibold text-foreground",
                )}
              >
                <Nickname name={group.nickname} className="min-w-0" />
                {group.othersCount > 0 && (
                  <span className="shrink-0 whitespace-pre">
                    {" "}
                    외 {formatRank(group.othersCount)}명
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[13px] leading-[15px] font-bold tabular-nums",
                  !group.me && "text-muted-foreground",
                )}
              >
                {formatValue(type, group.days)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
