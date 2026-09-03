# BY-585 Firebase Remote Config·FCM SDK 연동 설계

- 대상: `apps/mobile`
- 관련 티켓: BY-585 (후속 BY-586, 대체 대상 BY-535·BY-536·BY-579)
- 작성일: 2026-09-03

## 배경

저장소에 Firebase 관련 코드와 의존성이 전혀 없다. BY-586이 Remote Config로 최소 지원 버전을 읽고 푸시 서비스 계층을 세우려면 SDK가 먼저 빌드에 들어가야 한다. 이 티켓은 "값이 읽히고 토큰이 발급되는 상태"까지만 만들고, 판정·핸들러·화면은 BY-586이 맡는다.

전제와 제약:

- Expo SDK 54 고정, Dev Client(prebuild) 방식. 네이티브 모듈이 늘어나므로 Dev Client를 다시 빌드해야 한다.
- 화면·컴포넌트는 네이티브 모듈을 직접 import하지 않고 `lib/` 어댑터를 거친다 (`apps/mobile/CLAUDE.md` 경계 규칙).
- 저장소가 public이라 `google-services.json`·`GoogleService-Info.plist`는 커밋하지 않는다. Firebase 프로젝트는 dev/prod 둘로 나눈다 (2026-09-03 결정).
- `@react-native-firebase` 26.3.3 기준: peer `expo >= 47`, New Architecture 필수(SDK 54 기본값이라 충족). RN 0.75+에서는 Firebase iOS SDK를 SPM으로 받는 것이 기본이고 dynamic frameworks를 요구한다. app plugin은 prebuild 시점에 설정 파일이 없으면 즉시 실패한다. messaging plugin은 Android 알림 아이콘·색만 다루고 iOS는 손대지 않는다. remote-config는 plugin이 없다.
- Firebase Apple SDK는 2026년 10월부터 CocoaPods에 새 버전을 올리지 않고, CocoaPods trunk는 2026-12-02에 읽기 전용이 된다. Firebase 12.12+는 Xcode 26.2 이상을 요구하는데, SDK 54의 EAS 기본 빌드 이미지는 Xcode 26.0이다.

## 변경 1: 의존성

- `@react-native-firebase/app`, `@react-native-firebase/remote-config`, `@react-native-firebase/messaging` (26.x)
- `expo-build-properties` (SDK 54 호환 버전은 `npx expo install`이 고른다)

설치는 `apps/mobile`에서 `pnpm --filter mobile exec npx expo install …`로 한다.

## 변경 2: `app.json` plugins·entitlements

```json
"plugins": [
  "…기존 항목…",
  "@react-native-firebase/app",
  "@react-native-firebase/messaging",
  ["expo-build-properties", { "ios": { "useFrameworks": "dynamic" } }]
],
"ios": { "entitlements": { "aps-environment": "development" } }
```

- iOS는 SPM 모드 + dynamic frameworks로 간다 (RNFB 26 기본값이자 공식 Expo 권장 설정). CocoaPods 모드(`disableSPM: true` + static)는 Firebase가 2026년 10월부터 CocoaPods 게시를 중단해 곧 얼어붙는 경로라 쓰지 않는다. SPM 임베드 단계는 RNFB가 CocoaPods 설치기에 자동으로 걸어 Podfile 수정이 필요 없고, `pod install`이 자동 훅 실패 경고를 내면 그때만 config plugin으로 `post_integrate` 폴백을 추가한다.
- 사전 컴파일 RN 코어는 유지된다. expo-modules-autolinking 3.0.26은 `USE_FRAMEWORKS`가 켜지면 Expo 핵심 pod 4개(ExpoModulesCore·Expo·ReactAppDependencyProvider·expo-dev-menu)만 static 라이브러리로 내리고 나머지는 dynamic으로 둔다. 빌드 오류가 나면 탈출구는 `ios.forceStaticLinking`(pod 단위) → `ios.buildReactNativeFromSource: true`(전체 소스 빌드) 순이다.
- `aps-environment`는 `development`로 둔다. 배포용 export에서 Xcode가 프로파일에 맞춰 `production`으로 바꾼다 (expo-notifications plugin의 기본값과 같은 방식). production 빌드에서 토큰이 발급되는지는 BY-586 실기기 검증에서 확인한다.
- `UIBackgroundModes: remote-notification`은 넣지 않는다. 데이터 메시지가 필요해질 때 추가한다.
- `android.permissions`는 바꾸지 않는다. Android 13+ `POST_NOTIFICATIONS`는 권한 요청을 붙이는 BY-586에서 판단한다.

