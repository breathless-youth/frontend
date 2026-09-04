# 0007. 운영·staging·development 3티어 환경 모델과 EAS 프로필 매핑

- Status: Accepted
- Date: 2026-09-04
- Relates to: [설계 스펙](../superpowers/specs/2026-09-04-by-598-environment-separation-design.md), [BY-485 QA 프로필 스펙](../superpowers/specs/2026-08-30-by-485-qa-eas-profile-design.md), [BY-464 도메인 전환 스펙](../superpowers/specs/2026-08-29-by-464-mobile-focusmakers-domain-design.md), [ADR 0001](./0001-webview-based-study-room-architecture.md)

## 배경

앱 아이덴티티는 `com.breathlessyouth.mobile` 하나뿐이고 모든 EAS 프로필이 같은 bundle identifier와 package를 공유한다. 비운영 빌드를 운영 앱과 한 기기에 나란히 설치할 수 없고, QA 빌드를 설치하는 순간 운영 설치가 밀려나고 그 기기의 App Link 검증 결과도 함께 사라진다.

딥링크 선언은 `app.json`에 정적으로 박혀 있고 호스트가 운영 도메인인 `web.sunqstudio.kr`과 `web.focusmakers.app`으로 고정돼 있다. `web-dev.focusmakers.app`이 보낸 초대 링크는 어떤 빌드도 받지 못한다.

BY-402와 BY-464가 넣은 `APP_VARIANT` 분기는 사실상 이진이다. `app.config.ts`는 `APP_VARIANT === "production"`인지만 보고 API·웹 주소를 운영 상수와 `.env.local` 값 중에서 고른다. 갈라지는 대상은 주소뿐이라서 아이덴티티, 표시명, 스킴, 딥링크 호스트는 여전히 한 벌이다.

`eas.json`의 `preview` 프로필은 `distribution: "internal"`이면서 `APP_VARIANT: "production"`을 준다. 내부 배포용이라는 이름과 운영 엔드포인트를 본다는 동작이 어긋나 있고, BY-485가 dev 주소를 env로 넣은 `qa` 프로필을 따로 만든 것도 이 어긋남 때문이다.

`lib/sentry.ts`의 `environment`는 문자열 `"production"` 상수다. `enabled: !__DEV__` 때문에 실제로 보고하는 빌드는 릴리즈뿐이라 상수로 둔 것인데, 릴리즈 빌드가 둘 이상이 되면 운영 이벤트와 QA 이벤트가 한 environment에 섞인다.

분석 SDK는 앱에 없다. Amplitude와 GA4는 웹에만 있고 키는 Vercel env가 준다. 그래서 앱의 지표 환경은 앱이 정하지 않고 웹뷰가 어느 웹을 여느냐로 정해진다.

딥링크 릴리즈 BY-582, BY-583, BY-584를 진행하는 동안 실기기 검증이 운영 설치와 충돌했다. 검증용 빌드가 같은 아이덴티티를 쓰는 운영 앱을 밀어내서 한 기기에서 운영 동작과 검증 동작을 나란히 볼 수 없었다. 앱 서명 키 교체 때는 assetlinks에 이전 키 지문까지 남겨야 해서 확인할 것이 더 늘었다.

## 결정

`APP_VARIANT`를 `production`, `staging`, `development` 세 값으로 확장하고, 이 값 하나에서 환경에 관한 나머지를 전부 파생한다.

### 환경 매트릭스

| `APP_VARIANT` | 백엔드                    | 웹                              | 앱 아이덴티티                        | 표시명              | 커스텀 스킴              | App Link 호스트                            |
| ------------- | ------------------------- | ------------------------------- | ------------------------------------ | ------------------- | ------------------------ | ------------------------------------------ |
| `production`  | `api.focusmakers.app`     | `web.focusmakers.app` (main)    | `com.breathlessyouth.mobile`         | 포커스 메이커스     | `focusmakers`, `focuson` | `web.focusmakers.app`, `web.sunqstudio.kr` |
| `staging`     | `api-dev.focusmakers.app` | `web-dev.focusmakers.app` (dev) | `com.breathlessyouth.mobile.staging` | 포커스 메이커스 STG | `focusmakers-staging`    | `web-dev.focusmakers.app`                  |
| `development` | `.env.local`              | `.env.local`                    | `com.breathlessyouth.mobile.dev`     | 포커스 메이커스 DEV | `focusmakers-dev`        | 없음 (스킴만)                              |

