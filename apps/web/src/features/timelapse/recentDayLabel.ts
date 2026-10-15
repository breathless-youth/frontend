import { WEEKDAY_LABELS } from "@/features/records/recordsFormat";

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 카드 날짜. 오늘·어제는 말로, 그 밖에는 `M월 D일`로 쓴다. */
export function recentDayLabel(startedAtMs: number, nowMs: number): string {
  const days = Math.round((startOfDay(nowMs) - startOfDay(startedAtMs)) / DAY_MS);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  const date = new Date(startedAtMs);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function clock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 전체 목록 한 줄의 날짜와 시각. 기록·결과 화면과 같은 엔대시로 잇는다. */
export function timelapseRangeLabel(startedAtMs: number, endedAtMs: number): string {
  const date = new Date(startedAtMs);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]}) ${clock(startedAtMs)} – ${clock(endedAtMs)}`;
}

/** 같은 날 여러 타임랩스를 스크린리더가 구분하도록 시작 시각까지 붙인다. */
export function timelapseStartLabel(startedAtMs: number): string {
  const date = new Date(startedAtMs);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${clock(startedAtMs)}`;
}
