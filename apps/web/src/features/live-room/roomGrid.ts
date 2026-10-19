/**
 * 인원수 자동 그리드 계산 — 세로 화면 기준값.
 *
 * 1명은 풀스크린으로 타일 크롬 없이 내 카메라만 그리고, 2명부터는 인원이 만드는 행 수가
 * 화면 세로를 그대로 나눈다(rowUnit = 화면 세로를 몇 등분한 높이인가): 2명 1열 2행,
 * 3~4명 2열 2행, 5~6명 2열 3행. **인원이 적으면 타일이 커져 화면을 채운다** —
 * Zoom/Meet의 갤러리 뷰와 같은 방식(2026-08-25 A안 확정). 종전 명세의 "3~4명도 5~6명과
 * 같은 타일 크기(1/3)"는 하단 1/3이 빈 채로 남아 이 결정으로 대체됐다. 7명 이상은
 * rowUnit 3 초과분이 세로 스크롤로 넘어가며 그리드는 상단부터 시작한다.
 *
 * 가로 화면 배치(2명 1행 2열, 3명 이상 2열에 행 높이 1/2 + 세로 스크롤)는 뷰포트
 * 미디어 조건이라 CSS landscape 변형이 담당한다 — 여기서는 세로 기준만 계산한다.
 * 폭 600 이상이면서 landscape-compact가 아닌 창은 아래 bestSquareGrid가 배치를 정한다.
 */
export type RoomGridSpec = { mode: "fullscreen" } | { mode: "grid"; cols: 1 | 2; rowUnit: 2 | 3 };

export function roomGridSpec(count: number): RoomGridSpec {
  if (count <= 1) {
    return { mode: "fullscreen" };
  }
  if (count === 2) {
    return { mode: "grid", cols: 1, rowUnit: 2 };
  }
  return { mode: "grid", cols: 2, rowUnit: count <= 4 ? 2 : 3 };
}

/** 정사각 타일 격자 배치. `size`는 타일 한 변(px)이다. */
export type SquareGridFit = { cols: number; rows: number; size: number };

/**
 * 정사각 타일이 가장 커지는 열 수
 *
 * 열 수마다 칸 폭과 높이에서 간격을 빼고 타일 한 변을 구해 가장 큰 쪽을 고른다.
 * 크기가 같으면 열이 적은 쪽을 고른다.
 * 한 변은 정수 px로 내린다.
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
    const size = Math.max(
      0,
      Math.floor(Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows)),
    );
    if (size > best.size) {
      best = { cols, rows, size };
    }
  }
  return best;
}

/** 순공시간 표시 형식 HH:MM, 예: 03:25 */
export function formatStudyHhMm(focusSec: number): string {
  const hours = Math.floor(focusSec / 3600);
  const minutes = Math.floor((focusSec % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
