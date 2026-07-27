import { Fragment, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconChevronDown } from "../../components/icons";
import { MonthCalendar } from "../../components/records/MonthCalendar";
import { SessionListItem } from "../../components/records/SessionListItem";
import { StreakBanner, type StreakWeekDay } from "../../components/records/StreakBanner";
import { SummaryTiles } from "../../components/records/SummaryTiles";
import { useRecordsData } from "../../components/records/useRecordsData";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  addDaysToDateKey,
  type CalendarMonth,
  dayOfDateKey,
  kstDateKey,
  monthOfDateKey,
  shiftMonth,
  summaryTitle,
  WEEKDAY_LABELS,
  weekdayIndexOfDateKey,
  weekDateKeys,
} from "../../lib/recordsFormat";

/**
 * S5 · 기록 — Figma node `65:553`, 스펙 `frontend/docs/screens/SCR-S5-records.md`.
 *
 * 읽기 전용 조회 화면이다. 세션 시작·타이머·카메라·Vision 로직을 여기에 넣지 않는다(ADR 0001 —
 * 스터디룸은 `apps/web`이 WebView로 제공). 위에서 아래로 연속 공부 배너 → 월 달력 → 선택일
 * 학습 요약 2×2 → 그 날짜의 공부 기록 리스트 순서로 쌓인다.
 *
 * V1.0 범위 밖(히트맵·주간/월간 추이·정렬 토글·랭킹·소셜)은 만들지 않는다.
 */

/* -------------------------------------------------------------------------------------------------
 * mock 데이터 안내
 *
 * 달력 도트·선택일 요약·리스트는 실서버(`useRecordsData`)로 동작한다. 배너·주간 도트는 아직
 * BY-315 몫으로 mock을 유지한다(계약 미확인 ①②, 아래 TODO 참고).
 * ------------------------------------------------------------------------------------------------- */

/** TODO(계약 미확인 ①): 연속 공부 일수. */
const MOCK_STREAK_DAYS = 12;

/**
 * 주간 체크 도트 `Done` 판정의 mock 소스.
 *
 * TODO(계약 미확인 ②④): 스트릭 인정 기준(하루 순공 10분 이상)이 달력 도트 기준과 다를 수 있고,
 * 월 경계 주는 한 달치 응답만으로 채울 수도 없다. **지금 값이 달력 도트와 같아 보여도 같은 배열을
 * 공유하지 않는다** — 스펙이 "확인 전까지 같은 배열로 둘 다 채우지 않는다"고 못박은 항목이라
 * 두 기준이 같다는 오독을 만들지 않기 위해 소스를 분리해 둔다(`SCR-S5-records.md` Data Contract).
 */
function mockWeekDoneDateKeys(todayKey: string): string[] {
  return Array.from({ length: MOCK_STREAK_DAYS }, (_, index) => addDaysToDateKey(todayKey, -index));
}

/* ---------------------------------------------- 화면 ---------------------------------------------- */

