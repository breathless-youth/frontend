import type { RankingBoardResponse } from "@focusmakers/types";

import { IllustFlame } from "@/features/records/icons";

import { IconTrophy } from "../icons";
import { formatMonthDay, formatRank } from "../model/format";
import { cardTitle } from "../model/labels";
import { CardShell } from "./RankCard";

function Days({ days }: { days: number }) {
  return (
    <span className="font-extrabold tracking-[-0.6px] text-foreground">
      <span className="text-[28px] leading-8">{days}</span>
      <span className="text-[15px]">일</span>
    </span>
  );
}

/**
 * 연속 공부 카드
 *
 * 최고 기록(기간 포함)과 지금 연속만 나란히 비교한다.
 * 지금이 최고 기록이면 비교 대신 내일 이어가면 오를 순위를 말한다.
 * 공동 순위라 내일 순위가 지금보다 앞서지 않을 수 있어, 그때는 순위 없이 내일 일수만 말한다.
 * 응답만으로는 오늘 공부했는지 알 수 없어 `오늘 공부하면 1일째`는 지금 0일일 때만 쓴다.
 */
export function StreakCard({ board }: { board: RankingBoardResponse }) {
  const streak = board.streak;
  if (streak === null || streak === undefined) {
    return <CardShell title={cardTitle(board)} />;
  }
  if (streak.currentIsBest) {
    const next = streak.nextRankIfContinue;
    const rises = next !== null && board.me !== null && next < board.me.rank;
    return (
      <CardShell title={cardTitle(board)}>
        <p className="mt-3 text-xl leading-7 font-extrabold text-foreground">
          지금이 최고 기록이에요
        </p>
        {next !== null && (
          <p className="mt-1.5 text-[13px] leading-[15px] font-semibold break-keep text-pretty text-muted-foreground">
            {rises
              ? `내일도 공부하면 최대 ${streak.maxDays + 1}일 · ${formatRank(next)}위로 올라가요`
              : `내일도 공부하면 최대 ${streak.maxDays + 1}일이에요`}
          </p>
        )}
      </CardShell>
    );
  }
  return (
    <CardShell title={cardTitle(board)}>
      <dl className="mt-3 grid grid-cols-2 divide-x divide-border">
        <div className="pr-4">
          <dt className="flex items-center gap-1 text-xs leading-[14px] font-bold text-primary">
            <IconTrophy size={13} />
            최고 기록
          </dt>
          <dd className="mt-0.5">
            <Days days={streak.maxDays} />
          </dd>
          {streak.maxStart !== null && streak.maxEnd !== null && (
            <dd className="mt-2 text-[11px] leading-[13px] text-muted-foreground">
              {formatMonthDay(streak.maxStart)} – {formatMonthDay(streak.maxEnd)}
            </dd>
          )}
        </div>
        <div className="pl-4">
          <dt className="flex items-center gap-1 text-xs leading-[14px] font-bold text-muted-foreground">
            <IllustFlame width={11} height={13} />
            지금
          </dt>
          <dd className="mt-0.5">
            <Days days={streak.currentDays} />
          </dd>
          {streak.currentDays === 0 && (
            <dd className="mt-2 text-[11px] leading-[13px] text-muted-foreground">
              오늘 공부하면 1일째
            </dd>
          )}
        </div>
      </dl>
      <p className="mt-3 rounded-md bg-bg-layer-2 px-3 py-2.5 text-[13px] leading-[19px] break-keep text-pretty text-foreground">
        <strong className="font-bold">{streak.maxDays + 1}일</strong>을 이어가면 최고 기록을 넘어요
      </p>
    </CardShell>
  );
}
