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
- `@react-native-firebase` 26.3.3 기준: peer `expo >= 47`, New Architecture 필수(SDK 54 기본값이라 충족). app plugin은 prebuild 시점에 설정 파일이 없으면 즉시 실패한다. messaging plugin은 Android 알림 아이콘·색만 다루고 iOS는 손대지 않는다. remote-config는 plugin이 없다.

## 변경 1: 의존성

- `@react-native-firebase/app`, `@react-native-firebase/remote-config`, `@react-native-firebase/messaging` (26.x)
- `expo-build-properties` (SDK 54 호환 버전은 `npx expo install`이 고른다)

설치는 `apps/mobile`에서 `pnpm --filter mobile exec npx expo install …`로 한다.

## 변경 2: `app.json` plugins·entitlements

```json
"plugins": [
  "…기존 항목…",
  ["@react-native-firebase/app", { "ios": { "disableSPM": true } }],
  "@react-native-firebase/messaging",
  ["expo-build-properties", { "ios": { "useFrameworks": "static" } }]
],
"ios": { "entitlements": { "aps-environment": "development" } }
```

- iOS는 CocoaPods 모드 + static frameworks로 간다. RNFB 26은 RN 0.75+에서 SPM 모드가 기본이고 dynamic frameworks를 요구하는데, 이번 메이저에 새로 들어온 경로라 embed 스크립트·서명 보정 단계가 붙고 다른 네이티브 모듈까지 dynamic으로 바뀌어 회귀 범위가 넓다. `disableSPM: true`로 검증된 CocoaPods 경로를 쓴다.
- `aps-environment`는 `development`로 둔다. 배포용 export에서 Xcode가 프로파일에 맞춰 `production`으로 바꾼다 (expo-notifications plugin의 기본값과 같은 방식). production 빌드에서 토큰이 발급되는지는 BY-586 실기기 검증에서 확인한다.
- `UIBackgroundModes: remote-notification`은 넣지 않는다. 데이터 메시지가 필요해질 때 추가한다.
- `android.permissions`는 바꾸지 않는다. Android 13+ `POST_NOTIFICATIONS`는 권한 요청을 붙이는 BY-586에서 판단한다.

## 변경 3: 설정 파일 주입 (`app.config.ts`)

- env `GOOGLE_SERVICES_JSON` → `android.googleServicesFile`, `GOOGLE_SERVICES_PLIST` → `ios.googleServicesFile`. env가 없으면 키를 넣지 않는다. prebuild가 필요한 명령에서는 RNFB plugin이 명확한 메시지로 실패하고, Metro만 띄우는 로컬 개발에는 파일이 필요 없다.
- 가드: 파일에서 프로젝트 ID를 읽어(`project_info.project_id` / `PROJECT_ID`) 빌드 변형과 대조한다. `APP_VARIANT !== "production"`인데 prod ID면 throw, `APP_VARIANT === "production"`인데 prod ID가 아니면 throw. 기존 `guardDevBaseUrl`과 같은 자리·같은 방식이다. prod ID 상수는 콘솔 생성 후 채운다 (공개돼도 무해한 식별자).
- 로컬 파일 위치는 `apps/mobile/firebase/dev/`·`apps/mobile/firebase/prod/`이고 `apps/mobile/.gitignore`에 `/firebase/`를 추가한다. `.env.local.example`에 두 env 항목을 추가한다.

## 변경 4: EAS 환경변수 매핑 (`eas.json`)

- 설정 파일 4개를 EAS file 타입 환경변수로 등록한다. `development` 환경에는 dev 프로젝트 파일, `preview`·`production` 환경에는 prod 프로젝트 파일.
- 빌드 프로필에 `environment`를 붙인다: `development`·`development-simulator`·`qa` → `development`, `preview` → `preview`, `production` → `production`.
- 등록 예: `eas env:create --environment development --name GOOGLE_SERVICES_JSON --type file --value ./firebase/dev/google-services.json`. 팀원은 `eas env:pull --environment development`로 받는다.
- 기존 프로필의 `env`·`distribution`·`autoIncrement`는 바꾸지 않는다.

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

- iOS는 CocoaPods 모드 + static frameworks (`disableSPM: true`). SPM은 빌드 문제가 생길 때의 대안이다.
- Firebase 프로젝트 dev/prod 분리, 설정 파일 미커밋, EAS file 환경변수로 주입.
- 어댑터는 Remote Config와 Messaging 둘로 나눈다. 테스트에서 서로 독립적으로 교체한다.
- `aps-environment`는 `development`, 백그라운드 모드는 미추가.

## 테스트

- `lib/__tests__/firebaseConfig.test.ts` (신규): plugin 3개와 `disableSPM`·`useFrameworks: static`·`aps-environment`가 app.json에 있다. env가 있으면 `googleServicesFile`이 반영되고 없으면 키가 없다. 가드 4가지(dev+prod 파일 throw, prod+dev 파일 throw, dev+dev 통과, prod+prod 통과). fixture는 `lib/__tests__/fixtures/firebase/`에 가짜 프로젝트 ID로 둔다.
- `appConfigVariant.test.ts` 확장: eas.json 프로필별 `environment` 매핑을 핀으로 고정한다.
- `permissionCopy.test.ts`: 변경 없이 통과해야 한다 (Android 권한 두 개 유지).
- `remoteConfig.test.ts`·`pushMessaging.test.ts` (신규): `jest.mock`으로 RNFB를 대체해 어댑터 위임, 권한 상태 매핑, 토큰 갱신 구독 해제를 확인한다.

## 검증 절차

1. `npx expo prebuild --clean`으로 plugin 적용을 확인한다: Info.plist·entitlements·Podfile(`use_frameworks! :linkage => :static`, `$RNFirebaseDisableSPM`)·merged AndroidManifest.
2. `eas env:create`로 파일 4개를 올린다.
3. `eas build --profile development`로 iOS·Android Dev Client를 만든다.
4. 실기기에서 `smoke_test` 값과 FCM 토큰 로그를 확인한다. Sentry·webview·회전 잠금 등 기존 네이티브 모듈이 정상 기동하는지 함께 본다.

## 완료 조건

- development 프로필 iOS·Android 빌드 성공, 실기기에서 Remote Config 값 조회와 FCM 토큰 발급 확인.
- dev 빌드에 prod 파일 주입 시 설정 읽기 시점에 실패 (테스트로 고정).
- 기존 권한 열거 테스트 통과, lint·typecheck·test 통과.
- `.env.local.example`·`apps/mobile/CLAUDE.md`에 파일 주입 방식과 dev/prod 매핑 기록. CLAUDE.md의 낡은 `expo-build-properties` 언급을 함께 고친다.

## 범위 밖

- 최소 버전 판정·강제 업데이트 게이트·알림 핸들러·Android 채널 → BY-586
- 기기 토큰 서버 등록 API (BE 티켓 미생성)
- 푸시 정책·권한 요청 시점 (미정)
- Android 알림 아이콘·색 커스텀, 데이터 메시지용 백그라운드 모드
- 웹(`apps/web`) Firebase 도입
