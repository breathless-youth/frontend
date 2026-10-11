import type { MedalRank, RankingRecord, RankingRecordsSummary } from "@focusmakers/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cannotLoad, rankingRecordsQuery, rankingSummaryQuery } from "@/lib/rankingQueries";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

import { IconCrownOutline, IllustMedal } from "../icons";
import {
  formatGapDuration,
  recordName,
  recordPeriod,
  recordPeriodShort,
  recordValue,
} from "../model/format";
import { CHIP_CLASS } from "./BoardSwitcher";
import { FocusStartButton } from "./RankCard";

export type RankChip = "all" | MedalRank;

const SHEET_SIZE = 6;

/**
 * 전체·1위·2위·3위 칩
 *
 * 랭킹 기록 시트와 모두 보기가 같이 쓴다.
 */
export function RankChips({
  value,
  onChange,
  className,
}: {
  value: RankChip;
  onChange: (value: RankChip) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label="순위"
      value={String(value)}
      onValueChange={(next) => {
        if (next === "" || next === String(value)) {
          return;
        }
        onChange(next === "all" ? "all" : (Number(next) as MedalRank));
      }}
      className={cn("flex-nowrap gap-1.5", className)}
    >
      <ToggleGroupItem value="all" className={CHIP_CLASS}>
        전체
      </ToggleGroupItem>
      {([1, 2, 3] as const).map((rank) => (
        <ToggleGroupItem key={rank} value={String(rank)} className={cn(CHIP_CLASS, "gap-1.5 pl-3")}>
          <IllustMedal rank={rank} size={14} />
          {rank}위
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * 랭킹 기록 시트
 *
 * 전체는 요약의 최근 기록을 쓰고, 순위 칩은 그 순위 기록을 6개까지 따로 받는다.
 * 메달을 누르면 그 기록의 종목·기간·구간으로 지금 판을 연다(호출부가 판을 바꾸고 시트를 닫는다).
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 * 바탕은 카드 면 색이라 다크에서도 시안의 면 색이 된다.
 */
export function RecordsSheet({
  open,
  onOpenChange,
  userId,
  onPickRecord,
  onShowAll,
  onFocusStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  onPickRecord: (record: RankingRecord) => void;
  onShowAll: () => void;
  onFocusStart: () => void;
}) {
  const summary = useQuery(rankingSummaryQuery(userId));
  const [rank, setRank] = useState<RankChip>("all");
  const list = useInfiniteQuery({
    ...rankingRecordsQuery(userId, { rank: rank === "all" ? undefined : rank, size: SHEET_SIZE }),
    enabled: open && rank !== "all",
  });
  const focusRestore = useDialogFocusRestore();
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="bottom"
        // 열 때는 포커스가 있던 요소를 기억한다.
        // 터치로 연 시트의 첫 칩에 포커스 링이 남지 않게, 첫 요소 대신 시트 자체에 포커스를 주어 화면 낭독기도 시트 안에서 시작한다.
        // 닫을 때는 기억한 요소로 포커스를 돌려준다.
        onOpenAutoFocus={(event) => {
          focusRestore.onOpenAutoFocus();
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        aria-describedby={undefined}
        className="theme-soft-blue gap-0 rounded-t-[28px] border-t-0 bg-muted px-5 pt-3 pb-[max(36px,calc(env(safe-area-inset-bottom)+8px))]"
      >
        <span aria-hidden="true" className="mx-auto block h-[5px] w-10 rounded-[2.5px] bg-border" />
        {/* 다시 받다 실패해도 받아 둔 기록이 있으면 오류 대신 기록을 보인다. */}
        {summary.data === undefined ? (
          <>
            {/* 받기 전에는 시트 이름만 달고 제목 요소는 내용과 함께 그린다. */}
            <SheetTitle asChild className="sr-only">
              <span>랭킹 기록</span>
            </SheetTitle>
            {cannotLoad(summary) ? (
              <div className="mt-5">
                <ErrorState
                  message="랭킹 기록을 불러오지 못했어요"
                  onRetry={() => void summary.refetch()}
                  screen="ranking"
                />
              </div>
            ) : (
              <Skeleton className="mt-5 h-[300px] rounded-lg" />
            )}
          </>
        ) : summary.data.total === 0 ? (
          <EmptyRecords summary={summary.data} onFocusStart={onFocusStart} />
        ) : (
          <>
            <div className="flex items-baseline justify-between pt-3.5">
              <SheetTitle className="text-xl leading-6 font-extrabold tracking-normal text-foreground">
                랭킹 기록
              </SheetTitle>
              <p className="text-[13px] leading-[15px] text-muted-foreground">
                모두 {summary.data.total}번
              </p>
            </div>
            <RankChips value={rank} onChange={setRank} className="mt-3.5" />
            {rank === "all" ? (
              <RecordGrid items={summary.data.recent} onPick={onPickRecord} />
            ) : list.data !== undefined ? (
              <RecordGrid items={list.data.pages[0]?.items ?? []} onPick={onPickRecord} />
            ) : cannotLoad(list) ? (
              <div className="mt-3.5">
                <ErrorState
                  message="랭킹 기록을 불러오지 못했어요"
                  onRetry={() => void list.refetch()}
                  screen="ranking"
                />
              </div>
            ) : (
              <Skeleton className="mt-3.5 h-[224px] rounded-lg" />
            )}
            <Button
              variant="secondary"
              onClick={onShowAll}
              className="mt-3.5 h-[52px] w-full rounded-lg text-[15px] leading-[18px] font-bold"
            >
              {summary.data.total}개 모두 보기 ›
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecordGrid({
  items,
  onPick,
}: {
  items: readonly RankingRecord[];
  onPick: (record: RankingRecord) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-3.5 py-10 text-center text-sm text-muted-foreground">
        조건에 맞는 기록이 없어요
      </p>
    );
  }
  return (
    <ul className="mt-3.5 grid grid-cols-3 gap-2">
      {items.map((record) => (
        <li key={record.id}>
          <button
            type="button"
            onClick={() => onPick(record)}
            aria-label={`${record.rank}위 ${recordName(record)} ${recordPeriod(record)} ${recordValue(record)}`}
            className="flex min-h-[108px] w-full flex-col items-center rounded-lg bg-muted px-1 pt-3 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]"
          >
            <IllustMedal rank={record.rank} size={30} />
            <span className="mt-[5px] text-xs leading-[14px] font-extrabold text-foreground">
              {recordName(record)}
            </span>
            <span className="mt-[5px] text-[10px] leading-3 text-muted-foreground">
              {recordPeriod(record)}
            </span>
            <span className="mt-[5px] text-[11px] leading-[13px] font-extrabold text-primary tabular-nums">
              {recordValue(record)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyRecords({
  summary,
  onFocusStart,
}: {
  summary: RankingRecordsSummary;
  onFocusStart: () => void;
}) {
  const { best, closest } = summary;
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-bg-layer-2 text-text-tertiary">
        <IconCrownOutline />
      </span>
      <SheetTitle className="mt-2 text-xl leading-6 font-extrabold tracking-normal text-foreground">
        아직 TOP 3 기록이 없어요
      </SheetTitle>
      <p className="mt-2 text-[13px] leading-[15px] break-keep text-pretty text-muted-foreground">
        마감 때 3위 안에 든 랭킹판이 생기면 여기에 모여요
      </p>
      {(best !== null || closest !== null) && (
        <dl className="mt-4 w-full rounded-lg bg-bg-layer-2 px-4 text-left">
          {best !== null && (
            <div className="flex min-h-[49px] items-center justify-between gap-3 border-b border-border last:border-b-0">
              <dt className="text-[13px] leading-[15px] text-muted-foreground">
                지금까지 최고 순위
              </dt>
              <dd className="text-sm leading-4 font-extrabold text-foreground">
                {recordName(best)} {best.rank}위 · {recordPeriodShort(best)}
              </dd>
            </div>
          )}
          {closest !== null && (
            <div className="flex min-h-[49px] items-center justify-between gap-3">
              <dt className="text-[13px] leading-[15px] text-muted-foreground">
                TOP 3에 가장 가까운 판
              </dt>
              {/* 차이 0은 지금 30분 이상으로 3위 안이라는 뜻이라, 최소 1분으로 올린 `1분 차` 대신 TOP 3 안이라고 쓴다. */}
              <dd className="text-sm leading-4 font-extrabold text-foreground">
                {recordName(closest)}{" "}
                {closest.gap === 0 ? "지금 TOP 3 안" : `${formatGapDuration(closest.gap)} 차`}
              </dd>
            </div>
          )}
        </dl>
      )}
      <FocusStartButton onClick={onFocusStart} className="mt-3.5" />
    </div>
  );
}
