/**
 * 타임랩스 촬영 차례와 사진 고르기 규칙
 *
 * 공부할 시간을 미리 알 수 없어 간격을 미리 정하지 않는다.
 * 넉넉히 찍다가 720장이 되면 절반을 지우고 간격을 두 배로 늘린다.
 * 세션이 끝나면 남은 사진에서 고르게 360장을 남긴다.
 */

export const CAPTURE_START_INTERVAL_MS = 10_000;
export const THIN_AT_COUNT = 720;
export const FINAL_PHOTO_COUNT = 360;

/**
 * 찍을 차례 판정
 *
 * 아직 찍은 적이 없으면 바로 찍는다.
 * 이어받은 세션도 첫 틱에 한 장 남긴다.
 */
export function isCaptureDue(
  nowMs: number,
  lastShotAtMs: number | null,
  intervalMs: number,
): boolean {
  return lastShotAtMs === null || nowMs - lastShotAtMs >= intervalMs;
}

/**
 * 찍은 뒤 다음 차례의 기준 시각
 *
 * 차례는 틱 시작에 판단하고 찍은 시각은 추론과 압축이 끝난 뒤에 기록되므로, 찍은 시각을 기준으로 삼으면 그 지연 때문에 한 틱씩 늦게 찍혀 간격이 11초가 된다.
 * 추론이 1초를 넘겨 틱이 버려지는 기기에서도 같은 지연이 장마다 쌓인다.
 * 그래서 예정 시각에 간격을 더한 값을 기준으로 두어 지연을 다음 차례에 되돌린다.
 * 백그라운드 복귀처럼 한 간격 넘게 밀렸으면 밀린 장을 몰아 찍지 않도록 찍은 시각을 새 기준으로 잡는다.
 */
export function nextAnchorMs(
  shotAtMs: number,
  lastShotAtMs: number | null,
  intervalMs: number,
): number {
  if (lastShotAtMs === null) return shotAtMs;
  const scheduledMs = lastShotAtMs + intervalMs;
  return shotAtMs - scheduledMs >= intervalMs ? shotAtMs : scheduledMs;
}

/**
 * 솎을 때 지울 사진
 *
 * 시간 순서로 받아 첫 장을 남기고 한 장 걸러 고른다.
 */
export function thinningDrops<T>(items: readonly T[]): T[] {
  return items.filter((_, index) => index % 2 === 1);
}

/**
 * 시간 순서 목록에서 처음과 끝을 포함해 고르게 count개 고르기
 *
 * 고르는 칸 사이가 1보다 넓으므로 반올림해도 같은 칸을 두 번 고르지 않는다.
 */
export function selectEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = (items.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => items[Math.round(index * step)] as T);
}