- production의 `focuson` 스킴과 `web.sunqstudio.kr` 호스트는 이전 빌드와 이미 공유된 링크를 위해 유지한다.
- development는 App Link를 선언하지 않고 커스텀 스킴만 등록한다. staging과 같은 host와 path를 claim하면 두 앱이 함께 설치된 기기에서 어느 앱이 열릴지 OS가 보장하지 않고, Dev Client는 로컬 웹을 열기 때문에 App Link 검증은 staging의 일이다.
- staging 주소는 상수라 가드 대상이 아니고, `guardDevBaseUrl`은 development에만 적용한다.

### EAS 프로필 매핑

| 프로필                     | `APP_VARIANT` | distribution | 그 밖의 옵션                                     | 용도                                |
| -------------------------- | ------------- | ------------ | ------------------------------------------------ | ----------------------------------- |
| `development`              | development   | internal     | `developmentClient: true`                        | 로컬 Metro                          |
| `development-simulator`    | development   | internal     | `developmentClient: true`, `ios.simulator: true` | 시뮬레이터                          |
| `staging` (기존 `qa` 개명) | staging       | internal     | 없음                                             | 일상 QA, 딥링크 실기기 검증         |
| `production`               | production    | store        | `autoIncrement: true`                            | 스토어, TestFlight·내부 테스트 트랙 |

- `preview`는 삭제한다. 내부 배포인데 운영 엔드포인트를 본다는 역할은 TestFlight가 대체하고, 남겨 두면 이름과 동작의 어긋남이 계속 재생산된다.
- 프로필 env에서 주소를 걷어내고 `APP_VARIANT` 한 줄만 남긴다. 주소의 원천은 `app.config.ts` 하나다.

### QA의 정의

QA는 별도 티어가 아니라 `staging` 티어다. 백엔드는 dev를 재사용하고 앱 아이덴티티만 분리한다. BE가 1인이라 QA 전용 백엔드 티어를 세울 여력이 없고, QA가 실제로 필요로 하는 것은 전용 데이터가 아니라 운영 설치를 밀어내지 않는 별도 설치다.

운영 후보 검증은 `production` 프로필로 빌드해 TestFlight와 Play 내부 테스트 트랙에 올리는 것이다. 이 경로는 QA 티어가 아니라 production 티어의 배포 경로이고, 이미 그 역할을 하고 있다.

### 한 스위치 파생

`APP_VARIANT` 미설정만 development로 본다. 세 값 밖의 문자열은 설정 평가 시점에 `throw`해서 빌드를 실패시킨다. 오타가 development로 떨어지면 빈 주소 빌드가 아무 표시 없이 나가기 때문이다. 이름은 `APP_VARIANT` 그대로 유지한다. `APP_ENV`로 바꾸면 기존 테스트와 `eas.json`, 문서를 전부 손봐야 하는데 얻는 것이 없다.

`app.config.ts`의 환경 테이블 하나에서 아래를 전부 파생한다.

| 산출                                              | production                   | staging               | development                      |
| ------------------------------------------------- | ---------------------------- | --------------------- | -------------------------------- |
| `extra.apiBaseUrl` / `webBaseUrl`                 | 상수                         | 상수                  | `.env.local` + `guardDevBaseUrl` |
| `ios.bundleIdentifier` / `android.package`        | base                         | base + `.staging`     | base + `.dev`                    |
| `extra.appDisplayName`                            | 이름                         | 이름 + 공백 + `STG`   | 이름 + 공백 + `DEV`              |
| `scheme`                                          | `focusmakers`, `focuson`     | `focusmakers-staging` | `focusmakers-dev`                |
| `ios.associatedDomains` / `android.intentFilters` | `webBaseUrl` 호스트 + 레거시 | `webBaseUrl` 호스트   | 선언하지 않음                    |
| `extra.appEnv`                                    | `production`                 | `staging`             | `development`                    |

