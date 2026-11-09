import type { GroupTranslationLanguage } from "@focusmakers/types";

import i18n from "./i18n";

/**
 * 그룹 번역을 받을 언어
 *
 * 서버는 번체를 지역과 관계없이 zh-TW 하나로 번역해서 화면의 zh-Hant를 zh-TW로 보낸다.
 * 간체처럼 화면 문구가 없는 기기는 이미 영어 화면이라 그 밖의 값은 en으로 맞춘다.
 */
export function toGroupRequestLocale(language: string): GroupTranslationLanguage {
  if (language === "ko" || language === "ja") return language;
  if (language === "zh-Hant") return "zh-TW";
  return "en";
}

/** 화면 언어는 문서를 연 뒤 바뀌지 않아 부를 때마다 읽는다. */
export function groupRequestLocale(): GroupTranslationLanguage {
  return toGroupRequestLocale(i18n.language);
}
