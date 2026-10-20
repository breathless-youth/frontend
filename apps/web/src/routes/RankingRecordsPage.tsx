import type { RankingRecord, RankingRecordType, RankingRecordsSummary } from "@focusmakers/types";
import { focusManager, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useLocation, useNavigate } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { RankChips, type RankChip } from "@/features/ranking/components/RankChips";
import { IllustCrown, IllustMedal } from "@/features/ranking/icons";
import { selectionOfRecord } from "@/features/ranking/model/board";
import { requestBoard, takeRecordsPageRequest } from "@/features/ranking/model/boardMemory";
import { recordName, recordPeriod, recordValue } from "@/features/ranking/model/format";
import { groupRecordsByMonth } from "@/features/ranking/model/records";
import { useNow } from "@/features/ranking/useNow";
import { IconChevronDown } from "@/features/records/icons";
import { trackRankingRecordTapped } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { cannotLoad, rankingRecordsQuery, rankingSummaryQuery } from "@/lib/rankingQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";

const PAGE_SIZE = 20;

type TypeFilter = "all" | RankingRecordType;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "모든 종목" },
  { value: "FOCUS_TIME", label: "순공" },
  { value: "FOCUS_RATE", label: "집중률" },
  { value: "TIME_SLOT", label: "시간대" },
];

/**
 * 랭킹 기록 모두 보기
 *
 * 탭 웹뷰 안에서 열리는 전체 화면이라 뒤로 가기는 히스토리가 있으면 뒤로, 없으면 랭킹 탭으로 바꿔 끼운다.
 * 메달을 누르면 그 판을 넘겨주고 같은 방식으로 돌아간다.
 * 첫 토큰을 기다리는 동안은 자리표시를 보인다.
 */
export function RankingRecordsPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const navigate = useNavigate();
  const location = useLocation();

  // 이미 모두 보기에 있으면 넘겨받은 요청을 버린다.
  // 남겨 두면 랭킹 탭으로 돌아간 뒤 모두 보기가 다시 열린다.
  useEffect(() => {
    takeRecordsPageRequest();
    return focusManager.subscribe((focused) => {
      if (focused) {
        takeRecordsPageRequest();
      }
    });
  }, []);

  const goBack = () =>
    slideNavigate("back", () => {
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      navigate({ pathname: "/ranking", search: location.search }, { replace: true });
    });

  return (
    <main className="theme-soft-blue min-h-dvh bg-soft-blue page-column pb-10 text-foreground">
      <ScreenBackHeader title="랭킹 기록" onBack={goBack} />
      {identityPending ? (
        <div className="flex flex-col px-5 pt-4">
          <Skeleton className="h-[153px] rounded-xl" />
          <Skeleton className="mt-3.5 h-[220px] rounded-xl" />
        </div>
      ) : userId === null ? (
        <p className="p-4 text-sm text-muted-foreground">
          기기 등록 전이에요. 앱에서 열면 기록이 저장돼요
        </p>
      ) : (
        <AllRecords userId={userId} onPicked={goBack} />
      )}
    </main>
  );
}

