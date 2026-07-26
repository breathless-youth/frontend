import type { StudyEventStatus, StudySessionEventCounts } from "@focuson/types";

/**
 * S5 기록 화면 전용 표기·달력 유틸 — 순수 함수라 테스트 대상으로 분리한다.
 *
 * 스펙(`frontend/docs/screens/SCR-S5-records.md` Implementation Notes 9)은 이 유틸을
 * `records.tsx` 옆에 두라고 하지만, `app/` 아래 파일은 확장자가 `.ts`여도 expo-router가 라우트로
 * 등록한다(`node_modules/expo-router/_ctx.js`의 정규식이 `\.[jt]sx?$`) — 그래서 S1의
 * `lib/homeFormat.ts`와 같은 자리에 둔다. 다른 화면(S1·S4)이 같은 규칙을 쓰게 되면 그때 합친다
 * (지금 미리 공통 모듈로 빼지 않는다 — 과도한 추상화 금지).
 *
 * 표기 규칙 원본은 `ai-wiki/product/voice-tone.md` §2·§4다 — 의역하지 않는다.
 */

/** KST(UTC+9) 고정 오프셋. 한국은 서머타임이 없어 상수로 충분하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 달력 요일 헤더·주간 체크 도트 라벨(Figma S5 `65:649`~`65:655`). */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type CalendarMonth = {
  year: number;
  /** 1~12 (JS Date의 0-based month가 아니다) */
  month: number;
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * UTC 시각을 KST 벽시계로 옮긴 Date. 옮긴 뒤에는 반드시 `getUTC*`로 읽는다 —
 * 기기 시간대에 의존하지 않기 위해서다(서버 통계 귀속 날짜 `statDate`가 KST 기준이다).
 */
function toKstWallClock(value: string | Date): Date {
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  return new Date(ms + KST_OFFSET_MS);
}

/** `YYYY-MM-DD`(KST 기준). `now`를 주입 가능하게 해 테스트 가능하게 한다. */
export function kstDateKey(now: Date = new Date()): string {
  const kst = toKstWallClock(now);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyOf(utcDate: Date): string {
  return `${utcDate.getUTCFullYear()}-${pad2(utcDate.getUTCMonth() + 1)}-${pad2(utcDate.getUTCDate())}`;
}

/** `YYYY-MM-DD`에 일수를 더한 새 키. 음수면 과거로 간다. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  return dateKeyOf(new Date(parseDateKey(dateKey).getTime() + days * DAY_MS));
}

/** 일=0 … 토=6 */
export function weekdayIndexOfDateKey(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDay();
}

export function dayOfDateKey(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDate();
}

export function monthOfDateKey(dateKey: string): CalendarMonth {
  const date = parseDateKey(dateKey);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** 달력 헤더 `{YYYY}년 {M}월` (Figma `65:648`). */
export function monthLabel({ year, month }: CalendarMonth): string {
  return `${year}년 ${month}월`;
}

/** 요약 타이틀 `{N}월 {N}일 학습 요약` (voice-tone §2 날짜 표기). */
export function summaryTitle(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 학습 요약`;
}

/**
 * 월 달력 그리드. 일요일 시작 7열 고정이고, 앞뒤 빈칸은 `null`이다
 * (이전/다음 달 날짜를 흘려 그리지 않는다 — Figma도 빈칸으로 둔다).
 */
export function buildMonthGrid({ year, month }: CalendarMonth): (string | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad2(month)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

/** `dateKey`가 속한 주(일~토) 7일의 키. 월 경계를 넘는 주도 그대로 이어진다. */
export function weekDateKeys(dateKey: string): string[] {
  const sunday = addDaysToDateKey(dateKey, -weekdayIndexOfDateKey(dateKey));
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(sunday, i));
}

/** `YYYY-MM-DD`는 사전순 비교가 곧 시간순 비교다. */
export function isFutureDateKey(dateKey: string, todayKey: string): boolean {
  return dateKey > todayKey;
}

/**
 * 시간 길이 표기(voice-tone §2, 전 화면 공통): 1시간 이상 → `N시간 M분`(M=0이면 `N시간`) ·
 * 1시간 미만 → `M분` · 1분 미만 → `S초`.
 *
 * 진행 중 타이머의 `HH:MM:SS` 규칙은 이 화면에 적용하지 않는다(기록은 전부 한글 길이 표기).
 * 0초만 예외로 `0분`이다 — 선택일 빈 상태에서 요약 타일이 `0초`로 보이지 않게 하기 위한 것으로,
 * 스펙 빈 상태 절이 예시로 든 표기(`0분`/`0%`/`0회`)를 그대로 따른 것이다.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) {
    return "0분";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${seconds}초`;
}

/** UTC ISO-8601 → KST `HH:MM`(24시간제). */
export function formatKstClock(iso: string): string {
  const kst = toKstWallClock(iso);
  return `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
}

/**
 * 세션 메타 `HH:MM – HH:MM · 총 {시간 길이}` (voice-tone §2 세션 시각 범위 — 구분자는 엔대시 `–`).
 *
 * `studySec`에는 일시정지 시간이 빠져 있어 `endedAt − startedAt`과 다를 수 있다 —
 * 버그가 아니다(`mvp-scope.md` 일시정지 벽시계 별도 집계).
 */
export function formatSessionMeta(startedAt: string, endedAt: string, studySec: number): string {
  return `${formatKstClock(startedAt)} – ${formatKstClock(endedAt)} · 총 ${formatDuration(studySec)}`;
}

/**
 * 집중률 표시. 서버는 소수 1자리로 내려주고 Figma는 정수(`76%`·`77%`)라 정수 반올림한다.
 * TODO(SCR-S5-records.md Review Checklist): 반올림 규칙 미확정 — 확정되면 여기만 고친다.
 */
export function formatFocusRate(focusRate: number): string {
  return `${Math.round(focusRate)}%`;
}

/** 공부 횟수 표기 `N회`(glossary 노출 표기). */
export function formatSessionCount(count: number): string {
  return `${count}회`;
}

/**
 * S5 이벤트 칩의 축약 라벨. **횟수만 쓴다 — 시간을 붙이지 않는다.**
 * `N회 · 시간`(예: `2회 · 9분 40초`)은 S4 공부 결과의 유형별 통계 행 표기이고, S5 기록 리스트
 * 뱃지는 축약형(`자리 이탈 N회`)이다(`voice-tone.md` §4, `glossary.md` 축약 규칙,
 * Figma `Record / Session Item` 66:651에도 시간 표시가 없다). 같은 이유로 유형 라벨도
 * 축약형(`휴대폰`)이지 S4의 전체 라벨(`휴대폰 사용`)이 아니다.
 *
 * `화면 꺼짐`은 2026-07-26에 `일시정지`로 통합되어 삭제된 라벨이라 쓰지 않는다.
 */
const EVENT_SHORT_LABELS: Record<StudyEventStatus, string> = {
  AWAY: "자리 이탈",
  PHONE: "휴대폰",
  DEVICE: "기기 조작",
  PAUSE: "일시정지",
};

/** 칩 노출 순서 — Figma 예시(자리 이탈 → 휴대폰)와 스펙 매핑 표 순서를 따른다. */
const EVENT_CHIP_ORDER: StudyEventStatus[] = ["AWAY", "PHONE", "DEVICE", "PAUSE"];

export type EventChipItem = {
  status: StudyEventStatus;
  label: string;
};

/**
 * 0인 상태는 칩을 그리지 않는다(키는 항상 0으로 내려온다).
 *
 * ⚠️ 서버가 준 값을 그대로 쓴다. `eventCounts`에 하향 편차(실제 횟수보다 작게 내려올 수 있음)가
 * 있다는 상류 이슈가 보고돼 있지만, 그 정책(ⓐ버림 유지/ⓑ1초 올림/ⓒ입력단 디바운스)은
 * 리더 결정 대기 중이다 — 화면에서 값을 보정하거나 문구를 덧붙이지 않는다
 * (`SCR-S5-records.md`의 "이벤트 카운트가 실제 횟수보다 작을 수 있다" 절).
 */
export function eventChipItems(eventCounts: StudySessionEventCounts): EventChipItem[] {
  return EVENT_CHIP_ORDER.filter((status) => eventCounts[status] > 0).map((status) => ({
    status,
    label: `${EVENT_SHORT_LABELS[status]} ${eventCounts[status]}회`,
  }));
}
