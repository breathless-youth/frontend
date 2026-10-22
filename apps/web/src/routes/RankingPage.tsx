import type { RankingBoardResponse } from "@focusmakers/types";
import { focusManager, useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFocusStart } from "@/features/onboarding/useFocusStart";
import { AroundList } from "@/features/ranking/components/AroundList";
import { BoardModeTabs, BoardSwitcher } from "@/features/ranking/components/BoardSwitcher";
import { IneligibleCard, LockedListCard } from "@/features/ranking/components/EligibilityCard";
import {
  FirstCard,
  GoalExamplesCard,
  PreviousResultCard,
  ResetCard,
} from "@/features/ranking/components/EmptyStateCards";
import { MedalButton } from "@/features/ranking/components/MedalButton";
import { Podium } from "@/features/ranking/components/Podium";
import { FirstPlaceCard, RankedCard } from "@/features/ranking/components/RankCard";
import { StreakCard } from "@/features/ranking/components/StreakCard";
import { DayGroupList } from "@/features/ranking/components/DayGroupList";
import {
  boardKeyOf,
  boardParams,
  currentSlot,
  isDayType,
  isLiveBoard,
  selectSlot,
  selectionOfRecord,
  type BoardSelection,
} from "@/features/ranking/model/board";
import {
  activeSelection,
  mergeOnFocus,
  readBoardMemory,
  takeRecordsPageRequest,
  withSelection,
  writeBoardMemory,
} from "@/features/ranking/model/boardMemory";
import { formatDeadline, serverNowMs } from "@/features/ranking/model/format";
import {
  hasFocusing,
  interpolateRows,
  liveCapSec,
  liveGap,
  rankCardSubLine,
  type LiveRow,
  type SubLine,
} from "@/features/ranking/model/live";
import {
  aroundForScreen,
  aroundGroupsForScreen,
  classifyBoard,
  needsPreviousPeriod,
  viewStateOf,
  type BoardScreen,
} from "@/features/ranking/model/screenState";
import { useBoardLive } from "@/features/ranking/useBoardLive";
import { useNow } from "@/features/ranking/useNow";
import {
  trackRankingBoardViewed,
  trackRankingRecordTapped,
  trackRankingRecordsOpened,
  type FocusStartSource,
} from "@/lib/amplitude";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { slideNavigate } from "@/lib/pageTransition";
import { cannotLoad, rankingBoardQuery, rankingSummaryQuery } from "@/lib/rankingQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { whenIdle } from "@/lib/whenIdle";

/**
 * 랭킹 기록 시트는 시트 부품(Base UI)과 함께 따로 받는다.
 * 랭킹 탭은 첫 번들에 들어가므로 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const { LazySheet: LazyRecordsSheet, preload: preloadRecordsSheet } = lazyWithPreload(() =>
  import("@/features/ranking/components/RecordsSheet").then((module) => module.RecordsSheet),
);

/**
 * 판 자리표시
 *
 * 앱 셸의 `RankingTabSkeleton`과 같은 높이다.
 */
function BoardSkeleton() {
  return (
    <>
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-39.5 rounded-xl" />
      <Skeleton className="h-65.5 rounded-xl" />
    </>
  );
}

/**
 * 랭킹 탭
 *
 * 첫 토큰을 기다리는 동안은 자리표시를, 기기 등록 전이면 안내를 보인다(기록 탭과 같은 문구).
 * 세로 간격의 값과 이유는 랭킹 탭 본문에서 간격을 정하는 곳에 적는다.
 * 자리표시는 기본 판(순공 주간)의 간격을 따른다.
 */
