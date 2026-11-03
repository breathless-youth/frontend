import { copy, getAppLocale, type CopyKey } from "./i18n";
import { getRemoteConfigString } from "./remoteConfig";

/**
 * 콘솔(Remote Config) 문구 읽기 공통 (BY-586·BY-608).
 *
 * activate가 끝난 뒤에 부른다(`resolveForceUpdate` 이후). 값을 다듬은 결과가 비어 있거나 읽기에 실패하면 앱
 * 기본 문구다 — 콘솔에서 실수로 빈 값을 게시해도 빈 알림창이 뜨지 않는다. 각 문구 모듈의 기본값은
 * `lib/forceUpdate.ts`의 `UPDATE_CONFIG_DEFAULTS`에 함께 등록한다(RNFB `setDefaults`는 맵을 통째로 바꿈).
 *
 * 영어 기기는 `<key>_en`을 읽고, 없으면 원래 키가 아니라 영어 기본 문구를 쓴다.
 * 원래 키에는 한국어 문구가 들어 있어서 영어 화면에 한국어가 섞이지 않게 한다.
 */
export function readCopyOr(key: string, copyKey: CopyKey): string {
  const locale = getAppLocale();
  const fallback = copy[locale][copyKey];
  try {
    const value = getRemoteConfigString(locale === "ko" ? key : `${key}_en`).trim();
    return value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}
