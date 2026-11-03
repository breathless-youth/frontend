import i18n, { type Resource, type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";

import { type AppLocale, LOCALE_STORAGE_KEY, resolveLocale, SUPPORTED_LOCALES } from "./locale";

/**
 * 문구 카탈로그와 i18next 초기화
 *
 * 카탈로그 JSON은 `locales/<언어>/<네임스페이스>.json`을 두기만 하면 자동으로 실린다.
 * 두 언어를 합쳐도 수십 KB라 지연 로딩하지 않고 첫 렌더 전에 동기로 초기화한다.
 */
type CatalogModules = Record<string, { default: ResourceKey }>;

export function buildResources(modules: CatalogModules): Resource {
  const resources: Resource = {};
  for (const [path, mod] of Object.entries(modules)) {
    // glob 키는 부르는 파일 위치에 따라 `../locales/ko/x.json`이나 `../ko/x.json`이 되므로 마지막 두 조각만 본다.
    const match = /([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, lng, ns] = match;
    resources[lng] = { ...resources[lng], [ns]: mod.default };
  }
  return resources;
}

export function decideInitialLocale(): AppLocale {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // 저장소를 막은 브라우저에서는 저장값 없이 정한다.
  }
  const lng = resolveLocale(location.search, navigator.language, stored);
  try {
    sessionStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    // 저장하지 못하면 문서를 새로 열 때 navigator.language로 다시 정한다.
  }
  return lng;
}

// i18next 인스턴스는 전역 하나라, 이 모듈이 다시 평가돼도(테스트의 vi.resetModules) 정해 둔 언어를 덮지 않게 한다.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: decideInitialLocale(),
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: "en",
    defaultNS: "common",
    resources: buildResources(
      import.meta.glob<{ default: ResourceKey }>("../locales/*/*.json", { eager: true }),
    ),
    interpolation: { escapeValue: false },
    initAsync: false,
  });
}

export default i18n;
