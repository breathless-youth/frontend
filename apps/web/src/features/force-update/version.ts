/**
 * 강제 업데이트 버전 판정.
 *
 * 최소 버전은 하드코딩 상수다. BY-586부터 새 바이너리는 네이티브가 Firebase Remote Config로 판정하고
 * `nativeUpdateGate=1`을 붙여 이 게이트를 건너뛴다 — 이 상수는 그 표시가 없는 **구버전 바이너리 전용**이며,
 * 그 바이너리를 막아야 할 때만 올리고 웹을 배포한다(BE API 경로 BY-535·536은 BY-586이 대체했다).
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

// 앱 버전은 항상 x.y.z 3자리다.
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * appVersion이 없거나(브라우저 단독 접속) 형식이 이상하면 절대 막지 않는다(fail-open)
 */
export function shouldForceUpdate(appVersion: string | null): boolean {
  if (!appVersion || !VERSION_PATTERN.test(appVersion)) return false;
  return compareVersions(appVersion, minSupportedVersion()) < 0;
}
