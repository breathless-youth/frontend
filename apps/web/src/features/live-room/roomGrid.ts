/** 정사각 타일 격자 배치. `size`는 타일 한 변(px)이다. */
export type SquareGridFit = { cols: number; rows: number; size: number };

/**
 * 정사각 타일이 가장 커지는 열 수
 *
 * 열 수마다 칸 폭과 높이에서 간격을 빼고 타일 한 변을 구해 가장 큰 쪽을 고른다.
 * 크기가 같으면 열이 적은 쪽을 고른다.
 * 내린 값으로 비교하면 소수점 차이로 더 큰 배치를 놓친다.
 * 그래서 비교는 원래 크기로 하고 고른 한 변만 정수 px로 내린다.
 * 소수가 남으면 한 줄 폭이 칸보다 미세하게 넓어져 마지막 타일이 다음 줄로 넘어간다.
 */
export function bestSquareGrid(
  count: number,
  width: number,
  height: number,
  gap: number,
): SquareGridFit {
  let best: SquareGridFit = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const size = Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows);
    if (size > best.size) {
      best = { cols, rows, size };
    }
  }
  return { ...best, size: Math.floor(best.size) };
}

/** 순공시간 표시 형식 HH:MM, 예: 03:25 */
export function formatStudyHhMm(focusSec: number): string {
  const hours = Math.floor(focusSec / 3600);
  const minutes = Math.floor((focusSec % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
