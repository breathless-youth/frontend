const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * 순공 시계 표기
 *
 * 누적 순공은 100시간을 넘을 수 있어 시는 자리 수를 정하지 않고 분과 초만 두 자리로 채운다.
 */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}:${pad2(minutes)}:${pad2(sec % 60)}`;
}
