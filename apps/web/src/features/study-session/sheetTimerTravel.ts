/** 시트가 다 열렸을 때 순공 타이머가 앉는 높이(뷰포트 비율) — 상태 필 바로 아래(시안 122/874). */
const SHEET_OPEN_TIMER_TOP = 0.14;

/** `index.css`의 `landscape-compact` variant와 같은 경계(30rem)다. 둘이 어긋나면 배치와 이동 거리가 따로 논다. */
const LANDSCAPE_COMPACT_MAX_HEIGHT = 480;

/**
 * 과목 시트가 다 열렸을 때 순공 타이머가 올라가야 하는 거리
 *
 * 폰 가로 거치 배치에서는 타이머가 이미 위쪽 칸에 있어 움직이지 않는다.
 * 태블릿 가로는 세로 배치를 쓰므로 세로와 같이 계산한다.
 */
export function sheetTimerTravel(offsetTop: number, width: number, height: number): number {
  const landscapeCompact = width > height && height < LANDSCAPE_COMPACT_MAX_HEIGHT;
  return landscapeCompact ? 0 : Math.max(0, offsetTop - height * SHEET_OPEN_TIMER_TOP);
}
