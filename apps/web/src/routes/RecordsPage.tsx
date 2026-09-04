import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { IconChevronDown } from "@/features/records/icons";
import { MonthCalendar } from "@/features/records/MonthCalendar";
import {
  type CalendarMonth,
  dayOfDateKey,
  kstDateKey,
  monthOfDateKey,
  shiftMonth,
  summaryTitle,
  WEEKDAY_LABELS,
  weekdayIndexOfDateKey,
  weekDateKeys,
} from "@/features/records/recordsFormat";
import { SessionListItem } from "@/features/records/SessionListItem";
import { StreakBanner, type StreakWeekDay } from "@/features/records/StreakBanner";
import { SummaryTiles } from "@/features/records/SummaryTiles";
import { useRecordsData } from "@/features/records/useRecordsData";
import { parseUserId } from "@/lib/userId";

/**
 * 기록(S5) — `apps/mobile/app/(tabs)/records.tsx`에서 이식 (BY-330).
 * 네이티브 셸이 `/records?userId=N`으로 로드한다(홈 S1과 같은 계약).
 *
 * RN판과의 동작 차이(의도된 것, BY-329가 홈에서 확정한 방침과 동일):
 * - userId는 익명 등록 쿼리가 아니라 URL 파라미터로 받는다 — 없으면 브라우저 단독 모드 문구만 보여준다.
 * - "오늘" 재계산은 `useFocusEffect` 대신 매 렌더 계산으로 대체한다(useHomeSummary의 `todayKstDateKey()`
 *   인라인 호출과 같은 방식) — 상태로 저장하지 않으니 자정 넘김을 놓치는 상태 자체가 없다.
 * - 탭 재진입 시 통계 재조회는 react-query 기본값(`refetchOnWindowFocus`)이 맡는다
 *   (`useRecordsData` 참고, `useFocusEffect` invalidate를 이식하지 않는다).
 */

function EmptyDayNotice() {
  // 선택일 빈 상태의 문구는 voice-tone §4 확정 카피지만 시각 레이아웃(일러스트·여백)은 Figma에
  // 프레임이 없다 — 리스트 자리에 중앙 정렬 2줄로 최소 구현한다.
  // TODO(SCR-S5-records.md): 기록이 아예 없는 첫 사용 전체 빈 상태와 로딩·에러 상태는 정의 자체가
  // 없다 — 임의로 디자인하지 않고 방어적으로 빈 리스트만 둔다.
  return (
    <div className="flex flex-col items-center gap-1 py-8">
      <p className="text-[15px] leading-[22px] text-muted-foreground">이날은 기록이 없어요</p>
      <p className="text-[13px] leading-4 text-text-tertiary">기록이 있는 날에는 점이 표시돼요</p>
    </div>
  );
}

