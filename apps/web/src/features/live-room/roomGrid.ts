/**
 * 인원수 자동 그리드 계산. 스크롤 없이 전원이 항상 한 화면에 들어간다.
 *
 * 1명은 풀스크린으로 타일 크롬 없이 내 카메라만 그리고, 2명은 1열 2행으로 타일 높이가
 * 화면의 1/2이다. 3명 이상은 2열에 타일 높이 1/3 — 명세가 3~4명도 5~6명과 같은 타일
 * 크기를 요구해서, rows가 아니라 rowUnit(화면 세로를 몇 등분한 높이인가)으로 표현하고
 * 3~4명 블록은 세로 중앙 정렬한다.
 */
export type RoomGridSpec = { mode: "fullscreen" } | { mode: "grid"; cols: 1 | 2; rowUnit: 2 | 3 };

export function roomGridSpec(count: number): RoomGridSpec {
  if (count <= 1) {
    return { mode: "fullscreen" };
  }
  if (count === 2) {
    return { mode: "grid", cols: 1, rowUnit: 2 };
  }
  return { mode: "grid", cols: 2, rowUnit: 3 };
}

/** 순공시간 표시 형식 HH:MM, 예: 03:25 */
export function formatStudyHhMm(studySeconds: number): string {
  const hours = Math.floor(studySeconds / 3600);
  const minutes = Math.floor((studySeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
