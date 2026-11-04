---
name: i18n-foundation
description: "FocusMakers 국제화 기반을 만드는 방법. 웹은 react-i18next 초기화, resolveLocale, index.html lang, intl.ts(Intl.DateTimeFormat), common 네임스페이스, 카탈로그 타입·키 집합 가드, 린트 적용 범위 골격, 테스트 ko 초기화. 모바일은 expo-localization, 셸 t(), 웹뷰 ?lang 전달, Remote Config _en 키, Android strings.xml, CFBundleLocalizations·locales 스토어 메타. i18n-infra-builder가 BY-808·BY-811에서 읽는다. i18n 초기화, 로케일 결정, 번역 런타임, 셸 언어 전달, 앱 이름·권한 문구 영어판 작업이면 이 스킬을 읽을 것. 개별 화면 문구 추출은 string-migration 스킬이다."
---

# i18n Foundation

결정은 설계서(`docs/superpowers/specs/2026-10-01-BY-731-i18n-design.md`)에 있다. 이 문서는 그 결정을 이 저장소에서 어떻게 구현하는지만 적는다.

## 웹 (BY-808)

### 만드는 파일

| 파일 | 역할 |
|---|---|
| `apps/web/src/lib/locale.ts` | `resolveLocale(search, languages, stored?)`와 `SUPPORTED_LOCALES`, `sessionStorage` 키 상수. `AppLocale`과 언어 협상 `negotiateLocale`은 `packages/types/src/locale.ts`에 있고 앱 셸과 같이 쓴다 |
| `apps/web/src/lib/i18n.ts` | i18next 초기화, 네임스페이스 리소스 등록, 결정한 언어를 `sessionStorage`에 기록 |
| `apps/web/src/i18next.d.ts` | `CustomTypeOptions`에 `defaultNS: "common"`, `resources`에 ko JSON |
| `apps/web/src/lib/intl.ts` | 날짜 라벨·월 라벨·시각 범위 포맷 함수(기본 시간대는 기기 시간대) |
| `apps/web/src/locales/{ko,en}/common.json` | 공용 버튼·오류·단위 |
| `apps/web/src/locales/__tests__/catalog.test.ts` | ko·en 키 집합·빈 값·보간 변수 가드. `import.meta.glob`으로 네임스페이스를 자동으로 찾아 묶음이 늘어도 고치지 않게 한다 |

### 순서

1. `vite build`로 기반 전 번들 크기를 측정해 보고서에 적는다(gzip, 진입 청크와 전체).
2. `pnpm --filter web add i18next react-i18next`. 설치된 메이저 버전의 동기 초기화 옵션 이름(`initAsync` 또는 `initImmediate`)을 패키지 타입에서 확인한다.
3. 계획서 테스트 목록 순서로 TDD.
4. `main.tsx`에서 `initNativeTheme()` 근처에 `import "./lib/i18n"`을 둔다. 첫 렌더 전에 초기화가 끝나야 한다.
5. `src/test/setup.ts`에서 `lib/i18n.ts`를 import하고 `changeLanguage("ko")`를 보장한다. 이 줄 하나로 기존 테스트 전부가 ko로 돈다.
6. `index.html` 인라인 스크립트에 lang 결정을 넣는다. `?theme` 스크립트 옆에 두고, 규칙은 `resolveLocale`과 같다. `indexHtml.test.ts`가 두 구현을 같은 입력표로 검사한다.
7. 린트 골격: `eslint.config.mjs`에 `I18N_ENFORCED` 배열과 블록 하나. 처음에는 `src/lib/i18n.ts`, `src/lib/locale.ts`, `src/lib/intl.ts`만 넣는다. 임시 파일에 한글 리터럴을 넣어 걸리는지 확인하고 임시 파일을 삭제한다.
8. 기반 후 번들 크기를 다시 측정한다.

### intl.ts 규칙

- 포맷터는 `(locale, ...)`를 인자로 받는다. 함수 안에서 i18next 전역을 읽지 않는다. 테스트가 쉽고 호출부가 `i18n.language`를 넘기면 된다.
- `Intl.DateTimeFormat` 인스턴스는 `locale`·옵션 조합별로 모듈 안 `Map`에 캐시한다. 기록 탭 목록이 길어 매번 만들면 비싸다.
- ko 출력은 지금 헬퍼의 출력과 글자 단위로 같아야 한다. `Intl`의 ko 출력이 기존과 다르면(예: `오전`/`오후`, 공백 위치) 그 표기는 `Intl`이 아니라 카탈로그 키로 만든다.
- 시간 길이(3시간 42분)는 `Intl.DurationFormat`이 iOS 16 WebView에 없으므로 쓰지 않는다. `common` 카탈로그 키로 만든다.

