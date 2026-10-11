import type { RankingBoardResponse } from "@focusmakers/types";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { isOffSlot } from "../model/board";
import { formatGap, progressPercent } from "../model/format";
import { cardTitle } from "../model/labels";
import type { SubLine, SubLineTone } from "../model/live";

/**
 * 아랫줄 색과 굵기
 *
 * 경고 문구는 차분한 빨강을 쓰는 대신 굵기를 낮춰 카드에서 덜 튀게 한다.
 */
const TONE_CLASS: Record<SubLineTone, string> = {
  alert: "font-medium text-rank-alert",
  muted: "font-semibold text-muted-foreground",
};

/**
 * 채운 버튼의 포커스 링
 *
 * 링 색이 파란 채움과 비슷해 바깥으로 띄워야 보인다.
 * 띄운 틈은 버튼이 놓인 카드와 시트의 면 색으로 칠한다.
 */
const FILLED_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

/**
 * 랭킹 카드 틀
 *
 * 윗줄 왼쪽에 제목, 오른쪽에 마감이나 상위 %를 둔다.
 */
export function CardShell({
  title,
  titleClassName,
  aside,
  children,
}: {
  title: string;
  titleClassName?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-xl bg-muted p-[18px] shadow-sb-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id={titleId}
          className={cn(
            "text-[13px] leading-[15px] font-extrabold text-foreground",
            titleClassName,
          )}
        >
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Deadline({ text }: { text: string }) {
  return <p className="shrink-0 text-[13px] leading-[15px] text-muted-foreground">{text}</p>;
}

/**
 * 카드 오른쪽 아래의 작은 집중 시작 버튼
 *
 * 보이는 높이는 31px이고 누르는 영역은 위아래로 넓힌다.
 */
export function FocusStartPill({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      className={cn(
        "relative h-[31px] shrink-0 rounded-full bg-primary-deep px-2.5 text-[13px] leading-[15px] font-bold before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
        FILLED_FOCUS_RING,
      )}
    >
      집중 시작
    </Button>
  );
}

export function FocusStartButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      size="xl"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl text-[17px] leading-[21px] font-bold",
        FILLED_FOCUS_RING,
        className,
      )}
    >
      집중 시작
    </Button>
  );
}

/**
 * 순위 카드 아랫줄
 *
 * 문구에 든 줄바꿈 자리에서 줄을 바꾸되 글자는 한 덩어리로 둬 스크린리더가 한 문장으로 읽게 한다.
 */
export function SubLineText({ line, className }: { line: SubLine | null; className?: string }) {
  if (line === null) {
    return <span className={className} />;
  }
  return (
    <p
      className={cn(
        "min-w-0 text-[13px] leading-[15px] break-keep whitespace-pre-line text-pretty",
        TONE_CLASS[line.tone],
        className,
      )}
    >
      {line.text}
    </p>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 flex min-w-0 items-baseline text-2xl leading-8 font-extrabold tracking-[-0.7px] text-foreground">
      {children}
    </p>
  );
}

/**
 * 순위가 있는 판의 카드
 *
 * 위에는 다음 순위까지 남은 양과 진행바를 두고, 아래는 종목마다 다르다.
 * 가장 큰 글자에서 한 사람을 짚으면 불편할 수 있어 이름 없이 쓴다.
 * 순공·시간대는 아랫줄 문구와 집중 시작, 집중률은 따라잡기 문구, 누적은 다음 구간 상자다.
 * 지금 구간이 아닌 시간대 판은 지금 공부해도 이 판에 들어가지 않아 작은 집중 시작을 두지 않는다.
 */
export function RankedCard({
  board,
  aboveGap,
  subLine,
  deadline,
  serverNow,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  aboveGap: number | null;
  subLine: SubLine | null;
  deadline: string | null;
  serverNow: number;
  onFocusStart: () => void;
}) {
  const { above, me } = board;
  const gap = aboveGap ?? above?.gap ?? 0;
  const cumulative = board.type === "TOTAL_TIME" || board.type === "TOTAL_DAYS";
  const progressType = board.type === "MAX_STREAK" ? null : board.type;
  const canStart = !isOffSlot(board, serverNow);

  return (
    <CardShell
      title={cardTitle(board)}
      aside={
        cumulative && me !== null ? (
          <p className="shrink-0 text-[13px] leading-[15px] font-extrabold text-primary">
            상위 {me.topPercent}%
          </p>
        ) : (
          deadline !== null && <Deadline text={deadline} />
        )
      }
    >
      {above !== null && (
        <Headline>
          <span className="whitespace-pre">다음 순위까지 </span>
          <span className="text-primary">{formatGap(board.type, gap)}</span>
        </Headline>
      )}
      {progressType !== null && (
        <Progress
          value={progressPercent(progressType, gap)}
          aria-label="바로 위까지 가까운 정도"
          className="mt-2.5"
        />
      )}
      {board.type === "FOCUS_RATE" ? (
        <RateCatchUp board={board} />
      ) : cumulative ? (
        <NextTierBox board={board} />
      ) : (
        (subLine !== null || canStart) && (
          <div className="mt-3.5 flex min-h-[31px] items-center justify-between gap-3">
            {/* 버튼 옆 남은 폭을 다 써야 Safari가 닉네임 뒤에서 줄을 한 번 더 바꾸지 않는다. */}
            <SubLineText line={subLine} className="flex-1" />
            {canStart && <FocusStartPill onClick={onFocusStart} />}
          </div>
        )
      )}
    </CardShell>
  );
}

/**
 * 집중률 판의 따라잡기 문구
 *
 * 서버 값은 총공부 시간이 그대로라고 보고 센 순공이라 분으로 적으면 실제로 더 해야 할 공부보다 훨씬 적어 보여 숫자를 쓰지 않는다.
 */
function RateCatchUp({ board }: { board: RankingBoardResponse }) {
  if (board.above?.catchUpFocusSec == null) {
    return null;
  }
  return (
    <p className="mt-2.5 text-[13px] leading-[15px] break-keep text-pretty text-muted-foreground">
      조금만 더 집중하면 따라잡아요
    </p>
  );
}

function NextTierBox({ board }: { board: RankingBoardResponse }) {
  const tier = board.nextTier;
  if (tier === null || tier === undefined) {
    return null;
  }
  return (
    <div className="mt-2.5 rounded-md bg-bg-layer-2 px-3 py-2.5 text-[13px] leading-[15px] break-keep text-pretty">
      <p className="text-foreground">
        <strong className="font-bold">상위 {tier.percent}%</strong>까지{" "}
        {formatGap(board.type, tier.remaining)}
      </p>
      {tier.etaDays !== null && (
        <p className="mt-1 text-muted-foreground">지금 페이스면 약 {tier.etaDays}일 뒤</p>
      )}
    </div>
  );
}

/**
 * 내가 1위인 판의 카드
 *
 * 따라오는 사람 문구와 큰 집중 시작 버튼을 둔다.
 */
export function FirstPlaceCard({
  board,
  subLine,
  deadline,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  subLine: SubLine | null;
  deadline: string | null;
  onFocusStart: () => void;
}) {
  return (
    <CardShell title={cardTitle(board)} aside={deadline !== null && <Deadline text={deadline} />}>
      <p className="mt-2.5 text-2xl leading-8 font-extrabold tracking-[-0.7px] text-foreground">
        <span className="text-primary">1위</span> 지키는 중
      </p>
      <SubLineText line={subLine} className="mt-2.5" />
      <FocusStartButton onClick={onFocusStart} className="mt-3.5" />
    </CardShell>
  );
}
