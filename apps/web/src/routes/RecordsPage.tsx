import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  trackRecordsDateSelected,
  trackRecordsMonthChanged,
  trackRecordsPeriodPicked,
  trackRecordsPeriodPickerOpened,
  trackRecordsSessionExpanded,
  trackRecordsViewChanged,
} from "@/lib/amplitude";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { PeriodHeadline } from "@/features/records/PeriodHeadline";
import { MonthPickerSheet } from "@/features/records/PeriodPickerSheet";
import { MonthCalendar, type MonthStats } from "@/features/records/MonthCalendar";
import {
  type CalendarMonth,
  dayHeadlineLabel,
  dayTitleWithWeekday,
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "@/features/records/recordsFormat";
import {
  averageFocusSecPerStudiedDay,
  isFutureMonth,
  studiedDayCount,
  sumFocusSec,
} from "@/features/records/recordsPeriod";
import { SegmentedControl, type RecordsView } from "@/features/records/SegmentedControl";
import { SessionListItem } from "@/features/records/SessionListItem";
import { useRecordsData } from "@/features/records/useRecordsData";
import { WeeklyView } from "@/features/records/WeeklyView";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconPlanner,
} from "@/features/records/icons";
import { slideNavigate } from "@/lib/pageTransition";
import { useUserId } from "@/lib/userId";

/**
 * 기록 탭
 *
 * - 탭 재진입 시 통계 재조회는 react-query 기본값(`refetchOnWindowFocus`)이 맡는다
 *   (`useRecordsData` 참고, `useFocusEffect` invalidate를 이식하지 않는다).
 */

