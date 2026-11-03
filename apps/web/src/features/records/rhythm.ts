import type { StudyRhythmResponse } from "@focusmakers/types";

/**
 * 나의 공부 리듬 — 서버 격자(`GET /api/stats/rhythm`)를 카드가 그릴 모양으로 바꾸는 순수 계산.
 *
 * 누적 공부일이 14일이 되기 전엔 샘플 카드를 그대로 두고, 14일부터 내 히트맵을 보여 준다. 운영 데이터로
 * 보면 14일을 채운 사람은 일곱 요일에 모두 기록이 있어 처음으로 "리듬"처럼 읽힌다(그 전엔 띠 몇 개뿐이다).
 */
export const RHYTHM_MIN_STUDY_DAYS = 14;

/** 하루 시작 시각 — 플래너·히트맵 가로축과 같은 5시(다음 날 4시까지). */
export const RHYTHM_DAY_START_HOUR = 5;

/** 가장 많이 공부한 구간의 길이(시간). 문장과 히트맵 테두리가 같은 구간을 가리킨다. */
export const PEAK_SPAN_HOURS = 2;

export type StudyRhythm = {
  studyDays: number;
  /** 요일(월=0) × 칸(5시부터 24칸)의 농도 0~5. 가장 진한 칸을 5로 두고, 기록이 있으면 최소 1이다. */
  levels: number[][];
  /** 순공 합이 가장 큰 연속 2시간의 시작 칸(0~23, 5시 기준). */
  peakColumn: number;
  /** 같은 구간의 시작 시각(0~23, 시계 시각). */
  peakStartHour: number;
};

const columnToHour = (column: number) => (column + RHYTHM_DAY_START_HOUR) % 24;

/** 14일 전이면 null — 호출부는 샘플 카드를 그린다. */
export function buildStudyRhythm(response: StudyRhythmResponse): StudyRhythm | null {
  if (response.studyDays < RHYTHM_MIN_STUDY_DAYS) {
    return null;
  }
  // 시계 시각 → 5시 시작 칸으로 돌린다.
  const grid = response.focusSecByWeekdayHour.map((row) =>
    Array.from({ length: 24 }, (_, column) => row[columnToHour(column)] ?? 0),
  );
  const max = Math.max(0, ...grid.flat());
  const levels = grid.map((row) =>
    row.map((sec) => (sec === 0 || max === 0 ? 0 : Math.max(1, Math.ceil((sec / max) * 5)))),
  );

  const columnTotals = Array.from({ length: 24 }, (_, column) =>
    grid.reduce((sum, row) => sum + (row[column] ?? 0), 0),
  );
  // 하루(5시~다음 날 4시) 안의 연속 2시간 중 합이 가장 큰 첫 구간. 날짜 경계(4시→5시)는 잇지 않는다.
  let peakColumn = 0;
  let peakSum = -1;
  for (let column = 0; column <= 24 - PEAK_SPAN_HOURS; column++) {
    const sum = columnTotals.slice(column, column + PEAK_SPAN_HOURS).reduce((a, b) => a + b, 0);
    if (sum > peakSum) {
      peakSum = sum;
      peakColumn = column;
    }
  }

  return {
    studyDays: response.studyDays,
    levels,
    peakColumn,
    peakStartHour: columnToHour(peakColumn),
  };
}

export type PeakRangeParts = {
  /** 하루 구간 이름 키 — 구간 가운데 시각 기준(아침 5~9 · 오전 9~12 · 오후 12~18 · 저녁 18~22 · 밤 22~2 · 새벽 2~5). */
  period: "morning" | "forenoon" | "afternoon" | "evening" | "night" | "dawn";
  from12: number;
  to12: number;
  /** 정오를 넘는 구간(11~13시)은 "오전 11시~오후 1시"처럼 나눠 쓴다. 두 언어 모두 AM/PM 대신 구간 이름을 쓴다. */
  crossesNoon: boolean;
};

const to12 = (hour: number) => (hour % 12 === 0 ? 12 : hour % 12);

function periodOf(midHour: number): PeakRangeParts["period"] {
  if (midHour >= 5 && midHour < 9) return "morning";
  if (midHour >= 9 && midHour < 12) return "forenoon";
  if (midHour >= 12 && midHour < 18) return "afternoon";
  if (midHour >= 18 && midHour < 22) return "evening";
  if (midHour >= 22 || midHour < 2) return "night";
  return "dawn";
}

/** 문장에 넣을 구간 표기 재료 — 번역 키가 조합한다(`records:rhythm.range*`). */
export function peakRangeParts(startHour: number): PeakRangeParts {
  const endHour = (startHour + PEAK_SPAN_HOURS) % 24;
  const midHour = (startHour + PEAK_SPAN_HOURS / 2) % 24;
  return {
    period: periodOf(midHour),
    from12: to12(startHour),
    to12: to12(endHour),
    crossesNoon: startHour < 12 && startHour + PEAK_SPAN_HOURS > 12,
  };
}
