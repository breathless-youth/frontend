import { useFocusEffect } from "expo-router";
import { Fragment, useCallback, useMemo, useState } from "react";
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
  //
  // "오늘"은 탭 포커스 때마다 재계산한다 — 탭 화면은 자정을 넘겨도 언마운트되지 않으므로 마운트
  // 시점 값에 고정하면 새 날짜가 미래로 판정되어 선택 불가가 된다(심야 공부 시나리오). 같은 값이면
  // setState가 bail-out해 추가 렌더는 없다. 선택일은 정책대로 건드리지 않는다(선택 항상 유지).
  const [todayKey, setTodayKey] = useState(() => kstDateKey());
  useFocusEffect(
    useCallback(() => {
      setTodayKey(kstDateKey());
    }, []),
  );
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));

  const { day, studiedDates, streakBanner } = useRecordsData(selectedKey, month, todayKey);

  const weekDays = useMemo<StreakWeekDay[]>(() => {
    if (streakBanner.status !== "success") {
      return [];
    }
    const done = new Set(streakBanner.doneDates);
    return weekDateKeys(todayKey).map((dateKey) => ({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
      dayOfMonth: dayOfDateKey(dateKey),
      state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
    }));
  }, [streakBanner, todayKey]);

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
          {streakBanner.status === "pending" && <Skeleton className="h-[92px] rounded-2xl" />}
          {streakBanner.status === "success" && (
            <StreakBanner streakDays={streakBanner.streakDays} days={weekDays} />
          )}
          {/* hidden이면 아무것도 그리지 않는다 — 오류·재시도는 아래 일별 기록 ErrorState가 대표(2026-07-28 확정) */}

          <View className="mt-6">
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