export function RankingPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();

  return (
    <main
      data-testid="ranking-page"
      className="theme-soft-blue min-h-dvh bg-soft-blue page-column pt-[calc(env(safe-area-inset-top)+24px)] pb-(--tab-bar-reserve) text-foreground"
    >
      <h1 className="sr-only">랭킹</h1>
      <div className="flex flex-col px-5">
        {identityPending ? (
          <>
            <div className="flex h-7.25 items-center justify-between">
              <Skeleton className="h-7.25 w-40 rounded-md" />
              <Skeleton className="h-7 w-19 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-7.75 w-44 rounded-full" />
            <Skeleton className="mt-2 h-9 rounded-[12px]" />
            <div className="mt-3 flex flex-col gap-3">
              <BoardSkeleton />
            </div>
          </>
        ) : userId === null ? (
          <p className="p-4 text-sm text-muted-foreground">
            기기 등록 전이에요. 앱에서 열면 기록이 저장돼요
          </p>
        ) : (
          <RankingContent userId={userId} />
        )}
      </div>
    </main>
  );
}

/**
 * 랭킹 탭 본문
 *
 * 마지막 판을 기억에서 열고 바꿀 때마다 다시 적는다.
 * 다시 보일 때 기억을 읽어 다른 화면이 넘겨준 판을 연다.
 * 순공·시간대 판은 보이는 동안 1초 tick으로 집중 중인 값을 올리고, 폴링 사이에 내 순위가 내려갔는지 비교한다.
 */
