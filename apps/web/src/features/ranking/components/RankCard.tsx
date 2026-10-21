import type { RankingBoardResponse } from "@focusmakers/types";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isOffSlot } from "../model/board";
import { formatGap, formatRank } from "../model/format";
import { cardTitle, slotName } from "../model/labels";
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
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

/**
 * 랭킹 카드 틀
 *
 * 윗줄 왼쪽에 제목, 오른쪽에 마감이나 상위 %를 둔다.
 */
export function CardShell({
  title,
  titleClassName,
  className,
  aside,
  children,
}: {
  title: string;
  titleClassName?: string;
  className?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn("rounded-xl bg-muted px-4.5 pt-3.5 pb-2.5 shadow-sb-card", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id={titleId}
          className={cn("text-[13px] leading-3.75 font-extrabold text-foreground", titleClassName)}
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
  return <p className="shrink-0 text-[13px] leading-3.75 text-muted-foreground">{text}</p>;
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
        "relative h-7.75 shrink-0 rounded-full bg-primary-deep px-2.5 text-[13px] leading-3.75 font-bold before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
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
        "w-full rounded-xl text-[17px] leading-5.25 font-bold",
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
 * 한 줄에 들어가는 문구를 톤에 맞는 색으로 그린다.
 */
export function SubLineText({ line, className }: { line: SubLine | null; className?: string }) {
  if (line === null) {
    return <span className={className} />;
  }
  return (
    <p
      className={cn(
        "min-w-0 text-[13px] leading-3.75 break-keep text-pretty",
        TONE_CLASS[line.tone],
        className,
      )}
    >
      {line.text}
    </p>
  );
}

/**
 * 아랫줄과 작은 집중 시작
 *
 * 버튼을 아랫줄 오른쪽 끝에 두고 이 줄을 큰 글자 바로 아래에 붙인다.
 * 버튼이 아랫줄보다 높아 따로 띄우지 않아도 아랫줄이 큰 글자와 8px쯤 떨어진다.
 * 글자를 키운 기기에서 아랫줄이 두 줄로 넘어가도 큰 글자에 붙지 않게 아랫줄 위아래에 4px을 둔다.
 */
export function FocusStartRow({
  children,
  onFocusStart,
}: {
  children: ReactNode;
  onFocusStart: () => void;
}) {
  return (
    <div className="flex min-h-7.75 items-center justify-between gap-2">
      <div className="min-w-0 flex-1 py-1">{children}</div>
      <FocusStartPill onClick={onFocusStart} />
    </div>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex min-w-0 items-baseline text-2xl leading-7 font-extrabold tracking-[-0.7px] text-foreground">
      {children}
    </p>
  );
}

/**
 * 순위가 있는 판의 카드
 *
 * 위에는 다음 순위까지 남은 양을 두고, 아래는 종목마다 다르다.
 * 가장 큰 글자에서 한 사람을 짚으면 불편할 수 있어 이름 없이 쓴다.
 * 순공·시간대는 아랫줄 문구와 집중 시작, 집중률은 따라잡기 문구와 집중 시작, 누적은 다음 구간 상자다.
 * 지금 구간이 아닌 시간대 판은 지금 공부해도 이 판에 들어가지 않아 줄일 수 없는 차이 대신 이 판의 내 순위를 쓰고 집중 시작을 두지 않는다.
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
  const offSlot = isOffSlot(board, serverNow);

  return (
    <CardShell
      title={cardTitle(board)}
      aside={
        cumulative && me !== null ? (
          <p className="shrink-0 text-[13px] leading-3.75 font-extrabold text-primary">
            상위 {me.topPercent}%
          </p>
        ) : (
          deadline !== null && <Deadline text={deadline} />
        )
      }
    >
      {offSlot && me !== null ? (
        <Headline>
          <span className="whitespace-pre">{`${slotName(board)} `}</span>
          <span className="text-primary">{formatRank(me.rank)}위</span>
        </Headline>
      ) : (
        above !== null && (
          <Headline>
            <span className="whitespace-pre">다음 순위까지 </span>
            <span className="text-primary">{formatGap(board.type, gap)}</span>
          </Headline>
        )
      )}
      {board.type === "FOCUS_RATE" ? (
        <FocusStartRow onFocusStart={onFocusStart}>
          <RateCatchUp board={board} />
        </FocusStartRow>
      ) : cumulative ? (
        <NextTierBox board={board} />
      ) : offSlot ? (
        <SubLineText line={subLine} className="mt-1" />
      ) : (
        <FocusStartRow onFocusStart={onFocusStart}>
          <SubLineText line={subLine} />
        </FocusStartRow>
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
    <p className="text-[13px] leading-3.75 break-keep text-pretty text-muted-foreground">
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
    <div className="mt-2 rounded-md bg-bg-layer-2 px-3 py-2.5 text-[13px] leading-3.75 break-keep text-pretty">
      <p className="text-foreground">
        <strong className="font-bold">상위 {tier.percent}%</strong>까지{" "}
        {formatGap(board.type, tier.remaining)} 남았어요
      </p>
      {tier.etaDays !== null && (
        <p className="mt-1 text-muted-foreground">
          지금 페이스면 약 {tier.etaDays}일 뒤에 역전해요
        </p>
      )}
    </div>
  );
}

/**
 * 내가 1위인 판의 카드
 *
 * 2위와의 차이나 따라오는 사람 문구 옆에 작은 집중 시작을 둔다.
 * 지금 구간이 아닌 시간대 판은 지금 공부해도 이 판에 들어가지 않아 집중 시작을 두지 않는다.
 */
export function FirstPlaceCard({
  board,
  subLine,
  deadline,
  serverNow,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  subLine: SubLine | null;
  deadline: string | null;
  serverNow: number;
  onFocusStart: () => void;
}) {
  return (
    <CardShell title={cardTitle(board)} aside={deadline !== null && <Deadline text={deadline} />}>
      <p className="mt-2 text-2xl leading-7 font-extrabold tracking-[-0.7px] text-foreground">
        <span className="text-primary">1위</span> 지키는 중
      </p>
      {isOffSlot(board, serverNow) ? (
        <SubLineText line={subLine} className="mt-1" />
      ) : (
        <FocusStartRow onFocusStart={onFocusStart}>
          <SubLineText line={subLine} />
        </FocusStartRow>
      )}
    </CardShell>
  );
}
