/** S1 홈 화면의 시간 표시 포맷 유틸 — 순수 함수라 별도 테스트 대상으로 분리한다. */

export function splitHoursMinutes(totalSeconds: number) {
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}

export function formatHoursMinutes(totalSeconds: number): string {
  const { hours, minutes } = splitHoursMinutes(totalSeconds);
  return `${hours}시간 ${minutes}분`;
}

export function formatMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)}분`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 예: "7월 26일 일요일". `now`를 주입 가능하게 해 테스트 가능하게 한다(기본값은 현재 시각). */
export function todayLabel(now: Date = new Date()): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`;
}