function RankingContent({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const visible = useScreenVisible();
  const startFocus = useFocusStart(userId);
  const [memory, setMemory] = useState(readBoardMemory);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    whenIdle(preloadRecordsSheet);
  }, []);
  const selection = activeSelection(memory);
  const openRecordsPage = () =>
    slideNavigate("forward", () =>
      navigate({ pathname: "/ranking/records", search: location.search }),
    );

  /**
   * 넘겨받은 모두 보기 요청
   *
   * 다른 화면이 모두 보기를 열어 달라고 했으면 한 번만 연다.
   * 판 기억을 다시 적으면 요청이 지워지므로, 마운트 때는 기억을 적는 effect보다 먼저 선언하고 포커스 때도 적기 전에 꺼낸다.
   */
  const openRequestedRecords = useEffectEvent(() => {
    if (takeRecordsPageRequest()) {
      openRecordsPage();
    }
  });

  useEffect(() => {
    openRequestedRecords();
  }, []);

  useEffect(() => {
    writeBoardMemory(memory);
  }, [memory]);

  useEffect(
    () =>
      focusManager.subscribe((focused) => {
        if (!focused) {
          return;
        }
        openRequestedRecords();
        // 읽기는 updater 밖에서 한 번만 한다(StrictMode가 updater를 두 번 불러도 같은 값이 들어간다).
        const stored = readBoardMemory();
        setMemory((current) => mergeOnFocus(current, stored));
        // 판이 그대로여도 다시 적어 넘겨받은 구간이 저장소에 남지 않게 한다.
        writeBoardMemory(stored);
      }),
    [],
  );

  const boardQuery = useQuery(rankingBoardQuery(userId, boardParams(selection)));
  const board = boardQuery.data;
  const boardUpdatedAt = boardQuery.dataUpdatedAt;
  const wantsPrevious = board !== undefined && needsPreviousPeriod(board);
  // 지금 구간으로 연 시간대 판은 응답이 알려 준 구간으로 직전 기간을 받아 두 카드가 같은 구간을 보게 한다.
  const previousSelection =
    board !== undefined && board.slot !== null ? selectSlot(selection, board.slot) : selection;
  const previousQuery = useQuery({
    ...rankingBoardQuery(userId, boardParams(previousSelection, -1)),
    enabled: wantsPrevious,
  });
  // 직전 기간을 못 받으면 오프라인으로 멈춘 경우까지 직전 결과 없이 화면을 정해, 카드 자리가 불러오는 중에 머물지 않게 한다.
  const previousSettled = !wantsPrevious || previousQuery.isSuccess || cannotLoad(previousQuery);
  const screen: BoardScreen | null =
    board !== undefined && previousSettled
      ? classifyBoard(board, previousQuery.data ?? null)
      : null;

  const live = isLiveBoard(selection);
  const ticking = visible && live && board !== undefined && hasFocusing(board);
  const now = useNow(visible ? (ticking ? 1000 : 60_000) : null);
  // 보간은 마감 시각과 시간대 구간이 끝나는 시각을 넘지 않는다.
  const elapsedSec =
    live && board !== undefined
      ? Math.min(Math.max(0, Math.floor((now - boardUpdatedAt) / 1000)), liveCapSec(board))
      : 0;
  // 지금 구간 표시, 마감, 지금 구간이 아닌 판의 문구가 모두 서버 기준 시각을 쓰게 한다.
  // 첫 응답 전에는 기기 시각을 쓴다.
  const serverNow = board === undefined ? now : serverNowMs(board.asOf, boardUpdatedAt, now);
  const boardKey = boardKeyOf(selection, board?.slot ?? null);
  const tracked = useBoardLive({
    key: boardKey,
    visible,
    board: live ? board : undefined,
    updatedAt: boardUpdatedAt,
  });

  const summary = useQuery(rankingSummaryQuery(userId));
  const total = summary.data?.total ?? null;

  const viewKey = visible && screen !== null ? boardKey : null;
  const logView = useEffectEvent(() => {
    if (board !== undefined && screen !== null) {
      trackRankingBoardViewed({
        type: board.type,
        period: board.period,
        slot: board.slot,
        state: viewStateOf(screen),
      });
    }
  });
  useEffect(() => {
    if (viewKey !== null) {
      logView();
    }
  }, [viewKey]);

  // 판 고르기와 시상대 간격
  // 종목 칸은 두 탭 모두 머리 줄 아래 12px에 두어, 랭킹과 명예의 전당을 오가도 제자리에 있게 한다.
  // 시상대는 판 고르기의 마지막 줄 아래 12px에 두어 아래 카드끼리의 간격 12px과 맞춘다.
  // 명예의 전당은 기간 칸이 없어 시상대가 그만큼 위에서 시작한다.
  const changeSelection = (next: BoardSelection) =>
    setMemory((current) => withSelection(current, next));

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <BoardModeTabs
          value={memory.active}
          onChange={(mode) => setMemory((current) => ({ ...current, active: mode }))}
        />
        <MedalButton
          total={total}
          onClick={() => {
            setSheetOpen(true);
            // 메달은 마감 때만 바뀌어 폴링하지 않고, 시트를 열 때 신선한 동안에도 한 번 더 받는다.
            // 받는 동안에는 받아 둔 기록을 그대로 보인다.
            void summary.refetch();
            trackRankingRecordsOpened(total);
          }}
        />
      </header>
      <BoardSwitcher
        selection={selection}
        resolvedSlot={board?.slot ?? null}
        nowSlot={currentSlot(serverNow)}
        onChange={changeSelection}
        className="mt-3"
      />
      <div className="mt-3 flex flex-col gap-3">
        {/* 폴링이 한 번 실패해도 받아 둔 판을 그대로 보이고, 오류는 판이 없을 때만 보인다. */}
        {board === undefined ? (
          cannotLoad(boardQuery) ? (
            <ErrorState
              message="랭킹을 불러오지 못했어요"
              onRetry={() => void boardQuery.refetch()}
              screen="ranking"
            />
          ) : (
            <BoardSkeleton />
          )
        ) : (
          <>
            <Podium board={board} elapsedSec={elapsedSec} />
            {screen === null ? (
              <Skeleton className="h-39.5 rounded-xl" />
            ) : (
              <BoardBody
                // 판을 바꾸면 카드와 목록을 새로 그려, 옛 판의 줄이 새 판의 줄 위에서 흐려지며 겹치지 않게 한다.
                key={boardKey}
                screen={screen}
                board={board}
                previous={previousQuery.data ?? null}
                rows={interpolateRows(board.around, elapsedSec)}
                aboveGap={liveGap(board.above, board.me?.focusing ?? false, elapsedSec, "above")}
                subLine={rankCardSubLine({
                  board,
                  belowGap: liveGap(board.below, board.me?.focusing ?? false, elapsedSec, "below"),
                  serverNow,
                })}
                drop={tracked.drop}
                deadline={formatDeadline(board, serverNow)}
                serverNow={serverNow}
                onFocusStart={startFocus}
                onShowRecords={openRecordsPage}
              />
            )}
          </>
        )}
      </div>
      <LazyRecordsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        userId={userId}
        onPickRecord={(record) => {
          trackRankingRecordTapped({
            rank: record.rank,
            type: record.type,
            period: record.period,
            from: "sheet",
          });
          changeSelection(selectionOfRecord(record));
          setSheetOpen(false);
        }}
        onShowAll={() => {
          setSheetOpen(false);
          openRecordsPage();
        }}
        onFocusStart={() => {
          setSheetOpen(false);
          startFocus("ranking_records");
        }}
      />
    </>
  );
}

