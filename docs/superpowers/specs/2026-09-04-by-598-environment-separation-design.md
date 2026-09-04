# 운영·개발·QA 환경 분리 (BY-598)

- 대상: `apps/mobile`, `apps/web`
- 관련 티켓: BY-598 (하위 BY-599 ADR, BY-600 아이덴티티·프로필, BY-601 딥링크·웹 정합)
- 작성일: 2026-09-04
- 승인: 2026-09-04 브레인스토밍에서 확정

## 배경

앱 아이덴티티가 `com.breathlessyouth.mobile` 하나뿐이라 모든 EAS 프로필이 같은 bundle identifier와 package를 공유한다. 비운영 빌드를 운영 앱과 한 기기에 같이 설치할 수 없고, QA 빌드를 설치하는 순간 운영 설치의 딥링크 검증과 충돌한다. 딥링크 선언도 `app.json`에 운영 도메인이 고정돼 있어 `web-dev.focusmakers.app` 초대 링크는 앱이 받지 못한다.

API·웹 주소는 BY-402, BY-464의 `APP_VARIANT` 분기로 갈라져 있지만 갈라지는 대상이 주소뿐이다. 나머지 항목의 현재 상태는 아래와 같다.

| 항목 | 현재 |
|---|---|
| API·웹 주소 | 분리됨. `production`이면 운영 상수, 아니면 `.env.local` + `guardDevBaseUrl` |
| App Link 호스트 | `app.json`에 운영 도메인 고정 (`web.sunqstudio.kr`, `web.focusmakers.app`, `pathPrefix` `/social/join`) |
| 앱 아이덴티티 | 단일 `com.breathlessyouth.mobile` |
| `APP_VARIANT` | 사실상 이진 (`production` / 아님) |
| `eas.json` | `development`, `development-simulator`, `preview`(내부 배포인데 운영 주소), `production`, `qa`(BY-485, env로 dev 주소) |
| 분석 SDK | 앱에 없음. Amplitude·GA4는 웹에만 있고 키는 Vercel env |
| Sentry(앱) | DSN 하나, `environment: "production"` 상수 |
| expo-updates | 미도입 |
| 웹 배포 환경 | `__DEPLOY_ENV__` = Vercel `production` / `preview` / `development` |
| 웹 핸드오프 | `appHandoff.ts`, `storeLink.ts`가 스킴 `focusmakers`·패키지 `com.breathlessyouth.mobile` 하드코딩 |
| well-known | AASA appID 1개, assetlinks 패키지 1개(지문 3개). web-dev에서 둘 다 200 |

## 환경 모델

| `APP_VARIANT` | 백엔드 | 웹 | 앱 아이덴티티 | 표시명 | 커스텀 스킴 | App Link 호스트 |
|---|---|---|---|---|---|---|
| `production` | `api.focusmakers.app` | `web.focusmakers.app` (main) | `com.breathlessyouth.mobile` | 포커스 메이커스 | `focusmakers`, `focuson` | `web.focusmakers.app`, `web.sunqstudio.kr` |
| `staging` | `api-dev.focusmakers.app` | `web-dev.focusmakers.app` (dev) | `com.breathlessyouth.mobile.staging` | 포커스 메이커스 STG | `focusmakers-staging` | `web-dev.focusmakers.app` |
| `development` | `.env.local` | `.env.local` | `com.breathlessyouth.mobile.dev` | 포커스 메이커스 DEV | `focusmakers-dev` | `web-dev.focusmakers.app` |

- QA는 `staging` 티어다. 백엔드는 dev를 재사용하고 앱 아이덴티티만 분리한다.
- 운영 후보(prod-parity) 검증은 `production` 프로필 빌드를 TestFlight·Play 내부 테스트 트랙으로 배포하는 것이다. QA 티어가 아니라 production 티어의 배포 경로다.
- production의 `focuson` 스킴과 `web.sunqstudio.kr` 호스트는 이전 빌드와 이미 공유된 링크를 위해 유지한다.
- development는 웹이 로컬 주소라 App Link 호스트를 파생할 수 없어 `web-dev.focusmakers.app`으로 고정한다.
- 웹 정합: 앱 `production` ↔ 웹 `production`, 앱 `staging` ↔ 웹 `preview`(web-dev와 브랜치 프리뷰), 앱 `development` ↔ 웹 `development`(로컬 Vite).

## EAS 프로필 매핑

| 프로필 | `APP_VARIANT` | distribution | 용도 |
|---|---|---|---|
| `development` | development | internal, developmentClient | 로컬 Metro |
| `development-simulator` | development | internal, developmentClient, simulator | 시뮬레이터 |
| `staging` (기존 `qa` 개명) | staging | internal | 일상 QA, 딥링크 실기기 검증 |
| `production` | production | store, autoIncrement | 스토어, TestFlight·내부 테스트 트랙 |

- `preview`는 삭제한다. "내부 배포인데 운영 엔드포인트"라는 역할은 TestFlight가 대체하고, 남겨 두면 이름과 동작의 어긋남이 계속 재생산된다.
- 프로필 env에서 주소를 걷어내고 `APP_VARIANT` 한 줄만 남긴다. 주소의 원천은 `app.config.ts` 하나다.

## 한 스위치로 파생 (`app.config.ts`)

`APP_VARIANT`를 `production | staging | development`로 확장한다. 미설정은 development다. 이름은 유지한다(기존 테스트·eas.json과의 churn 최소화).

환경 테이블 하나에서 아래를 전부 파생한다.

