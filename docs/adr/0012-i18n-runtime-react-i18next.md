# 0012. 웹 국제화 런타임은 react-i18next, 모바일 셸은 자체 `t()`로 한다

- Status: Accepted
- Date: 2026-10-01 (2026-11-03 갱신)
- Relates to: [국제화 설계](../superpowers/specs/2026-10-01-BY-731-i18n-design.md), 위키 명세 `.ai/product/specs/BY-731-국제화.md`(언어·시간대 정책의 원본), `apps/web/src/lib/i18n.ts`, `apps/web/src/locales/`, `apps/mobile/lib/i18n.ts`

## 배경

앱 문구는 전부 한국어로 코드에 직접 적혀 있었다. 2026-11-03 기준 웹은 법무 문서와 개발 화면을 빼고도 약 170개 파일에 1,000줄 안팎이 흩어져 있었고, 날짜·시간 표기는 한국어 단위를 손으로 조립했다. 영어를 붙이면서 언어 추가가 번역 파일 한 세트로 끝나게 바닥을 만들어야 했다. 저장소에는 i18n 라이브러리가 없었고 `Intl`도 거의 쓰지 않았다. 모바일 셸은 원격 웹뷰라 사용자 노출 문구가 80줄 안팎이다.

어느 언어를 어떤 순서로 지원할지, 시간대를 어떻게 다룰지는 위키 명세가 정한다. 이 문서는 그 정책을 FE 안에서 어떤 도구로 구현하는지만 적는다.

## 결정

웹은 react-i18next를 쓴다. 카탈로그는 `apps/web/src/locales/{ko,en}/<namespace>.json`에 기능별 네임스페이스로 두고, `declare module "i18next"`로 키에 타입을 붙여 오타가 typecheck에서 잡히게 한다.

- 날짜·시각은 `Intl.DateTimeFormat`으로 만들고, 시간 길이·횟수처럼 단위가 붙는 표기는 카탈로그 복수형 키(`_one`/`_other`)로 만든다.
- 로케일은 `lib/locale.ts`의 순수 함수 하나가 정한다. 입력은 URL `?lang`, 이 탭에 저장한 언어, `navigator.language` 순서이고, 규칙은 `ko`로 시작하면 `ko`, 그 밖은 `en`이다. 저장값을 `navigator.language`보다 먼저 보는 이유는 Android 앱별 언어가 시스템 언어와 다를 때 웹뷰의 `navigator.language`가 시스템 언어를 돌려줄 수 있어서다. `index.html` 인라인 스크립트가 같은 규칙으로 `<html lang>`을 첫 페인트 전에 붙인다.
- 모바일 셸은 라이브러리 없이 `lib/i18n.ts`의 ko·en 객체와 `t()` 하나로 끝낸다. 기기 언어는 `expo-localization`으로 읽고 웹뷰 URL에 `?lang=`으로 넘긴다.
- 실행 중 언어 변경 브리지 메시지는 두지 않는다. iOS는 앱별 언어를 바꾸면 앱을 재시작하고 Android는 액티비티를 다시 만들어 웹뷰가 새 URL로 뜬다.
- 한국어 하드코딩은 eslint `no-restricted-syntax`의 한글 정규식 셀렉터로 막는다. 새 의존성은 넣지 않는다. 적용 범위는 추출이 끝난 폴더부터 넓힌다.
- Android 네이티브 모듈의 알림 문구는 모듈 `res/values/strings.xml`(영어 기본)과 `res/values-ko/strings.xml`에 둔다.

## 검토한 대안

- **Paraglide-JS**: 컴파일형이라 번들이 가장 작고 타입이 기본 제공되지만, Vite 플러그인과 vitest 연동을 따로 검증해야 하고 팀에 익숙하지 않다. 번들 차이(수 kB)는 mediapipe wasm 앞에서 의미가 없다.
- **자체 구현(typed `t()` + `Intl.PluralRules`)**: 의존성이 없지만 복수형·보간·네임스페이스·번역 도구 호환을 다시 만들어야 한다. 문구가 적은 셸에만 쓴다.
- **RN 내장 `SettingsManager`·`I18nManager`로 기기 언어 읽기**: 네이티브 모듈을 더하지 않아도 되지만 New Architecture에서 접근이 불안정하다.
- **실행 중 언어 변경 메시지**: OS가 앱을 다시 띄우므로 필요가 없다.

## 결과

- 새 언어는 `locales/<lang>/` JSON 한 세트와 `supportedLngs` 한 줄로 늘어난다.
- `expo-localization`이 네이티브 모듈로 들어가 Dev Client를 다시 빌드해야 한다.
- 되돌리려면 카탈로그 JSON은 그대로 두고 `t()` 호출부와 초기화만 바꾸면 된다. 카탈로그 형식(i18next JSON v4)은 다른 런타임도 읽을 수 있다.
