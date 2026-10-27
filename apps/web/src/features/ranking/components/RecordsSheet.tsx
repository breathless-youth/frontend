import type { RankingRecord, RankingRecordsSummary } from "@focusmakers/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cannotLoad, rankingRecordsQuery, rankingSummaryQuery } from "@/lib/rankingQueries";

import { IllustMedal } from "../icons";
import {
  formatGapDuration,
  recordName,
  recordPeriod,
  recordPeriodShort,
  recordValue,
} from "../model/format";
import { FocusStartButton } from "./RankCard";
import { RankChips, type RankChip } from "./RankChips";

const SHEET_SIZE = 6;

/**
 * 랭킹 기록 시트
 *
 * 전체는 요약의 최근 기록을 쓰고, 순위 칩은 그 순위 기록을 6개까지 따로 받는다.
 * 메달을 누르면 그 기록의 종목·기간·구간으로 지금 판을 연다(호출부가 판을 바꾸고 시트를 닫는다).
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="theme-soft-blue">
        {/* 시안의 아래 여백(36px)이 공용 시트 기본값보다 8px 커서 내용 아래에 그만큼 더한다. */}
        <div className="mb-2">
          {/* 다시 받다 실패해도 받아 둔 기록이 있으면 오류 대신 기록을 보인다. */}
          {summary.data === undefined ? (
            <>
              {/* 받기 전에는 시트 이름만 달고 제목 요소는 내용과 함께 그린다. */}
              <DrawerTitle render={<span />} className="sr-only">
                랭킹 기록
              </DrawerTitle>
              {cannotLoad(summary) ? (
                <div data-base-ui-swipe-ignore="" className="mt-5">
                  <ErrorState
                    message="랭킹 기록을 불러오지 못했어요"
                    onRetry={() => void summary.refetch()}
                    screen="ranking"
                  />
                </div>
              ) : (
                <Skeleton className="mt-5 h-75 rounded-lg" />
              )}
            </>
          ) : summary.data.total === 0 ? (
            <EmptyRecords summary={summary.data} onFocusStart={onFocusStart} />
          ) : (
            <>
              <div className="flex items-baseline justify-between pt-3.5">
                <DrawerTitle className="text-xl leading-6 font-extrabold tracking-normal text-foreground">
                  랭킹 기록
                </DrawerTitle>
                <p className="text-[13px] leading-3.75 text-muted-foreground">
                  모두 {summary.data.total}번
                </p>
              </div>
              {/* 시트 안 버튼은 끌기에서 뺀다. Base UI는 스크롤 없는 곳에서 손가락이 조금만 움직여도 바로 끌기로 잡아
                  iOS가 탭을 버린다. 버튼 위에서 시작한 끌기는 닫지 않고, 손잡이·제목·빈 곳에서는 그대로 끌어 닫힌다. */}
              <div data-base-ui-swipe-ignore="" className="mt-3.5">
                <RankChips value={rank} onChange={setRank} />
              </div>
              {rank === "all" ? (
                <RecordGrid items={summary.data.recent} onPick={onPickRecord} />
              ) : list.data !== undefined ? (
                <RecordGrid items={list.data.pages[0]?.items ?? []} onPick={onPickRecord} />
              ) : cannotLoad(list) ? (
                <div data-base-ui-swipe-ignore="" className="mt-3.5">
                  <ErrorState
                    message="랭킹 기록을 불러오지 못했어요"
                    onRetry={() => void list.refetch()}
                    screen="ranking"
                  />
                </div>
              ) : (
                <Skeleton className="mt-3.5 h-56 rounded-lg" />
              )}
              <Button
                data-base-ui-swipe-ignore=""
                variant="secondary"
                onClick={onShowAll}
                className="mt-3.5 h-13 w-full rounded-lg text-[15px] leading-4.5 font-bold"
              >
                {summary.data.total}개 모두 보기 ›
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
    <ul data-base-ui-swipe-ignore="" className="mt-3.5 grid grid-cols-3 gap-2">
      {items.map((record) => (
        <li key={record.id}>
          <button
            type="button"
            onClick={() => onPick(record)}
            aria-label={`${record.rank}위 ${recordName(record)} ${recordPeriod(record)} ${recordValue(record)}`}
            className="flex min-h-27 w-full flex-col items-center rounded-lg bg-muted px-1 pt-3 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--state-focus)"
          >
            <IllustMedal rank={record.rank} size={30} />
            <span className="mt-1.25 text-xs leading-3.5 font-extrabold text-foreground">
              {recordName(record)}
            </span>
            <span className="mt-1.25 text-[10px] leading-3 text-muted-foreground">
              {recordPeriod(record)}
            </span>
            <span className="mt-1.25 text-[11px] leading-3.25 font-extrabold text-primary tabular-nums">
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
      <DrawerTitle className="text-xl leading-6 font-extrabold tracking-normal text-foreground">
        아직 TOP 3 기록이 없어요
      </DrawerTitle>
      <p className="mt-2 text-[13px] leading-3.75 break-keep text-pretty text-muted-foreground">
        마감 때 3위 안에 든 랭킹판이 생기면 여기에 모여요
      </p>
      {(best !== null || closest !== null) && (
        <dl className="mt-4 w-full rounded-lg bg-bg-layer-2 px-4 text-left">
          {best !== null && (
            <div className="flex min-h-12.25 items-center justify-between gap-3 border-b border-border last:border-b-0">
              <dt className="text-[13px] leading-3.75 text-muted-foreground">지금까지 최고 순위</dt>
              <dd className="text-sm leading-4 font-extrabold text-foreground">
                {recordName(best)} {best.rank}위 · {recordPeriodShort(best)}
              </dd>
            </div>
          )}
          {closest !== null && (
            <div className="flex min-h-12.25 items-center justify-between gap-3">
              <dt className="text-[13px] leading-3.75 text-muted-foreground">
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
      <div data-base-ui-swipe-ignore="" className="mt-3.5">
        <FocusStartButton onClick={onFocusStart} />
      </div>
    </div>
  );
}
