/** Date.parse가 버리는 소수 밀리초도 서버 Instant와 같은 정밀도로 비교한다. */
export function recordTimeOrder(iso: string | null | undefined, fallbackMs: number): bigint {
  const ms = iso ? Date.parse(iso) : fallbackMs;
  const fraction = iso?.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
  const subMillisecond = fraction?.padEnd(9, "0").slice(3, 9) ?? "0";
  return BigInt(ms) * 1_000_000n + BigInt(subMillisecond);
}
