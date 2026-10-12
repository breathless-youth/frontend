import type { RankingBoardResponse } from "@focusmakers/types";
import { Lock } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/features/records/recordsFormat";

import { formatGapDuration } from "../model/format";
import { cardTitle, periodWord } from "../model/labels";
import { CardShell, Deadline, FocusStartPill } from "./RankCard";

/**
 * 기간에 세션이 없어 참가 정보가 비었을 때 쓰는 참가 조건(초).
 * 서버 집계 규칙과 같다.
 */
const REQUIRED_FOCUS_SEC = { WEEKLY: 36_000, MONTHLY: 108_000 } as const;

/**
 * 집중률 참가 미달 카드
 *
 * 참가까지 남은 순공과 채운 정도를 보이고, 예상 순위가 1~3위이거나 서버가 예상 상위 %를 주면 예상 줄을 단다.
 * 예상 순위가 1~3위면 상위 %가 없어도 순위로 쓰는데, 참가자가 적으면 1위도 상위 100%처럼 어색하게 읽혀서다.
 * 그 밖에는 상위 %로 쓰고, 상위 %도 없으면 줄을 뺀다.
 */
export function IneligibleCard({
  board,
  deadline,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  deadline: string | null;
  onFocusStart: () => void;
}) {
  const period = board.period === "MONTHLY" ? "MONTHLY" : "WEEKLY";
  const eligibility = board.eligibility ?? null;
  const required = eligibility?.requiredFocusSec ?? REQUIRED_FOCUS_SEC[period];
  const focusSec = eligibility?.focusSec ?? 0;
  const topPercent = eligibility?.expectedTopPercent ?? null;
  const expectedRank = eligibility?.expectedRank ?? null;
  const expectation =
    expectedRank !== null && expectedRank >= 1 && expectedRank <= 3
      ? `${expectedRank}위예요`
      : topPercent !== null
        ? `상위 ${topPercent}%예요`
        : null;

  return (
    <CardShell
      title={cardTitle(board)}
      // 아랫줄 버튼이 카드 바닥에 붙어 보이게 아래 여백을 줄인다.
      className="pb-2.5"
      aside={deadline !== null && <Deadline text={deadline} />}
    >
      <p className="mt-2.5 text-2xl leading-8 font-extrabold tracking-[-0.7px] text-foreground">
        참가까지{" "}
        <span className="text-primary">{formatGapDuration(Math.max(0, required - focusSec))}</span>
      </p>
      <Progress
        value={Math.min(100, Math.round((focusSec / required) * 100))}
        aria-label="참가 조건까지 채운 정도"
        className="mt-2.5"
      />
      <div className="mt-2.5 flex justify-between gap-3 text-xs leading-[14px] break-keep text-pretty text-muted-foreground">
        <span>
          {periodWord(period)} 순공 {formatDuration(focusSec)}
        </span>
        <span>{formatDuration(required)}</span>
      </div>
      <div className="mt-2.5 flex min-h-[31px] items-center justify-between gap-3">
        {expectation !== null ? (
          <p className="text-[13px] leading-[15px] font-semibold break-keep text-pretty text-primary">
            현재 집중률이면 {expectation}
          </p>
        ) : (
          <span />
        )}
        <FocusStartPill onClick={onFocusStart} />
      </div>
    </CardShell>
  );
}

/** 참가 전에는 내 앞뒤 순위 대신 보이는 잠긴 카드. */
export function LockedListCard() {
  return (
    <section
      aria-label="내 앞뒤 순위"
      className="flex min-h-[162px] flex-col items-center justify-center gap-2 rounded-xl bg-muted shadow-sb-card"
    >
      <Lock size={22} strokeWidth={1.8} aria-hidden="true" className="text-brand-subtle-text" />
      <p className="text-sm leading-4 font-bold text-brand-subtle-text">
        참가하면 내 앞뒤 순위가 보여요
      </p>
    </section>
  );
}
