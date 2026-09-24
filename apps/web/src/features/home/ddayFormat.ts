const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

/**
 * 목표일까지 남은 날. 기기 로컬 날짜 기준이라 사용자가 보는 달력과 같고, 자정을 넘기면
 * 홈에 다시 들어올 때 바뀐다. 당일은 0, 지난 뒤는 음수.
 */
export function daysUntil(targetDate: string, now: Date = new Date()): number {
  const [year, month, day] = targetDate.split("-").map(Number);
  const target = localMidnight(year, month - 1, day);
  const today = localMidnight(now.getFullYear(), now.getMonth(), now.getDate());
  // 서머타임이 있는 지역에서 하루가 23·25시간일 수 있어 나눗셈 뒤 반올림한다
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** `D-52` · `D-Day` · `D+3` */
export function formatDday(daysLeft: number): string {
  if (daysLeft === 0) {
    return "D-Day";
  }
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
}

/** 날짜 입력의 `min` — 기기 로컬 오늘을 `YYYY-MM-DD`로. */
export function todayLocalDateKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 시트가 접혔을 때 칩에 보이는 날짜 — `11월 18일 (목)`. */
export function formatKoreanDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = localMidnight(year, month - 1, day);
  return `${month}월 ${day}일 (${WEEKDAY_KO[date.getDay()]})`;
}