- `withAppDisplayName` 플러그인은 그대로 `extra.appDisplayName`을 읽고 변경하지 않는다.
- `lib/sentry.ts`의 `environment`는 `extra.appEnv`를 읽는다. Sentry 프로젝트와 DSN은 하나를 유지하고 `enabled: !__DEV__`도 유지한다.

### 웹 배포 환경과의 대응

앱의 세 값은 웹의 `__DEPLOY_ENV__` 세 값과 일대일로 맞춘다.

- 앱 `production`은 웹 `production`에 대응한다.
- 앱 `staging`은 웹 `preview`에 대응하고, 여기에는 `web-dev.focusmakers.app`과 브랜치 프리뷰가 들어간다.
- 이 대응은 Sentry environment와 지표 귀속, 웹 핸드오프의 스킴·패키지 선택에 쓰는 것이고, 딥링크 host는 위 환경 매트릭스가 정한다. 브랜치 프리뷰 주소는 App Link 대상이 아니다.
- 앱 `development`는 웹 `development`에 대응하고, 로컬 Vite가 그 자리다.

## 결과

- EAS 자격증명을 세 벌 관리한다. Apple App ID와 Android keystore가 아이덴티티마다 한 벌씩 늘어난다. Android keystore는 분실하면 그 패키지로 다시는 업데이트를 낼 수 없으므로, 새 keystore를 만든 뒤 `eas credentials`로 내려받아 팀 보관소에 백업했는지 확인하는 것이 BY-600의 완료 조건에 들어간다.
- `public/.well-known/apple-app-site-association`에 `9BCSD3ZRDQ.com.breathlessyouth.mobile.staging` appID를 추가하고, `public/.well-known/assetlinks.json`에 staging 패키지 항목을 추가한다. 지문은 EAS가 새 keystore를 만든 뒤 `eas credentials`로 확인해 기입한다. development는 App Link를 선언하지 않으므로 well-known에 넣지 않는다.
- 정적 파일 하나에 운영과 staging 아이덴티티를 함께 적는다. 어느 호스트를 claim할지는 앱의 선언이 결정하고 well-known은 허가만 하므로, 운영 도메인의 파일에 비운영 항목이 있어도 그 아이덴티티를 설치하지 않은 기기에는 아무 영향이 없다. 환경별로 파일을 나누면 도메인마다 다른 정적 자산을 관리해야 해서 더 비싸다.
- `app.json`의 정적 `scheme`, `associatedDomains`, `intentFilters` 선언을 제거하고 `app.config.ts`에서 생성한다. `pathPrefix` `/social/join`과 `autoVerify: true`는 유지한다.
- 웹 핸드오프의 `appHandoff.ts`와 `storeLink.ts`는 하드코딩된 스킴 `focusmakers`와 패키지 `com.breathlessyouth.mobile`을 `__DEPLOY_ENV__`에서 파생한다. 스토어 폴백 링크는 운영 하나만 유지한다. staging 빌드는 스토어에 없기 때문이다.
- Amplitude와 GA4는 코드를 바꾸지 않는다. Vercel Preview env의 `VITE_AMPLITUDE_API_KEY`와 `VITE_GA4_MEASUREMENT_ID`가 운영 프로젝트 값이 아닌지 확인하는 운영 체크리스트만 남는다. 두 값은 저장소에서 검증할 수 없다.
- Firebase 설정 파일(BY-585에서 팀원이 도입)은 `package_name`·`BUNDLE_ID`로 앱을 식별하므로 아이덴티티마다 파일이 따로 있어야 한다. EAS environment는 `development`→`.dev` 파일, `preview`→`.staging` 파일, `production`→prod 파일로 배치하고, `app.config.ts`가 파일의 아이덴티티가 빌드와 다르면 `throw`한다. (2026-09-04 BY-600에서 반영)
- 구현은 BY-600과 BY-601로 나눈다. BY-600은 `app.config.ts` 환경 테이블, 아이덴티티와 표시명 접미사, Sentry environment, `eas.json` 정리, 테스트, `apps/mobile/CLAUDE.md`의 프로필 서술 갱신, 첫 staging 빌드로 EAS 자격증명 생성과 백업 확인까지다. 저장소 밖의 `preview`·`qa` 사용처는 EAS 대시보드에서 확인한다.
- BY-601은 딥링크 선언 파생, well-known 갱신, 웹 핸드오프 환경 파생, 실기기 검증이다. BY-600이 만드는 새 keystore의 지문이 있어야 assetlinks를 채울 수 있어 BY-600이 선행이다.