function AllRecords({ userId, onPicked }: { userId: number; onPicked: () => void }) {
  const summary = useQuery(rankingSummaryQuery(userId));
  const [rank, setRank] = useState<RankChip>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const list = useInfiniteQuery(
    rankingRecordsQuery(userId, {
      rank: rank === "all" ? undefined : rank,
      type: type === "all" ? undefined : type,
      size: PAGE_SIZE,
    }),
  );
  const { ref, inView } = useInView({ rootMargin: "200px 0px" });
  const { hasNextPage, isFetching, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = list;

  // 다음 페이지가 실패해도 끝 감시 요소는 보이는 채라 오류 상태에서 다시 부르면 요청이 끝없이 이어진다.
  // 받는 중에는 부르지 않아 뒤에서 도는 새로 받기를 끊지 않는다.
  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);

  const now = useNow(null);
  const currentYear = Number(new Date(now + 9 * 3_600_000).toISOString().slice(0, 4));
  const groups = groupRecordsByMonth(
    list.data?.pages.flatMap((page) => page.items) ?? [],
    currentYear,
  );

  // 요약 카드는 실패하면 빠지고 다시 시도 버튼이 따로 없어서, 목록의 다시 시도가 요약도 함께 다시 받는다.
  const retryList = () => {
    if (cannotLoad(summary)) {
      void summary.refetch();
    }
    void list.refetch();
  };

  const pick = (record: RankingRecord) => {
    trackRankingRecordTapped({
      rank: record.rank,
      type: record.type,
      period: record.period,
      from: "all",
    });
    requestBoard(selectionOfRecord(record));
    onPicked();
  };

  return (
    <div className="flex flex-col px-5 pt-4">
      {/* 요약을 못 받으면 카드를 빼고 목록만 보인다. */}
      {summary.data !== undefined ? (
        <SummaryCard summary={summary.data} />
      ) : cannotLoad(summary) ? null : (
        <Skeleton className="h-[153px] rounded-xl" />
      )}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <RankChips value={rank} onChange={setRank} />
        <TypeFilterMenu value={type} onChange={setType} />
      </div>
      {/* 다시 받기가 실패해도 받아 둔 목록을 그대로 보이고, 오류는 목록이 없을 때만 보인다. */}
      {list.data === undefined ? (
        cannotLoad(list) ? (
          <div className="mt-3.5">
            <ErrorState
              message="랭킹 기록을 불러오지 못했어요"
              onRetry={retryList}
              screen="ranking"
            />
          </div>
        ) : (
          <Skeleton className="mt-3.5 h-[220px] rounded-xl" />
        )
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">조건에 맞는 기록이 없어요</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`ranking-month-${group.key}`}
            className="mt-3.5"
          >
            <h2
              id={`ranking-month-${group.key}`}
              className="px-0.5 pb-1.5 text-[13px] leading-[15px] font-bold text-muted-foreground"
            >
              {group.label}
            </h2>
            <ul className="rounded-xl bg-muted py-0.5 shadow-sb-card">
              {group.items.map((record) => (
                <RecordRow key={record.id} record={record} onPick={pick} />
              ))}
            </ul>
          </section>
        ))
      )}
      {/* 자리표시 아래에 두면 첫 페이지가 오는 순간 끝이 보이는 것으로 남아 다음 페이지를 바로 부르므로, 목록을 그린 뒤에만 둔다. */}
      {groups.length > 0 && <div ref={ref} aria-hidden="true" className="h-px" />}
      {/* 다시 받는 동안에도 오류 표시가 남아 있으므로 받는 중 표시를 먼저 본다. */}
      {isFetchingNextPage ? (
        <Skeleton className="mt-3 h-[53px] rounded-xl" />
      ) : isFetchNextPageError ? (
        <div className="mt-3">
          <ErrorState
            message="랭킹 기록을 불러오지 못했어요"
            onRetry={() => void fetchNextPage()}
            screen="ranking"
          />
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ summary }: { summary: RankingRecordsSummary }) {
  const counts = [
    [1, summary.firstCount],
    [2, summary.secondCount],
    [3, summary.thirdCount],
  ] as const;
  return (
    <section aria-label="지금까지 TOP 3" className="rounded-xl bg-muted p-[18px] shadow-sb-card">
      <p className="flex items-center gap-1.5 text-[13px] leading-[15px] font-bold text-muted-foreground">
        <IllustCrown width={16} height={11} />
        지금까지 TOP 3
      </p>
      <p className="mt-1.5 font-extrabold tracking-[-0.8px] text-foreground">
        <span className="text-[40px] leading-[44px]">{summary.total}</span>
        <span className="text-xl leading-[44px]">번</span>
      </p>
      <ul className="mt-3 grid grid-cols-3 border-t border-bg-layer-2 pt-3">
        {counts.map(([rank, count]) => (
          <li
            key={rank}
            aria-label={`${rank}위 ${count}번`}
            className="flex items-center justify-center gap-1.5"
          >
            <IllustMedal rank={rank} size={20} />
            <span
              aria-hidden="true"
              className="text-[17px] leading-5 font-black text-foreground tabular-nums"
            >
              {count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 종목 거르기 메뉴
 *
 * 보이는 높이는 칩과 같은 31px이고 누르는 영역은 위아래로 넓힌다.
 */
function TypeFilterMenu({
  value,
  onChange,
}: {
  value: TypeFilter;
  onChange: (value: TypeFilter) => void;
}) {
  const label = TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "모든 종목";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`종목: ${label}`}
          className="relative flex h-[31px] shrink-0 items-center gap-1 text-[13px] leading-[15px] font-bold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
        >
          {label}
          <IconChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      {/* 메뉴는 body로 나가므로 Soft Blue 테마를 메뉴에도 단다. */}
      <DropdownMenuContent align="end" className="theme-soft-blue">
        {TYPE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="min-h-11"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 달별 목록의 한 줄
 *
 * 줄 사이 구분선은 시안처럼 양옆을 14px씩 띄운다.
 */
function RecordRow({
  record,
  onPick,
}: {
  record: RankingRecord;
  onPick: (record: RankingRecord) => void;
}) {
  return (
    <li className="group">
      <button
        type="button"
        onClick={() => onPick(record)}
        aria-label={`${record.rank}위 ${recordName(record)} ${recordPeriod(record)} ${recordValue(record)}`}
        className="flex min-h-[53px] w-full items-center gap-3 px-[18px] text-left"
      >
        <IllustMedal rank={record.rank} size={24} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-4 font-bold text-foreground">{recordName(record)}</span>
          <span className="mt-0.5 text-[11px] leading-[13px] text-muted-foreground">
            {recordPeriod(record)}
          </span>
        </span>
        <span className="shrink-0 text-sm leading-4 font-extrabold text-primary tabular-nums">
          {recordValue(record)}
        </span>
      </button>
      <span aria-hidden="true" className="mx-3.5 block h-px bg-bg-layer-2 group-last:hidden" />
    </li>
  );
}