### common 네임스페이스에 처음 넣을 것

지금 코드에서 세 군데 이상 반복되는 문구만 넣는다(확인, 취소, 닫기, 다시 시도, 뒤로, 공용 오류, 시간·분·초 단위). 나머지는 각 묶음이 자기 네임스페이스에 둔다. 처음부터 많이 넣으면 묶음 담당이 어디에 둘지 헷갈린다.

### 문구 추출 담당에게 넘길 사용법

보고서 "사용법" 절에 아래를 실제 코드 기준으로 적는다.

- 새 네임스페이스 추가: ko·en JSON 두 개를 만들면 `i18n.ts`가 `import.meta.glob`으로 자동 등록하는지, 아니면 한 줄을 더해야 하는지.
- 컴포넌트에서: `const { t } = useTranslation("records")`, 컴포넌트 밖에서: `i18n.t("records:key")`.
- 날짜·시각: `intl.ts` 함수 이름과 인자.
- 린트 범위: `I18N_ENFORCED`에 `"src/features/records/**/*.{ts,tsx}"`처럼 더하는 법.

## 모바일 셸 (BY-811)

### 순서

1. `pnpm --filter mobile exec expo install expo-localization`. SDK 57에 맞는 버전이 들어온다.
2. `apps/mobile/lib/i18n.ts`: `getAppLocale()`이 부를 때마다 `getLocales()`의 `languageTag` 목록 전체를 `negotiateLocale`에 넘겨 ko·en·ja·zh-Hant 가운데 처음 맞는 언어를 고르고(없으면 en), `t(key, vars?)`를 내보낸다. 모듈 로드 때 한 번 정하면 Android 앱별 언어 변경 뒤에 이전 언어가 남는다. `expo-localization` 플러그인의 `allowDynamicLocaleChangesAndroid`는 `false`로 둔다. 문구 객체는 `as const`로 두고 en 객체 타입을 ko 키에 맞춘다(`satisfies Record<keyof typeof ko, string>`).
3. `RemoteWebViewHost.tsx`의 `buildRemoteWebViewUrl`에서 `lang`을 붙인다. `cachedParams`에 넣지 않는다.
4. 셸 노출 문구를 `t()`로 바꾼다. 대상은 설계서 모바일 셸 절의 목록이고, 착수 때 grep으로 다시 확인한다. 로그·`throw`·`app.config.ts` 빌드 오류는 제외한다.
5. `remoteConfigCopy.ts`: 한국어가 아니면 `<key>_<언어>`(`_en`·`_ja`·`_zh_hant`) 먼저, 비면 그 언어 기본 문구, 그다음 영어 기본 문구. 운영자가 Firebase 콘솔에서 강제·권장 업데이트 문구를 바꿀 때는 `_ja`·`_zh_hant` 키도 함께 채운다. 그 언어 기기는 `_en` 키가 아니라 자기 언어 키를 읽고, 비면 앱 기본 문구로 넘어가기 때문이다.
6. Android 네이티브 모듈: Kotlin의 사용자 노출 한글 문자열을 `modules/<모듈>/android/src/main/res/values/strings.xml`(영어)과 `values-ko/strings.xml`(한국어)로 바꾸고 `context.getString(R.string.x)`로 읽는다. 기본(`values/`)을 ko로 두면 ko가 아닌 기기에서 영어 대신 한국어가 보인다. 리소스 이름은 모듈 접두사를 붙여 앱 리소스와 겹치지 않게 한다(`app_lock_notification_title`).
7. 스토어 메타: `app.json`의 `CFBundleLocalizations`, `expo.locales`, `apps/mobile/locales/{ko,en}.json`, `expo-localization` 플러그인 `supportedLocales`, 앱 이름은 `app.config.ts`가 만드는 `locales`(변형 접미 포함). `plugins/withAppDisplayName.js`는 기본 `app_name`의 `translatable="false"`만 지운다.
8. `apps/mobile/CLAUDE.md`의 "영어 문구를 넣기 전에는 `en`을 추가하지 말 것" 문장을 지금 상태에 맞게 고친다. `lib/__tests__/appStoreLocalization.test.ts`를 갱신한다.
9. 모바일 린트에 같은 한글 규칙을 넣는다.

네이티브 모듈이 늘어 Dev Client를 다시 빌드해야 한다. 빌드는 사용자가 한다(BY-812). 보고서에 "Dev Client 재빌드 필요"를 적는다.

## 하지 말 것

- 실행 중 언어 변경 브리지 메시지를 만들지 않는다.
- `packages/types`에 i18n 타입을 두지 않는다. 웹 안에서만 쓴다.
- 언어 감지 플러그인(`i18next-browser-languagedetector`)을 넣지 않는다. `resolveLocale` 하나로 충분하고 새 의존성이다.