/**
 * 화면 상태별 카드와 목록
 *
 * 화면 상태마다 카드와 목록 자리를 고른다.
 */
function BoardBody({
  screen,
  board,
  previous,
  rows,
  aboveGap,
  subLine,
  drop,
  deadline,
  serverNow,
  onFocusStart,
  onShowRecords,
}: {
  screen: BoardScreen;
  board: RankingBoardResponse;
  previous: RankingBoardResponse | null;
  rows: LiveRow[];
  aboveGap: number | null;
  subLine: SubLine | null;
  drop: number | null;
  deadline: string | null;
  serverNow: number;
  onFocusStart: (source: FocusStartSource) => void;
  onShowRecords: () => void;
}) {
  const fromCard = () => onFocusStart("ranking_card");
  const fromEmpty = () => onFocusStart("ranking_empty");
  switch (screen) {
    case "first_place":
      return (
        <>
          <FirstPlaceCard
            board={board}
            subLine={subLine}
            deadline={deadline}
            serverNow={serverNow}
            onFocusStart={fromCard}
          />
          <NearbyList board={board} screen={screen} rows={rows} drop={drop} />
        </>
      );
    case "ranked":
      return (
        <>
          <RankedCard
            board={board}
            aboveGap={aboveGap}
            subLine={subLine}
            deadline={deadline}
            serverNow={serverNow}
            onFocusStart={fromCard}
          />
          <NearbyList board={board} screen={screen} rows={rows} drop={drop} />
        </>
      );
    case "streak":
      return (
        <>
          <StreakCard board={board} />
          <DayGroupList type="MAX_STREAK" groups={board.aroundGroups ?? []} />
        </>
      );
    case "ineligible":
      return (
        <>
          <IneligibleCard board={board} deadline={deadline} onFocusStart={fromEmpty} />
          <LockedListCard />
        </>
      );
    case "reset":
      return (
        <>
          <ResetCard
            board={board}
            deadline={deadline}
            serverNow={serverNow}
            onFocusStart={fromEmpty}
          />
          {previous !== null && (
            <PreviousResultCard previous={previous} onShowRecords={onShowRecords} />
          )}
        </>
      );
    case "first":
      return (
        <>
          <FirstCard
            board={board}
            deadline={deadline}
            serverNow={serverNow}
            onFocusStart={fromEmpty}
          />
          <GoalExamplesCard
            examples={
              board.type === "FOCUS_TIME" && board.period === "WEEKLY"
                ? (board.goalExamples ?? [])
                : []
            }
          />
        </>
      );
  }
}

/**
 * 내 주변 목록
 *
 * 일수 판은 같은 일수끼리 공동 순위라 묶음 목록을 쓴다.
 * 일수 판의 `around`는 늘 빈 배열이라 묶음이 오지 않으면 빈 묶음으로 본다.
 * 1위 화면은 어느 목록이든 나와 뒤 2줄만 남긴다.
 */
function NearbyList({
  board,
  screen,
  rows,
  drop,
}: {
  board: RankingBoardResponse;
  screen: BoardScreen;
  rows: LiveRow[];
  drop: number | null;
}) {
  if (isDayType(board.type)) {
    return (
      <DayGroupList
        type={board.type}
        groups={aroundGroupsForScreen(board.aroundGroups ?? [], screen)}
      />
    );
  }
  return (
    <AroundList
      type={board.type}
      rows={aroundForScreen(rows, screen, board.me?.rank ?? null)}
      drop={drop}
    />
  );
}
