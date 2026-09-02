/**
 * 강제 업데이트 버전 판정.
 *
 * TODO: 최소 버전은 지금은 하드코딩 상수지만, BY-536에서 서버 API로 바뀔 예정이라 그 시점에 `minSupportedVersion()` 내부만 고치면 되도록 함수 하나로 감싼다 — 호출부는 이 함수만 본다.
 */
export const MIN_SUPPORTED_VERSION = "1.0.0";

export function minSupportedVersion(): string {
  return MIN_SUPPORTED_VERSION;
}

/** "1.0.10" 같은 두 자릿수 세그먼트까지 숫자로 비교한다(문자열 비교였다면 "1.0.10" < "1.0.9"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const as = a.split(".").map(Number);
  const bs = b.split(".").map(Number);
  const length = Math.max(as.length, bs.length);

  for (let i = 0; i < length; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    // 세그먼트가 숫자가 아니면(예: "1.0.x") 비교 불능 - "같다"로 안전하게 처리한다.
    // 실제 강제 여부 판단은 shouldForceUpdate가 이런 값을 애초에 걸러내 fail-open한다.
    if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/**
 * appVersion이 없거나(브라우저 단독 접속) 형식이 이상하면 절대 막지 않는다(fail-open)
 */
export function shouldForceUpdate(appVersion: string | null): boolean {
  if (!appVersion || !VERSION_PATTERN.test(appVersion)) return false;
  return compareVersions(appVersion, minSupportedVersion()) < 0;
}