function RecordsContent({ userId }: { userId: number }) {
  const todayKey = kstDateKey();
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));

  const { day, studiedDates, streakBanner } = useRecordsData(userId, selectedKey, month, todayKey);

  // streakBanner는 훅이 렌더마다 새로 만드는 포장 객체라 통째로 의존하면 메모가 무효화된다 —
  // 안쪽의 안정된 배열(doneDates)만 꺼내 의존한다(위 sessions 메모와 같은 패턴, 리뷰 반영).
  const streakDoneDates = streakBanner.status === "success" ? streakBanner.doneDates : undefined;
  const weekDays = useMemo<StreakWeekDay[]>(() => {
    if (streakDoneDates === undefined) {
      return [];
    }
    const done = new Set(streakDoneDates);
    return weekDateKeys(todayKey).map((dateKey) => ({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
      dayOfMonth: dayOfDateKey(dateKey),
      state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
    }));
  }, [streakDoneDates, todayKey]);

  // 서버가 시작 시각 내림차순으로 내려주지만(Swagger), 화면 약속(최신순 고정)은 여기서도 보장한다.
  // 의존성은 훅이 렌더마다 새로 만드는 포장 객체(day)가 아니라 react-query가 캐시하는 배열
  // (day.stats.sessions)로 건다 — 데이터가 같으면 참조가 유지되어 메모가 실제로 동작한다(리뷰 반영).
  const daySessions = day.status === "success" ? day.stats.sessions : undefined;
  const sessions = useMemo(
    () =>
      daySessions ? [...daySessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [],
    [daySessions],
  );

  return (
    <div className="mt-[13px]">
      {streakBanner.status === "pending" && <Skeleton className="h-[92px] rounded-2xl" />}
      {streakBanner.status === "success" && (
        <StreakBanner streakDays={streakBanner.streakDays} days={weekDays} />
      )}
      {/* hidden이면 아무것도 그리지 않는다 — 오류·재시도는 아래 일별 기록 ErrorState가 대표(2026-07-28 확정) */}

      <div className="mt-6">
        <MonthCalendar
          month={month}
          todayKey={todayKey}
          selectedKey={selectedKey}
          studiedDates={studiedDates}
          onSelectDate={setSelectedKey}
          // 월 이동은 선택일을 건드리지 않는다(2026-07-28 확정) — 달력 표시만 바뀌고, 다른 달로
          // 갔다 돌아오면 이전 선택이 그대로 하이라이트된다. 근거: BY-314 설계 문서.
          onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
          onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
        />
      </div>

      {day.status === "pending" && (
        <div className="mt-6 flex flex-col gap-2.5">
          <Skeleton className="h-[21px] w-40 rounded-md" />
          <div className="flex flex-row gap-2.5">
            <Skeleton className="h-[92px] flex-1 rounded-2xl" />
            <Skeleton className="h-[92px] flex-1 rounded-2xl" />
          </div>
          <div className="flex flex-row gap-2.5">
            <Skeleton className="h-[92px] flex-1 rounded-2xl" />
            <Skeleton className="h-[92px] flex-1 rounded-2xl" />
          </div>
        </div>
      )}

      {day.status === "error" && (
        <div className="mt-6">
          <ErrorState message="기록을 불러오지 못했어요" onRetry={day.retry} />
        </div>
      )}

      {day.status === "success" && (
        <>
          <div className="mt-6 flex flex-col gap-2.5">
            <p className="text-[17px] font-bold leading-[21px] text-foreground">
              {summaryTitle(selectedKey)}
            </p>
            <SummaryTiles stats={day.stats} />
          </div>

          {/*
            학습 요약 → 공부 기록 간격. **Figma 실측은 8px이지만 의도적으로 24px로 벌렸다**
            (2026-08-01 사용자 확인 — 두 섹션이 붙어 보임).

            같은 화면의 다른 섹션 경계가 전부 24px(스트릭→달력, 달력→학습 요약)인데 여기만
            8px이라, 두 섹션 제목의 무게가 같은데도 "학습 요약에 딸린 하위 목록"처럼 읽혔다.
            8px은 섹션 사이가 아니라 섹션 **안**의 간격 크기다.
          */}
          <div className="mt-6">
            <div className="flex flex-row items-end justify-between">
              <p className="text-[17px] font-bold leading-[21px] text-foreground">공부 기록</p>
              {/*
                정렬 컨트롤은 표시만 하고 누를 수 없다 — V1.0은 최신순 고정이고 토글은 M2+다.
                button으로 감싸지 않는다(눌리는 것처럼 보이면 안 된다). 셰브런을 남길지 제거할지는
                디자이너 확인 대상이라 Figma 시각을 그대로 유지한다.
              */}
              <div className="flex flex-row items-center gap-1 pb-[2px]">
                <span className="text-[13px] leading-4 text-muted-foreground">최신순</span>
                <IconChevronDown size={9} />
              </div>
            </div>

            {sessions.length === 0 ? (
              <EmptyDayNotice />
            ) : (
              sessions.map((session, index) => (
                <Fragment key={session.id}>
                  {/* 아이템 사이 1px 헤어라인 */}
                  {index > 0 && <div className="h-px bg-border" />}
                  <SessionListItem session={session} />
                </Fragment>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function RecordsPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));

  return (
    <main
      data-testid="records-page"
      className="min-h-dvh bg-background pb-6 pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-2xl font-bold leading-[29px] text-foreground">기록</h1>

        {userId === null ? (
          <p className="mt-[13px] p-4 text-sm text-muted-foreground">
            userId 없음 — 브라우저 단독 모드
          </p>
        ) : (
          <RecordsContent userId={userId} />
        )}
      </div>
    </main>
  );
}