function EmptyDayNotice() {
  // 선택일 빈 상태의 문구는 voice-tone §4 확정 카피지만 시각 레이아웃(일러스트·여백)은 Figma에
  // 프레임이 없다 — 리스트 자리에 중앙 정렬 2줄로 최소 구현한다.
  // TODO(SCR-S5-records.md): 기록이 아예 없는 첫 사용 전체 빈 상태와 로딩·에러 상태는 정의 자체가
  // 없다 — 임의로 디자인하지 않고 방어적으로 빈 리스트만 둔다.
  return (
    <View className="items-center gap-1 py-8">
      <Text className="text-text-secondary dark:text-text-secondary-dark text-[15px] leading-[22px]">
        이날은 기록이 없어요
      </Text>
      <Text className="text-text-tertiary text-[13px] leading-4">
        기록이 있는 날에는 점이 표시돼요
      </Text>
    </View>
  );
}

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  // TODO(SCR-S5-records.md): 화면 진입 시 기본 선택일 규칙이 미확정이다(Figma 예시는 오늘이 아닌
  // 전날이 선택돼 있다). 확인 전까지 자연스러운 기본값인 "오늘"로 둔다.
  const todayKey = useMemo(() => kstDateKey(), []);
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));

  const { day, studiedDates } = useRecordsData(selectedKey, month);

  // 주간 체크 도트는 BY-315까지 mock 유지 (계약 미확인 ①② — SCR-S5-records.md).
  const weekDoneDates = useMemo(() => mockWeekDoneDateKeys(todayKey), [todayKey]);
  const weekDays = useMemo<StreakWeekDay[]>(() => {
    const done = new Set(weekDoneDates);
    return weekDateKeys(todayKey).map((dateKey) => ({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
      dayOfMonth: dayOfDateKey(dateKey),
      state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
    }));
  }, [todayKey, weekDoneDates]);

  // 서버가 시작 시각 내림차순으로 내려주지만(Swagger), 화면 약속(최신순 고정)은 여기서도 보장한다.
  const sessions = useMemo(
    () =>
      day.status === "success"
        ? [...day.stats.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [day],
  );

  return (
    <ScrollView
      className="bg-bg-base dark:bg-bg-base-dark flex-1"
      // 이 Figma 프레임에는 iOS 상태바가 없다(스크롤 캔버스만 펼쳐 그린 프레임) — y=40을 그대로 쓰면
      // 같은 탭 화면인 S6와 어긋나므로 S6 기준(상태바 아래 17px)에 맞춘다.
      contentContainerStyle={{ paddingTop: insets.top + 17, paddingBottom: 24 }}
    >
      <View className="px-5">
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-2xl font-bold leading-[29px]"
        >
          기록
        </Text>

        {/*
          블록 간 여백은 Figma 실측이 균일하지 않다(타이틀→배너 13 · 배너→달력 24 · 달력→요약 24 ·
          요약 타일→"공부 기록" 8). 균일 `gap`을 쓰면 마지막 구간이 16px 과다해지므로 구간별 마진으로 둔다.
        */}
        <View className="mt-[13px]">
          <StreakBanner streakDays={MOCK_STREAK_DAYS} days={weekDays} />

          <View className="mt-6">
            <MonthCalendar
              month={month}
              todayKey={todayKey}
              selectedKey={selectedKey}
              studiedDates={studiedDates}
              onSelectDate={setSelectedKey}
              // TODO(SCR-S5-records.md): 월 이동 시 선택일 처리가 미확정이다(선택 해제 / 그 달 1일 /
              // 마지막 기록일). 확정 전까지 선택일을 건드리지 않는다 — 달력 표시만 바뀐다.
              onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
              onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
            />
          </View>

          {day.status === "pending" && (
            <View className="mt-6 gap-2.5">
              <Skeleton className="h-[21px] w-40 rounded-md" />
              <View className="flex-row gap-2.5">
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
              </View>
              <View className="flex-row gap-2.5">
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
              </View>
            </View>
          )}

          {day.status === "error" && (
            <View className="mt-6">
              <ErrorState message="기록을 불러오지 못했어요" onRetry={day.retry} />
            </View>
          )}

          {day.status === "success" && (
            <>
              <View className="mt-6 gap-2.5">
                <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
                  {summaryTitle(selectedKey)}
                </Text>
                <SummaryTiles stats={day.stats} />
              </View>

              <View className="mt-2">
                <View className="flex-row items-end justify-between">
                  <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
                    공부 기록
                  </Text>
                  {/*
                    정렬 컨트롤은 표시만 하고 누를 수 없다 — V1.0은 최신순 고정이고 토글은 M2+다.
                    Pressable로 감싸지 않는다(눌리는 것처럼 보이면 안 된다). 셰브런을 남길지 제거할지는
                    디자이너 확인 대상이라 Figma 시각을 그대로 유지한다.
                  */}
                  <View className="flex-row items-center gap-1 pb-[2px]">
                    <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] leading-4">
                      최신순
                    </Text>
                    <IconChevronDown size={9} />
                  </View>
                </View>

                {sessions.length === 0 ? (
                  <EmptyDayNotice />
                ) : (
                  sessions.map((session, index) => (
                    <Fragment key={session.id}>
                      {/* 아이템 사이 1px 헤어라인. Figma는 #eff1f3 하드코딩(변수 미바인딩)이라
                          다크모드 대응을 위해 가장 가까운 토큰 `border/default`로 바인딩한다 —
                          값이 정확히 같지는 않아 Figma 원본 수정은 Review Checklist 항목이다. */}
                      {index > 0 && (
                        <View className="bg-border-default dark:bg-border-default-dark h-px" />
                      )}
                      <SessionListItem session={session} />
                    </Fragment>
                  ))
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
