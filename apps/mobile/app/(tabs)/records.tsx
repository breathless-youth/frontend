import type {
  StudySessionEventCounts,
  StudySessionListResponse,
  StudySessionSummary,
} from "@focuson/types";
import { Fragment, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconChevronDown } from "../../components/icons";
import { MonthCalendar } from "../../components/records/MonthCalendar";
import { SessionListItem } from "../../components/records/SessionListItem";
import { StreakBanner, type StreakWeekDay } from "../../components/records/StreakBanner";
import { SummaryTiles } from "../../components/records/SummaryTiles";
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
 * 목(mock) 데이터 — 실제 API 연동 없음
 *
 * `GET /api/stats` 응답 타입(`StudySessionListResponse`)은 `packages/types`에 실재하므로 그대로
 * 소비하고 값만 정적 예시로 채운다. 반대로 아래 두 값은 `packages/types`에 대응 필드가 없어
 * 타입을 만들지 않고 이 화면 안에서만 임시로 둔다(S1 홈의 `HomeSummaryDraft`와 같은 방침).
 *
 * TODO(SCR-S5-records.md Data Contract): 백엔드 계약 미확인 4건 —
 *   ① `streakDays`(연속 공부 일수, S1 홈과 공유) ② 주간 체크 도트의 일자별 공부 여부(월 경계 주 포함)
 *   ③ `GET /api/stats`의 요청 파라미터(날짜 스코프 vs 월 스코프) ④ 주간 체크 도트 `Done` 판정 기준
 *     (`studiedDatesInMonth`가 "기록 1건 이상"인지 "순공 10분 이상"인지 — 달력 도트와 같은 기준인지도 미확인).
 * 확정되면 `lib/statsApi.ts`의 `listStudySessionStats`로 이 블록을 통째로 교체한다.
 * ------------------------------------------------------------------------------------------------- */

/** TODO(계약 미확인 ①): 연속 공부 일수. */
const MOCK_STREAK_DAYS = 12;

type MockSessionTemplate = {
  /** KST 벽시계 `HH:MM` — 실제 계약은 UTC ISO-8601이라 아래에서 변환해 넣는다. */
  startsAt: string;
  endsAt: string;
  studySec: number;
  focusSec: number;
  eventCounts: StudySessionEventCounts;
};

