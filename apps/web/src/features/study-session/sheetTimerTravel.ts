/** 시트가 다 열렸을 때 순공 타이머가 앉는 높이(뷰포트 비율) — 상태 필 바로 아래(시안 122/874). */
const SHEET_OPEN_TIMER_TOP = 0.14;

/** `index.css`의 `landscape-compact` variant와 같은 경계(30rem)다. 둘이 어긋나면 배치와 이동 거리가 따로 논다. */
const LANDSCAPE_COMPACT_MAX_HEIGHT = 480;

/** `index.css`의 `sm` 브레이크포인트(37.5rem)와 같은 값이다. */
const SM_MIN_WIDTH = 600;

/** `SubjectSheet.tsx`의 `--sheet-top`(27svh)과 같은 값이다. 둘이 어긋나면 올라온 타이머가 시트에 가린다. */
const SHEET_TOP = 0.27;

/** 올라온 타이머 아랫변과 시트 윗변 사이에 남기는 여백(px)이다. */
const SHEET_TIMER_GAP = 8;

/**
 * 과목 시트가 다 열렸을 때 순공 타이머가 올라가야 하는 거리
 *
 * 폰 가로 거치 배치에서는 타이머가 이미 위쪽 칸에 있어 움직이지 않는다.
 * 태블릿 가로는 세로 배치를 쓰므로 세로와 같이 계산한다.
 * 폭 600 이상 창은 타이머가 커서 비율 목표에 두면 시트 윗변과 겹친다.
 * 그래서 시트 윗변에서 타이머 높이와 여백만큼 위를 상한으로 둔다.
 * 폭 600 미만에는 상한을 걸지 않아 폰 결과가 바뀌지 않는다.
 */
export function sheetTimerTravel(
  offsetTop: number,
  slotHeight: number,
  width: number,
  height: number,
): number {
  const landscapeCompact = width > height && height < LANDSCAPE_COMPACT_MAX_HEIGHT;
  if (landscapeCompact) {
    return 0;
  }
  let target = height * SHEET_OPEN_TIMER_TOP;
  if (width >= SM_MIN_WIDTH) {
    target = Math.max(0, Math.min(target, height * SHEET_TOP - slotHeight - SHEET_TIMER_GAP));
  }
  return Math.max(0, offsetTop - target);
}