function RecordsContent({
  userId,
  todayKey,
  selectedKey,
  setSelectedKey,
  month,
  setMonth,
}: {
  userId: number;
  todayKey: string;
  // 선택 날짜·보이는 달은 탭을 왕복해도 유지되도록 RecordsPage가 소유하고 내려준다.
  selectedKey: string;
  setSelectedKey: Dispatch<SetStateAction<string>>;
  month: CalendarMonth;
  setMonth: Dispatch<SetStateAction<CalendarMonth>>;
}) {
  // 월 이동 방향은 순수 애니메이션용이라 로컬로 둔다(탭 왕복에 보존할 "위치"가 아니다).
  // 헤더 버튼과 MonthCalendar 내부 스와이프가 같은 changeMonth를 타야 애니메이션·계측이 갈라지지 않는다.
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);
  // 미래에는 볼 기록이 없다 — 오늘이 속한 달이 끝이다. 버튼과 스와이프가 같은 판정을 탄다.
  const isLatestMonth = isFutureMonth(shiftMonth(month, 1), todayKey);
  const changeMonth = useCallback(
    (delta: -1 | 1, method: "button" | "swipe") => {
      if (delta === 1 && isLatestMonth) {
        return;
      }
      trackRecordsMonthChanged({ delta, method });
      setSlideFrom(delta < 0 ? "left" : "right");
      setMonth((current) => shiftMonth(current, delta));
    },
    [isLatestMonth, setMonth],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { day, dayFocusSec, period } = useRecordsData(userId, selectedKey, month);
  const periodDaily = period.status === "success" ? period.daily : undefined;
  const monthStats = useMemo<MonthStats | null>(
    () =>
      periodDaily === undefined
        ? null
        : {
            totalFocusSec: sumFocusSec(periodDaily),
            studiedDays: studiedDayCount(periodDaily),
            averageFocusSec: averageFocusSecPerStudiedDay(periodDaily),
          },
    [periodDaily],
  );
  // 한 번에 하나만 펼친다. id로만 기억해 두면 날짜가 바뀌어 그 세션이 목록에 없을 때 저절로 접힌다.
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const toggleSession = useCallback((sessionId: number) => {
    setExpandedSessionId((current) => {
      const next = current === sessionId ? null : sessionId;
      trackRecordsSessionExpanded({ expanded: next !== null });
      return next;
    });
  }, []);

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
      {/* 월 이동 — 맨 위, 카드 밖에 둔다. MonthCalendar 안 헤더는 중복을 막기 위해 뺐고,
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
        {/* 라벨을 탭하면 기간 선택 시트가 열린다 — 아래 꺾쇠가 탭할 수 있음을 알린다. */}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            trackRecordsPeriodPickerOpened("daily");
            setPickerOpen(true);
          }}
          className="flex h-11 items-center gap-[5px] px-2.5 text-[15px] font-bold text-foreground"
        >
          {monthLabel(month)}
          <IconChevronDown color="var(--color-foreground)" />
        </button>
        <button
          type="button"
          aria-label="다음 달"
          disabled={isLatestMonth}
          onClick={() => changeMonth(1, "button")}
          className="flex size-11 items-center justify-center disabled:cursor-not-allowed"
        >
          <IconChevronRight
            size={13}
            color={isLatestMonth ? "var(--color-text-tertiary)" : "var(--color-foreground)"}
          />
        </button>
      </div>

      <MonthPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        month={month}
        todayKey={todayKey}
        onPick={(picked, toToday) => {
          trackRecordsPeriodPicked({ view: "daily", toToday });
          // 시트로 건너뛴 이동에는 밀려 들어오는 애니메이션을 재생하지 않는다.
          setSlideFrom(null);
          setMonth(picked);
          setPickerOpen(false);
        }}
      />

      {/* 머리는 달이 아니라 고른 날을 요약한다 — 달을 옮겨도 고른 날의 값이 남는다. */}
      <PeriodHeadline
        label={dayHeadlineLabel(selectedKey, todayKey)}
        totals={
          day.status === "success"
            ? { focusSec: day.stats.totalFocusSec, studySec: day.stats.totalStudySec }
            : day.status
        }
      />

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
            // 같은 날로 돌아왔을 때 접혔던 행이 다시 펼쳐지지 않게 기억해 둔 세션도 지운다.
            setExpandedSessionId(null);
          }}
          // 월 이동은 선택일을 건드리지 않는다(2026-07-28 확정) — 달력 표시만 바뀌고, 다른 달로
          // 갔다 돌아오면 이전 선택이 그대로 하이라이트된다. 근거: BY-314 설계 문서.
          slideFrom={slideFrom}
          onSwipeMonth={(delta) => changeMonth(delta, "swipe")}
          monthStats={monthStats}
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
          {/* 선택일 줄 — 오른쪽 버튼으로 그 날의 플래너를 연다(과목별 시간·타임테이블은 플래너에 있다). */}
          <div className="flex items-center justify-between">
            <p className="text-base leading-5 font-extrabold text-foreground">
              {dayTitleWithWeekday(selectedKey)}
            </p>
            <button
              type="button"
              onClick={() => {
                // 셸이 붙인 쿼리(구 앱의 신원 등)는 그대로 들고 간다.
                const params = new URLSearchParams(location.search);
                params.set("date", selectedKey);
                slideNavigate("forward", () => {
                  navigate(
                    { pathname: "/planner", search: `?${params.toString()}` },
                    { state: { via: "records" } },
                  );
                });
              }}
              className="flex items-center gap-[5px] rounded-full bg-brand-subtle py-[7px] pr-2.5 pl-3 text-[13px] leading-4 font-bold text-brand-subtle-text"
            >
              <IconPlanner />
              플래너
              <IconChevronRight size={8.57} color="currentColor" />
            </button>
          </div>

          <div className="mt-3">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-[20px] bg-muted py-[30px] shadow-sb-card">
                <p className="text-sm leading-[19px] font-medium text-muted-foreground">
                  이 날은 기록이 없어요
                </p>
                {/* 보는 달에 기록이 하나도 없을 때만 다음 행동을 한 줄 더 알려 준다. */}
                {monthStats?.studiedDays === 0 && (
                  <p className="text-xs leading-4 text-text-tertiary">
                    집중을 시작하면 여기에 쌓여요
                  </p>
                )}
              </div>
            ) : (
              <ul className="rounded-[20px] bg-muted py-1 shadow-sb-card">
                {sessions.map((session, index) => (
                  <li key={session.id}>
                    {index > 0 && <div className="mx-[18px] h-px bg-border" />}
                    <SessionListItem
                      session={session}
                      expanded={session.id === expandedSessionId}
                      onToggle={(toggled) => toggleSession(toggled.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecordsPage() {
  const userId = useUserId();
  const todayKey = kstDateKey();
  // 일간/주간 모드는 여기서 소유한다(SegmentedControl이 이 헤더에 있으므로)
  const [mode, setMode] = useState<RecordsView>("daily");
  // 사용자가 보던 "위치"(일간: 선택 날짜·보이는 달, 주간: 보고 있는 주)는 여기서 소유한다 —
  // 탭을 바꿔도 서브트리 unmount로 리셋되지 않게 lift state 한다.
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));
  const [weekAnchorKey, setWeekAnchorKey] = useState(todayKey);

  return (
    <main
      data-testid="records-page"
      className="theme-soft-blue min-h-dvh bg-soft-blue pb-[var(--tab-bar-reserve)] pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold leading-[29px] tracking-[-0.48px] text-foreground">
            기록
          </h1>
          {/* 기기 미등록(userId 없음)이면 주간 데이터를 조회할 수 없어 주간 탭을 막는다
              — placeholder만 보이는데 주간 탭이 눌려 탭·내용이 어긋나지 않게. */}
          <SegmentedControl
            value={mode}
            onChange={(next) => {
              if (next !== mode) {
                trackRecordsViewChanged(next);
              }
              setMode(next);
            }}
            weeklyDisabled={userId === null}
          />
        </div>

        {userId === null ? (
          <p className="mt-[13px] p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        ) : mode === "weekly" ? (
          <WeeklyView
            userId={userId}
            todayKey={todayKey}
            weekAnchorKey={weekAnchorKey}
            setWeekAnchorKey={setWeekAnchorKey}
          />
        ) : (
          <RecordsContent
            userId={userId}
            todayKey={todayKey}
            selectedKey={selectedKey}
            setSelectedKey={setSelectedKey}
            month={month}
            setMonth={setMonth}
          />
        )}
      </div>
    </main>
  );
}