const MOCK_SESSION_TEMPLATES: MockSessionTemplate[] = [
  {
    startsAt: "08:55",
    endsAt: "11:02",
    studySec: 2 * 3600 + 7 * 60,
    focusSec: 3600 + 38 * 60,
    eventCounts: { AWAY: 2, PHONE: 1, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "13:10",
    endsAt: "14:40",
    studySec: 3600 + 30 * 60,
    focusSec: 3600 + 12 * 60,
    eventCounts: { AWAY: 1, PHONE: 0, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "16:20",
    endsAt: "17:30",
    studySec: 3600 + 10 * 60,
    focusSec: 48 * 60,
    eventCounts: { AWAY: 0, PHONE: 2, DEVICE: 0, PAUSE: 0 },
  },
];

/** KST 벽시계(`YYYY-MM-DD` + `HH:MM`)를 계약대로 UTC ISO-8601로 바꾼다. */
function toUtcIso(dateKey: string, kstClock: string): string {
  return new Date(`${dateKey}T${kstClock}:00+09:00`).toISOString();
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 달력 도트(`studiedDatesInMonth`)의 mock 소스.
 *
 * TODO(계약 미확인 ④): `studiedDatesInMonth`의 정의가 "기록이 1건이라도 있는 날"인지
 * "순공 10분 이상인 날"인지 명시돼 있지 않다.
 */
const MOCK_CALENDAR_RECORD_DAY_COUNT = 12;

function mockCalendarRecordDateKeys(todayKey: string): string[] {
  return Array.from({ length: MOCK_CALENDAR_RECORD_DAY_COUNT }, (_, index) =>
    addDaysToDateKey(todayKey, -index),
  );
}

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

function emptyEventCounts(): StudySessionEventCounts {
  return { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 };
}

/**
 * 선택일 세션 + 그 달의 기록 날짜를 담은 `GET /api/stats` 응답 형태의 예시 값.
 * 집계값은 세션에서 실제로 계산한다 — 화면이 서버 계약대로 동작하는지 그대로 드러나게 하기 위함이다.
 */
function buildMockStats(
  selectedKey: string,
  month: CalendarMonth,
  calendarRecordDates: readonly string[],
): StudySessionListResponse {
  const hasRecord = calendarRecordDates.includes(selectedKey);

  const sessions: StudySessionSummary[] = hasRecord
    ? MOCK_SESSION_TEMPLATES.map((template, index) => ({
        id: index + 1,
        statDate: selectedKey,
        startedAt: toUtcIso(selectedKey, template.startsAt),
        endedAt: toUtcIso(selectedKey, template.endsAt),
        studySec: template.studySec,
        focusSec: template.focusSec,
        // 서버는 집중률을 소수 1자리로 내려준다.
        focusRate: roundToTenth((template.focusSec / template.studySec) * 100),
        eventCounts: template.eventCounts,
      }))
    : [];

  const totalStudySec = sessions.reduce((sum, session) => sum + session.studySec, 0);
  const totalFocusSec = sessions.reduce((sum, session) => sum + session.focusSec, 0);
  const totalEventCounts = sessions.reduce<StudySessionEventCounts>((counts, session) => {
    counts.AWAY += session.eventCounts.AWAY;
    counts.PHONE += session.eventCounts.PHONE;
    counts.DEVICE += session.eventCounts.DEVICE;
    counts.PAUSE += session.eventCounts.PAUSE;
    return counts;
  }, emptyEventCounts());

  const monthPrefix = `${month.year}-${month.month < 10 ? `0${month.month}` : month.month}`;

  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec,
    totalFocusSec,
    longestFocusSec: sessions.reduce((max, session) => Math.max(max, session.focusSec), 0),
    focusRate: totalStudySec === 0 ? 0 : roundToTenth((totalFocusSec / totalStudySec) * 100),
    totalEventCounts,
    studiedDatesInMonth: calendarRecordDates
      .filter((dateKey) => dateKey.startsWith(monthPrefix))
      .sort(),
  };
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

  // 달력 도트와 주간 체크 도트는 판정 기준이 다를 수 있어 mock 소스를 따로 둔다(위 TODO 참고).
  const calendarRecordDates = useMemo(() => mockCalendarRecordDateKeys(todayKey), [todayKey]);
  const weekDoneDates = useMemo(() => mockWeekDoneDateKeys(todayKey), [todayKey]);

  const stats = useMemo(
    () => buildMockStats(selectedKey, month, calendarRecordDates),
    [selectedKey, month, calendarRecordDates],
  );

  const weekDays = useMemo<StreakWeekDay[]>(() => {
    const done = new Set(weekDoneDates);
    return weekDateKeys(todayKey).map((dateKey) => ({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
      dayOfMonth: dayOfDateKey(dateKey),
      state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
    }));
  }, [todayKey, weekDoneDates]);

  // 정렬은 V1.0에서 최신순 고정이다(토글은 M2+). Figma 예시 리스트는 이른 시각부터 그려져 있지만
  // 라벨("최신순")과 wiki 확정(design.md 6차 · voice-tone §4)이 최신순이므로 그쪽을 따른다.
  const sessions = useMemo(
    () => [...stats.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [stats],
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
              studiedDates={stats.studiedDatesInMonth}
              onSelectDate={setSelectedKey}
              // TODO(SCR-S5-records.md): 월 이동 시 선택일 처리가 미확정이다(선택 해제 / 그 달 1일 /
              // 마지막 기록일). 확정 전까지 선택일을 건드리지 않는다 — 달력 표시만 바뀐다.
              onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
              onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
            />
          </View>

          <View className="mt-6 gap-2.5">
            <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
              {summaryTitle(selectedKey)}
            </Text>
            <SummaryTiles stats={stats} />
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
        </View>
      </View>
    </ScrollView>
  );
}