| 산출 | production | staging | development |
|---|---|---|---|
| `extra.apiBaseUrl` / `webBaseUrl` | 상수 | 상수 | `.env.local` + `guardDevBaseUrl` |
| `ios.bundleIdentifier` / `android.package` | base | base + `.staging` | base + `.dev` |
| `extra.appDisplayName` | 이름 | 이름 + ` STG` | 이름 + ` DEV` |
| `scheme` | `focusmakers`, `focuson` | `focusmakers-staging` | `focusmakers-dev` |
| `ios.associatedDomains` / `android.intentFilters` | `webBaseUrl` 호스트 + 레거시 | `webBaseUrl` 호스트 | `web-dev.focusmakers.app` 고정 |
| `extra.appEnv` | `production` | `staging` | `development` |

- `withAppDisplayName` 플러그인은 그대로 `extra.appDisplayName`을 읽는다. 변경 없음.
- `app.json`의 정적 `scheme`·`associatedDomains`·`intentFilters`는 제거하고 `app.config.ts`에서 생성한다. `pathPrefix` `/social/join`, `autoVerify: true`는 유지.
- `lib/sentry.ts`의 `environment`는 `extra.appEnv`를 읽는다. Sentry 프로젝트·DSN은 하나 유지. `enabled: !__DEV__`도 유지.
- staging 주소는 상수라 가드 대상이 아니다. development만 `guardDevBaseUrl`을 탄다.

## 웹 변경

- `public/.well-known/apple-app-site-association`에 `9BCSD3ZRDQ.com.breathlessyouth.mobile.staging`, `9BCSD3ZRDQ.com.breathlessyouth.mobile.dev` appID 추가.
- `public/.well-known/assetlinks.json`에 두 패키지 항목 추가. 지문은 EAS가 새 keystore를 만든 뒤 `eas credentials`로 확인해 기입한다.
- 정적 파일 하나에 세 아이덴티티를 전부 적는다. 운영 도메인에 비운영 항목이 있어도 무해하다. 어느 호스트를 claim할지는 앱의 선언이 결정하고 well-known은 허가만 한다.
- `features/social-room/appHandoff.ts`·`storeLink.ts`의 스킴·패키지를 `__DEPLOY_ENV__`에서 파생한다. 스토어 폴백 링크는 운영 하나 유지(staging은 스토어에 없다).
- Amplitude·GA4는 코드 변경 없음. Vercel Preview env의 `VITE_AMPLITUDE_API_KEY`가 운영 프로젝트 키가 아닌지 확인하는 운영 체크리스트만 남긴다. 저장소에서는 검증할 수 없다.

## 완료 기준

1. staging 빌드가 운영 앱과 한 기기에 나란히 설치된다. 홈 화면 이름 `포커스 메이커스 STG`.
2. `web-dev.focusmakers.app/social/join?code=…`가 staging 앱으로 열린다. Android는 `adb shell pm get-app-links com.breathlessyouth.mobile.staging`이 verified, iOS는 메모 앱 링크 탭.
3. 운영 앱의 App Link 검증, Sentry `environment=production`, Amplitude 운영 프로젝트에 staging 트래픽이 섞이지 않는다.

## 티켓 분할

| 티켓 | 범위 | 선행 |
|---|---|---|
| BY-599 | ADR 0007 (문서만) | 없음 |
| BY-600 | `app.config.ts` 환경 테이블, 아이덴티티·표시명 접미사, Sentry environment, `eas.json`(`qa`→`staging`, `preview` 삭제), 테스트, 첫 staging 빌드로 EAS 자격증명 생성 | BY-599 |
| BY-601 | `scheme`·`associatedDomains`·`intentFilters` 파생, well-known에 새 아이덴티티·지문, 웹 핸드오프 환경 파생, 실기기 검증 | BY-600 (keystore 지문) |

analytics·Sentry는 앱 쪽이 한 줄이라 BY-600에 접고, 웹 쪽은 코드가 아니라 Vercel 확인이라 별도 티켓을 두지 않는다.

## 확정한 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| QA 정의 | staging 티어 = dev 백엔드 재사용 + 별도 아이덴티티 | BE 1인, 별도 백엔드 티어 없음. 운영 후보 검증은 production 프로필의 TestFlight 경로가 이미 담당 |
| 아이덴티티 수 | 3개 (env마다) | Dev Client와 QA 빌드가 한 기기에서 서로 덮어쓰지 않고, 접미사가 env에서 그대로 파생돼 예외 분기가 없다. 비용은 Apple App ID·keystore 한 벌 추가 |
| `preview` 프로필 | 삭제 | TestFlight가 대체. 유지하면 모순 재생산 |
| 명칭 | `staging` (env 값 = 프로필명) | 한 스위치 원칙. `qa`는 티어가 아니라 활동명 |
| 아이콘 변형 | 이번에 안 함 | 표시명 접미사로 구분. 테스터가 혼동하면 추가 |
| `APP_VARIANT` 이름 | 유지 | `APP_ENV`로 바꾸면 테스트·eas.json·문서 churn만 생기고 이득 없음 |
| Sentry 프로젝트 | 하나 유지 | environment 필터로 충분 |

## 하지 않는 것

- 환경별 아이콘 변형.
- staging 전용 백엔드.
- Sentry DSN·프로젝트 분리.
- 앱 분석 SDK 도입.
- 스토어 폴백 링크 환경 분기.
- Firebase(BY-585) 설정 파일 분기. 들어오면 `google-services.json`·`GoogleService-Info.plist`가 패키지명별로 갈리므로 같은 스위치의 다음 소비자다.
- expo-updates 도입. 도입 시 채널을 프로필명과 맞춘다.
