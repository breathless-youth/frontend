import { copy, getAppLocale, type CopyKey } from "./i18n";
import { getRemoteConfigString } from "./remoteConfig";

/**
 * 콘솔 Remote Config 문구 읽기 공통 함수
 *
 * activate가 끝난 뒤, 즉 resolveForceUpdate 다음에 부른다.
 * 값을 다듬은 결과가 비어 있거나 읽기에 실패하면 앱 기본 문구를 써서 콘솔에서 실수로 빈 값을 게시해도 빈 알림창이 뜨지 않는다.
 * 각 문구 모듈의 기본값은 lib/forceUpdate.ts의 UPDATE_CONFIG_DEFAULTS에 함께 등록하는데, RNFB setDefaults가 맵을 통째로 바꾸기 때문이다.
 * 한국어가 아닌 기기는 원래 키에 언어 접미사(_en, _ja, _zh_hant)를 붙인 키를 읽고, 비면 원래 키가 아니라 그 언어의 기본 문구를 쓴다.
 * 원래 키에는 한국어 문구가 들어 있어서 다른 언어 화면에 한국어가 섞이지 않게 한다.
 */
export function readCopyOr(key: string, copyKey: CopyKey): string {
  const locale = getAppLocale();
  const fallback = copy[locale][copyKey];
  const localeKey = locale === "ko" ? key : `${key}_${locale.toLowerCase().replace("-", "_")}`;
  try {
    const value = getRemoteConfigString(localeKey).trim();
    return value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}
