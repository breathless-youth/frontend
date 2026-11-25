/**
 * 하루 순공(또는 목표 시간)이 속한 지급 구간
 *
 * 서버는 하루 순공이 쌓일수록 다음 구간의 값을 준다.
 * 구간은 시작 이상, 끝 미만이고, 서버가 순서를 보장하지 않아도 되도록 시작 순으로 다시 늘어놓는다.
 * 하루 상한에 닿았거나 넘었으면 마지막 구간, 첫 구간보다 앞이면 첫 구간을 고른다.
 * 구간이 없으면 null이라 부른 쪽이 예전 서버의 단일 값으로 그린다.
 */
export function tierAt<T extends { fromSec: number; toSec: number }>(
  tiers: readonly T[],
  sec: number,
): T | null {
  const sorted = [...tiers].sort((a, b) => a.fromSec - b.fromSec);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  if (sec < first.fromSec) {
    return first;
  }
  return sorted.find((tier) => sec >= tier.fromSec && sec < tier.toSec) ?? last;
}
