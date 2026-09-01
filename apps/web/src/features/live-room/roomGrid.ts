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

/** 순공시간 표시 형식 HH:MM, 예: 03:25 */
export function formatStudyHhMm(studySeconds: number): string {
  const hours = Math.floor(studySeconds / 3600);
  const minutes = Math.floor((studySeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