## 변경 3: 설정 파일 주입 (`app.config.ts`)

- env `GOOGLE_SERVICES_JSON` → `android.googleServicesFile`, `GOOGLE_SERVICES_PLIST` → `ios.googleServicesFile`. env가 없으면 키를 넣지 않는다. prebuild가 필요한 명령에서는 RNFB plugin이 명확한 메시지로 실패하고, Metro만 띄우는 로컬 개발에는 파일이 필요 없다.
- 가드: 파일에서 프로젝트 ID를 읽어(`project_info.project_id` / `PROJECT_ID`) 빌드 변형과 대조한다. `APP_VARIANT !== "production"`인데 prod ID면 throw, `APP_VARIANT === "production"`인데 prod ID가 아니면 throw. 기존 `guardDevBaseUrl`과 같은 자리·같은 방식이다. prod ID 상수는 `focusmakers-prod`다 (공개돼도 무해한 식별자).
- 로컬 파일 위치는 `apps/mobile/firebase/dev/`·`apps/mobile/firebase/prod/`이고 `apps/mobile/.gitignore`에 `/firebase/`를 추가한다. `.env.local.example`에 두 env 항목을 추가한다.

## 변경 4: EAS 환경변수 매핑 (`eas.json`)

- 설정 파일 4개를 EAS file 타입 환경변수로 등록한다. `development` 환경에는 dev 프로젝트 파일, `preview`·`production` 환경에는 prod 프로젝트 파일.
- 빌드 프로필에 `environment`를 붙인다: `development`·`development-simulator`·`qa` → `development`, `preview` → `preview`, `production` → `production`.
- 등록 예: `eas env:create --environment development --name GOOGLE_SERVICES_JSON --type file --value ./firebase/dev/google-services.json`. 팀원은 `eas env:pull --environment development`로 받는다.
- 빌드 이미지: 전 프로필에 `"image": "macos-sequoia-15.6-xcode-26.2"`를 지정한다. Firebase 12.12+가 Xcode 26.2 이상을 요구하는데 SDK 54의 EAS 기본 이미지는 Xcode 26.0이다. development 프로필에 먼저 적용해 Dev Client로 검증한 뒤 나머지 프로필에 넣는다.
- 기존 프로필의 `env`·`distribution`·`autoIncrement`는 바꾸지 않는다. Expo SDK 54와 앱 의존성 버전도 그대로다.

## 변경 5: 어댑터 (`lib/`)

RNFB는 설정 파일로 네이티브에서 자동 초기화되므로 별도 init 모듈은 두지 않는다. 어댑터는 `cameraPermission.ts`와 같은 꼴이다: 타입 + RNFB 구현 + `set*Adapter()` + 공개 함수.

`lib/remoteConfig.ts`

- `RemoteConfigAdapter { setDefaults(defaults), activate(), fetch(), getString(key) }`
- 공개 함수: `activateRemoteConfig()`, `fetchRemoteConfigInBackground()`, `getRemoteConfigString(key)`
- fetch 최소 간격은 `__DEV__ ? 0 : 3_600_000`. 기본값 객체는 호출자가 넘긴다 (BY-586이 `min_supported_version`을 등록한다).

`lib/pushMessaging.ts`

- `PushPermissionStatus = "undetermined" | "granted" | "denied"`
- `PushMessagingAdapter { getPermissionStatus(), requestPermission(), getToken(), onTokenRefresh(listener) }`
- 공개 함수: 위 네 개를 그대로 노출한다. 메시지 핸들러(포그라운드·백그라운드·알림 탭)는 BY-586에서 이 어댑터에 추가한다.

`@react-native-firebase/*` 직접 import는 이 두 파일에만 허용한다.

## 변경 6: 개발 전용 스모크 (`lib/firebaseSmoke.ts`)

- `__DEV__`에서만 동작한다. Remote Config 키 `smoke_test`를 activate 후 읽어 로그로 남기고, FCM 토큰을 로그로 남긴다. production 빌드에서는 no-op이다.
- `app/_layout.tsx`의 effect에서 한 번 호출한다.
- BY-586에서 실사용 코드로 대체하면서 삭제한다.

## 확정한 결정

