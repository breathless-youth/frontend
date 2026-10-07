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