### 후속 소비자

- Firebase 설정 파일은 결과 절에 적은 대로 BY-600에서 이 스위치에 붙였다.
- expo-updates를 도입하면 채널명을 EAS 프로필명과 같게 맞춘다.

## 대안

**별도 QA 백엔드 티어.** QA 전용 백엔드를 세우면 dev 개발 트래픽과 QA 검증 데이터가 섞이지 않는다. 그러나 BE가 1인이라 티어를 하나 더 운영할 여력이 없고, 지금 문제는 데이터가 섞이는 것이 아니라 앱을 나란히 설치할 수 없는 것이다. 기각.

**아이덴티티 2개, development가 staging을 공유.** 운영과 비운영 둘로만 나누면 Apple App ID와 keystore 추가가 한 벌로 끝난다. 그러나 Dev Client 빌드와 QA 빌드가 같은 아이덴티티를 써서 한 기기에서 서로 덮어쓴다. 개발자가 QA 빌드를 확인하려면 Dev Client를 지워야 하는데, 이는 지금 운영과 QA 사이에서 겪는 문제를 한 칸 아래로 미룬 것에 지나지 않는다. 접미사가 env에서 그대로 파생돼 예외 분기가 없다는 점도 3개 쪽이 낫다. 기각.

**`preview`를 `production-internal`로 개명해 유지.** 이름과 동작의 어긋남만 고치는 최소 변경이다. 그러나 그 프로필이 하는 일은 운영 엔드포인트를 보는 내부 배포이고, TestFlight와 Play 내부 테스트 트랙이 이미 같은 일을 한다. 이름을 고쳐 남기면 같은 역할의 경로가 둘이 되고 어느 쪽으로 배포했는지 매번 확인해야 한다. 기각.

**`qa` 명칭 유지.** BY-485가 만든 이름이라 그대로 두면 기존 문서와 팀 대화가 바뀌지 않는다. 그러나 QA는 티어 이름이 아니라 활동 이름이고, env 값에 `qa`를 넣으면 백엔드도 웹도 그런 이름의 환경이 없어 대응 관계가 끊긴다. env 값과 프로필명을 같게 두는 한 스위치 원칙에도 어긋난다. 기각.

**`APP_ENV`로 개명.** `variant`보다 `env`가 세 티어를 가리키기에 정확한 이름이다. 그러나 기존 테스트와 `eas.json`, 문서를 전부 고쳐야 하고 동작은 하나도 달라지지 않는다. 기각.

**Sentry 프로젝트 분리.** 운영과 staging의 이벤트를 프로젝트 단위로 나누면 대시보드에서 확실히 갈린다. 그러나 `extra.appEnv`가 `environment`로 들어가면 environment 필터로 같은 구분이 되고, 프로젝트를 나누면 DSN, 소스맵 업로드, 릴리즈 관리가 두 벌이 된다. 기각.