- iOS는 SPM 모드 + dynamic frameworks (`useFrameworks: "dynamic"`, `disableSPM` 미사용). CocoaPods 모드는 Firebase의 CocoaPods 게시 중단(2026-10)으로 배제한다.
- Expo SDK 54는 그대로 둔다. 바뀌는 버전은 EAS 빌드 머신의 Xcode(26.0 → 26.2)뿐이다.
- Firebase 프로젝트 dev/prod 분리, 설정 파일 미커밋, EAS file 환경변수로 주입.
- 어댑터는 Remote Config와 Messaging 둘로 나눈다. 테스트에서 서로 독립적으로 교체한다.
- `aps-environment`는 `development`, 백그라운드 모드는 미추가.
- `@react-native-firebase/analytics`는 remote-config의 peer로 설치되지만 `expo.autolinking.exclude`로 네이티브 링크를 막는다(prebuild 검증에서 발견). Analytics SDK를 넣지 않는다는 GA 결정과 같은 선상이다.
- Firebase 프로젝트 생성 시 Google Analytics와 Gemini는 dev·prod 모두 연결하지 않는다. 이번 범위(Remote Config 값 조회, FCM)에 필요 없고, GA4 속성은 Firebase 프로젝트와 1:1이라 운영 속성을 dev에 붙이면 오염 경로가 된다. Firebase A/B 테스트는 앱 스트림 이벤트로만 측정되어 웹뷰 중심인 이 앱에 맞지 않는다. 필요해지면 prod ↔ 운영 GA4, dev ↔ 별도 dev GA4로 짝을 맞춰 연결한다.

## 테스트

- `lib/__tests__/firebaseConfig.test.ts` (신규): plugin 3개와 `useFrameworks: dynamic`·`aps-environment`가 app.json에 있고 `disableSPM`이 없다. env가 있으면 `googleServicesFile`이 반영되고 없으면 키가 없다. 가드 4가지(dev+prod 파일 throw, prod+dev 파일 throw, dev+dev 통과, prod+prod 통과). fixture는 `lib/__tests__/fixtures/firebase/`에 가짜 프로젝트 ID로 둔다.
- eas.json 프로필별 `environment` 매핑과 `image` 지정도 `firebaseConfig.test.ts`에서 핀으로 고정한다.
- `permissionCopy.test.ts`: 변경 없이 통과해야 한다 (Android 권한 두 개 유지).
- `remoteConfig.test.ts`·`pushMessaging.test.ts` (신규): `jest.mock`으로 RNFB를 대체해 어댑터 위임, 권한 상태 매핑, 토큰 갱신 구독 해제를 확인한다.

## 검증 절차

1. `npx expo prebuild --clean`으로 plugin 적용을 확인한다: Info.plist·entitlements·Podfile(`use_frameworks! :linkage => :dynamic`, `$RNFirebaseDisableSPM` 없음)·`pod install` 로그의 `[RNFB] Embed Firebase SPM Frameworks` 단계와 임베드 경고 부재·merged AndroidManifest.
2. `eas env:create`로 파일 4개를 올린다.
3. `eas build --profile development`로 iOS·Android Dev Client를 만든다.
4. 실기기에서 `smoke_test` 값과 FCM 토큰 로그를 확인한다. Sentry·webview·회전 잠금 등 기존 네이티브 모듈이 정상 기동하는지 함께 본다.

## 완료 조건

- development 프로필 iOS·Android 빌드 성공(Xcode 26.2 이미지), 실기기에서 Remote Config 값 조회와 FCM 토큰 발급 확인.
- dev 빌드에 prod 파일 주입 시 설정 읽기 시점에 실패 (테스트로 고정).
- 기존 권한 열거 테스트 통과, lint·typecheck·test 통과.
- `.env.local.example`·`apps/mobile/CLAUDE.md`에 파일 주입 방식과 dev/prod 매핑 기록. CLAUDE.md의 낡은 `expo-build-properties` 언급을 함께 고친다.

## 범위 밖

- 최소 버전 판정·강제 업데이트 게이트·알림 핸들러·Android 채널 → BY-586
- 기기 토큰 서버 등록 API (BE 티켓 미생성)
- 푸시 정책·권한 요청 시점 (미정)
- Android 알림 아이콘·색 커스텀, 데이터 메시지용 백그라운드 모드
- 웹(`apps/web`) Firebase 도입
