import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";

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
import { subjectIdOf, subjectNameOf } from "@/features/manual-record/manualRecord";
import { useOpenManualRecord } from "@/features/manual-record/useOpenManualRecord";
import { PlannerPillButton } from "@/features/planner/PlannerPillButton";
import { PeriodHeadline } from "@/features/records/PeriodHeadline";
import { MonthCalendar, type MonthStats } from "@/features/records/MonthCalendar";
import {
  type CalendarMonth,
  addDaysToDateKey,
  dayHeadlineLabel,
  dayTitleWithWeekday,
  isFutureDateKey,
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
import { subjectRefMap } from "@/features/records/recordsTimetable";
import { SessionListItem, SessionTimelineLegend } from "@/features/records/SessionListItem";
import { useRecordsData } from "@/features/records/useRecordsData";
import { WeeklyView } from "@/features/records/WeeklyView";
import { TimelapsesButton } from "@/features/timelapse/TimelapsesButton";
import { PeriodNav, PeriodNavPickerButton } from "@/features/records/PeriodNav";
import { hasTokenSource, useUserId } from "@/lib/userId";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { whenIdle } from "@/lib/whenIdle";
import { Card } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";

/**
 * 달 선택 시트는 시트 부품(Base UI)과 함께 따로 받는다.
 * 기록 탭은 첫 번들에 들어가므로 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const { LazySheet: LazyMonthPickerSheet, preload: preloadMonthPickerSheet } = lazyWithPreload(() =>
  import("@/features/records/PeriodPickerSheet").then((module) => module.MonthPickerSheet),
);

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
  onSelectDate,
  month,
  setMonth,
}: {
  userId: number;
  todayKey: string;
  // 선택일은 RecordsPage가 주소에서 읽어 내려준다. 보이는 달은 탭을 왕복해도 유지되도록 RecordsPage가 소유한다.
  selectedKey: string;
  onSelectDate: (dateKey: string) => void;
  month: CalendarMonth;
  setMonth: Dispatch<SetStateAction<CalendarMonth>>;
}) {
  // 월 이동 방향은 순수 애니메이션용이라 로컬로 둔다(탭 왕복에 보존할 "위치"가 아니다).
  // 헤더 버튼과 MonthCalendar 내부 스와이프가 같은 changeMonth를 타야 애니메이션·계측이 갈라지지 않는다.
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);
  // 미래에는 볼 기록이 없다 — 오늘이 속한 달이 끝이다. 버튼과 스와이프가 같은 판정을 탄다.
  const isLatestMonth = isFutureMonth(shiftMonth(month, 1), todayKey);
  const changeMonth = (delta: -1 | 1, method: "button" | "swipe") => {
    if (delta === 1 && isLatestMonth) {
      return;
    }
    trackRecordsMonthChanged({ delta, method });
    setSlideFrom(delta < 0 ? "left" : "right");
    setMonth((current) => shiftMonth(current, delta));
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    whenIdle(preloadMonthPickerSheet);
  }, []);

  const { day, dayFocusSec, period } = useRecordsData(userId, selectedKey, month);
  const periodDaily = period.status === "success" ? period.daily : undefined;
  const monthStats: MonthStats | null =
    periodDaily === undefined
      ? null
      : {
          totalFocusSec: sumFocusSec(periodDaily),
          studiedDays: studiedDayCount(periodDaily),
          averageFocusSec: averageFocusSecPerStudiedDay(periodDaily),
        };
  // 한 번에 하나만 펼친다. id로만 기억해 두면 날짜가 바뀌어 그 세션이 목록에 없을 때 저절로 접힌다.
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  // Accordion은 펼친 항목의 값을 주고, 접으면 빈 문자열을 준다.
  const changeExpandedSession = (value: string) => {
    const next = value === "" ? null : Number(value);
    trackRecordsSessionExpanded({ expanded: next !== null });
    setExpandedSessionId(next);
  };

  // 서버가 시작 시각 내림차순으로 내려주지만(Swagger), 화면 약속(최신순 고정)은 여기서도 보장한다.
  const daySessions = day.status === "success" ? day.stats.sessions : undefined;
  const sessions = daySessions
    ? [...daySessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    : [];

  // 수동 기록 API는 토큰이 있어야 해서 토큰 없는 문서에서는 입구를 모두 숨긴다.
  const canWrite = hasTokenSource();
  const openManualRecord = useOpenManualRecord();
  const subjectRefs = subjectRefMap(day.status === "success" ? day.stats.subjects : undefined);
  const canAdd = canWrite && !isFutureDateKey(selectedKey, todayKey);

  return (
    <div>
      {/* 월 이동 — 맨 위, 카드 밖에 둔다. MonthCalendar 안 헤더는 중복을 막기 위해 뺐고,
          카드 안 스와이프는 onSwipeMonth를 통해 같은 changeMonth 경로로 상태를 움직인다. */}
      <PeriodNav
        prevLabel="이전 달"
        nextLabel="다음 달"
        canGoNext={!isLatestMonth}
        onPrev={() => changeMonth(-1, "button")}
        onNext={() => changeMonth(1, "button")}
        className="pt-4"
      >
        <PeriodNavPickerButton
          onClick={() => {
            trackRecordsPeriodPickerOpened("daily");
            setPickerOpen(true);
          }}
        >
          {monthLabel(month)}
        </PeriodNavPickerButton>
      </PeriodNav>

      <LazyMonthPickerSheet
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

      <div className="mt-4.5">
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
            onSelectDate(dateKey);
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
          <Skeleton className="h-5.25 w-40 rounded-md" />
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
        <div className="mt-5.5">
          {/* 플래너 입구는 머리에 있고, 이 줄은 고른 날에 기록을 넣는 자리다. */}
          <div className="flex items-center justify-between">
            <p className="text-base leading-4.75 font-extrabold text-foreground">
              {dayTitleWithWeekday(selectedKey)}
            </p>
            {canAdd && (
              <button
                type="button"
                onClick={() =>
                  openManualRecord({ kind: "add", dateKey: selectedKey, entry: "records" })
                }
                // 글자 링크라도 누르는 영역은 44px을 지키고, 음수 여백으로 줄 높이는 날짜 글자에 맞춘다.
                className="-my-3 flex min-h-11 items-center gap-1 text-xs leading-3.75 font-bold text-primary"
              >
                시간 직접 입력
                <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-3">
            {sessions.length === 0 ? (
              <Card className="flex flex-col items-center gap-1 rounded-xl border-0 shadow-sb-card py-7.5">
                <p className="text-[15px] leading-5 text-muted-foreground">이 날은 기록이 없어요</p>
                {/* 보는 달에 기록이 하나도 없을 때만 다음 행동을 한 줄 더 알려 준다. */}
                {monthStats?.studiedDays === 0 && (
                  <p className="text-[13px] leading-4 text-text-tertiary">
                    집중을 시작하면 여기에 쌓여요
                  </p>
                )}
              </Card>
            ) : (
              <Card className="rounded-xl border-0 shadow-sb-card px-4.5 py-1">
                <Accordion
                  type="single"
                  collapsible
                  asChild
                  value={expandedSessionId === null ? "" : String(expandedSessionId)}
                  onValueChange={changeExpandedSession}
                >
                  <ul>
                    {sessions.map((session, index) => (
                      <SessionListItem
                        key={session.id}
                        session={session}
                        subjectName={subjectNameOf(subjectIdOf(session), subjectRefs)}
                        onEdit={
                          canWrite
                            ? (edited) =>
                                openManualRecord({
                                  kind: "edit",
                                  dateKey: selectedKey,
                                  entry: "records",
                                  id: edited.id,
                                })
                            : undefined
                        }
                        className={index > 0 ? "border-t border-border pt-px" : undefined}
                      />
                    ))}
                  </ul>
                </Accordion>
                <SessionTimelineLegend />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function RecordsPage() {
  const userId = useUserId();
  const todayKey = kstDateKey();
  const [searchParams, setSearchParams] = useSearchParams();
  // 일간/주간 모드는 여기서 소유한다(SegmentedControl이 이 헤더에 있으므로)
  const [mode, setMode] = useState<RecordsView>("daily");
  // 고른 날은 주소의 `date`가 단일 출처다. 입력 화면이나 플래너에서 돌아오면 이 화면이 다시 마운트되는데,
  // state에 두면 오늘로 돌아가 방금 고친 날이 사라진다.
  // 모양만 맞고 달력에 없는 날짜(2020-13-45)는 날짜 계산을 한 바퀴 돌리면 다른 날짜가 되어 걸러지고, 미래는 볼 기록이 없어 오늘로 연다.
  const requested = searchParams.get("date");
  const selectedKey =
    requested !== null &&
    DATE_KEY_PATTERN.test(requested) &&
    addDaysToDateKey(requested, 0) === requested &&
    !isFutureDateKey(requested, todayKey)
      ? requested
      : todayKey;
  /** 셸이 붙인 쿼리는 지우지 않고 날짜만 바꾼다. replace라 날짜를 고를 때마다 뒤로 가기 스택이 쌓이지 않는다. */
  const selectDate = (dateKey: string) => {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (dateKey === todayKey) {
          params.delete("date");
        } else {
          params.set("date", dateKey);
        }
        return params;
      },
      { replace: true },
    );
  };
  // 보이는 달과 주는 화면 상태라 주소에 싣지 않는다. 처음 보이는 달은 고른 날의 달이다.
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(selectedKey));
  const [weekAnchorKey, setWeekAnchorKey] = useState(todayKey);

  return (
    <main
      data-testid="records-page"
      className="theme-soft-blue min-h-dvh bg-soft-blue page-column pb-(--tab-bar-reserve) pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold leading-7.25 tracking-[-0.48px] text-foreground">
            기록
          </h1>
          <div className="flex items-center gap-2">
            {/* 타임랩스는 기기에 보관해 등록 전에도 볼 수 있다. */}
            <TimelapsesButton />
            {/* 일간·주간이 머리를 같이 쓰므로 어느 쪽에서든 달력에서 고른 날의 플래너를 연다.
                등록 전에는 플래너에도 볼 기록이 없어 숨긴다. */}
            {userId !== null && <PlannerPillButton via="records" dateKey={selectedKey} />}
          </div>
        </div>

        {/* 기기 미등록(userId 없음)이면 주간 데이터를 조회할 수 없어 주간 탭을 막는다.
            안내만 보이는데 주간 탭이 눌려 탭과 내용이 어긋나지 않게. */}
        <SegmentedControl
          value={mode}
          options={[
            { value: "daily", label: "일간" },
            { value: "weekly", label: "주간", disabled: userId === null },
          ]}
          onChange={(next) => {
            if (next !== mode) {
              trackRecordsViewChanged(next);
            }
            setMode(next);
          }}
          className="mt-4 flex w-full"
          triggerClassName="flex-1 justify-center"
        />

        {userId === null ? (
          <p className="mt-3.25 p-4 text-sm text-muted-foreground">
            기기 등록 전이에요. 앱에서 열면 기록이 저장돼요
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
            onSelectDate={selectDate}
            month={month}
            setMonth={setMonth}
          />
        )}
      </div>
    </main>
  );
}
