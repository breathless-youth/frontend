import { useCallback, useMemo, useState } from "react";

import type { StudySessionSummary } from "@focusmakers/types";

import { trackRecordsDateSelected, trackRecordsMonthChanged } from "@/lib/amplitude";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MonthCalendar } from "@/features/records/MonthCalendar";
import { MonthSummary } from "@/features/records/MonthSummary";
import {
  type CalendarMonth,
  dayTitleWithWeekday,
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "@/features/records/recordsFormat";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import { SessionListItem } from "@/features/records/SessionListItem";
import { DayDetailCard } from "@/features/records/DayDetailCard";
import { SessionDetailSheet } from "@/features/records/SessionDetailSheet";
import { useRecordsData } from "@/features/records/useRecordsData";
import { IconChevronLeft, IconChevronRight } from "@/features/records/icons";
import { useUserId } from "@/lib/userId";

/**
 * 기록(S5) v2 — `apps/mobile/app/(tabs)/records.tsx`에서 이식(BY-330), Figma V2 일간 뷰로
 * 다시 조립(BY-567). 네이티브 셸이 `/records?userId=N`으로 로드한다(홈 S1과 같은 계약).
 *
 * RN판과의 동작 차이(의도된 것, BY-329가 홈에서 확정한 방침과 동일):
 * - userId는 익명 등록 쿼리가 아니라 URL 파라미터로 받는다 — 없으면 브라우저 단독 모드 문구만 보여준다.
 * - "오늘" 재계산은 `useFocusEffect` 대신 매 렌더 계산으로 대체한다(useHomeSummary의 `todayKstDateKey()`
 *   인라인 호출과 같은 방식) — 상태로 저장하지 않으니 자정 넘김을 놓치는 상태 자체가 없다.
 * - 탭 재진입 시 통계 재조회는 react-query 기본값(`refetchOnWindowFocus`)이 맡는다
 *   (`useRecordsData` 참고, `useFocusEffect` invalidate를 이식하지 않는다).
 *
 * v1 → v2(BY-567) 변경: 스트릭 배너·요약 타일 2×2·최신순 정렬 표시를 걷어내고 월 순공 요약
 * (`MonthSummary`)·농도 달력·세션 목록으로 바꾼다. 날짜 상세 카드와 세션 행 상세 열기(`onSelect`)는
 * BY-568이 이었다.
 */

function RecordsContent({ userId }: { userId: number }) {
  const todayKey = kstDateKey();
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));
  // 월 이동 방향·계측을 여기서 소유한다(BY-567 코덱스 리뷰) — 헤더 버튼과 MonthCalendar 내부
  // 스와이프가 같은 changeMonth를 타야 애니메이션·trackRecordsMonthChanged가 갈라지지 않는다.
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);
  const changeMonth = useCallback((delta: -1 | 1, method: "button" | "swipe") => {
    trackRecordsMonthChanged({ delta, method });
    setSlideFrom(delta < 0 ? "left" : "right");
    setMonth((current) => shiftMonth(current, delta));
  }, []);

  const { day, dayFocusSec, period } = useRecordsData(userId, selectedKey, month);
  const [sheetSession, setSheetSession] = useState<StudySessionSummary | null>(null);

  // 서버가 시작 시각 내림차순으로 내려주지만(Swagger), 화면 약속(최신순 고정)은 여기서도 보장한다.
  // 의존성은 훅이 렌더마다 새로 만드는 포장 객체(day)가 아니라 react-query가 캐시하는 배열
  // (day.stats.sessions)로 건다 — 데이터가 같으면 참조가 유지되어 메모가 실제로 동작한다.
  const daySessions = day.status === "success" ? day.stats.sessions : undefined;
  const sessions = useMemo(
    () =>
      daySessions ? [...daySessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [],
    [daySessions],
  );

  return (
    <div>
      {/* 월 이동 — 카드 밖에 둔다(Figma v2). MonthCalendar 안 헤더는 중복을 막기 위해 뺐고,
          카드 안 스와이프는 onSwipeMonth를 통해 같은 changeMonth 경로로 상태를 움직인다. */}
      <div className="flex items-center justify-center gap-1.5 pt-4">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => changeMonth(-1, "button")}
          className="flex size-11 items-center justify-center"
        >
          <IconChevronLeft size={13} color="var(--color-foreground)" />
        </button>
        <span className="px-2.5 text-[15px] font-bold text-foreground">{monthLabel(month)}</span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => changeMonth(1, "button")}
          className="flex size-11 items-center justify-center"
        >
          <IconChevronRight size={13} color="var(--color-foreground)" />
        </button>
      </div>

      {period.status === "success" && (
        <MonthSummary month={month} daily={period.daily} compareDaily={period.compareDaily} />
      )}

      <div className="mt-[18px]">
        <MonthCalendar
          month={month}
          todayKey={todayKey}
          selectedKey={selectedKey}
          dayFocusSec={dayFocusSec}
          onSelectDate={(dateKey) => {
            // 절대 날짜 대신 오늘 여부·기록 유무만(BY-616 확장) — 과거 탐색 깊이의 근사.
            trackRecordsDateSelected({
              isToday: dateKey === todayKey,
              hasRecords: (dayFocusSec.get(dateKey) ?? 0) > 0,
            });
            setSelectedKey(dateKey);
          }}
          // 월 이동은 선택일을 건드리지 않는다(2026-07-28 확정) — 달력 표시만 바뀌고, 다른 달로
          // 갔다 돌아오면 이전 선택이 그대로 하이라이트된다. 근거: BY-314 설계 문서.
          slideFrom={slideFrom}
          onSwipeMonth={(delta) => changeMonth(delta, "swipe")}
        />
      </div>

      {day.status === "pending" && (
        <div className="mt-6 flex flex-col gap-2.5">
          <Skeleton className="h-[21px] w-40 rounded-md" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      )}

      {day.status === "error" && (
        <div className="mt-6">
          <ErrorState message="기록을 불러오지 못했어요" onRetry={day.retry} screen="records" />
        </div>
      )}

      {day.status === "success" && (
        <div className="mt-[22px]">
          <p className="text-base font-extrabold leading-[19px] text-foreground">
            {dayTitleWithWeekday(selectedKey)}
          </p>

          <div className="mt-3">
            <DayDetailCard stats={day.stats} dateKey={selectedKey} />
          </div>

          <div className="mt-3">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center rounded-[20px] bg-muted shadow-sb-card py-8">
                <p className="text-[15px] leading-[22px] text-muted-foreground">
                  이 날은 기록이 없어요
                </p>
              </div>
            ) : (
              <div className="rounded-[20px] bg-muted shadow-sb-card px-[18px] py-1">
                {sessions.map((session) => (
                  <SessionListItem key={session.id} session={session} onSelect={setSheetSession} />
                ))}
              </div>
            )}
          </div>

          <SessionDetailSheet
            session={sheetSession}
            subjects={day.stats.subjects}
            dateKey={selectedKey}
            onClose={() => setSheetSession(null)}
          />
        </div>
      )}
    </div>
  );
}

export function RecordsPage() {
  const userId = useUserId();

  return (
    <main
      data-testid="records-page"
      className="theme-soft-blue min-h-dvh bg-soft-blue pb-6 pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold leading-[29px] tracking-[-0.48px] text-foreground">
            기록
          </h1>
          {/* 이 티켓은 daily 고정이라 모드 state를 만들지 않는다(주간 비활성) — BY-566이 켠다. */}
          <SegmentedControl value="daily" onChange={() => undefined} weeklyDisabled />
        </div>

        {userId === null ? (
          <p className="mt-[13px] p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        ) : (
          <RecordsContent userId={userId} />
        )}
      </div>
    </main>
  );
}
