import { getRemoteConfigString } from "./remoteConfig";

/**
 * 콘솔(Remote Config) 문구 읽기 공통 (BY-586·BY-608).
 *
 * activate가 끝난 뒤에 부른다(`resolveForceUpdate` 이후). 값을 다듬은 결과가 비어 있거나 읽기에 실패하면 앱
 * 기본 문구다 — 콘솔에서 실수로 빈 값을 게시해도 빈 알림창이 뜨지 않는다. 각 문구 모듈의 기본값은
 * `lib/forceUpdate.ts`의 `UPDATE_CONFIG_DEFAULTS`에 함께 등록한다(RNFB `setDefaults`는 맵을 통째로 바꿈).
 */
export function readCopyOr(key: string, fallback: string): string {
  try {
    const value = getRemoteConfigString(key).trim();
    return value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}
