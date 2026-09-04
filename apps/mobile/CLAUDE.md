# apps/mobile

Expo RN 앱(앱 셸). **2026-07-25 기능 리셋으로 스터디룸 관련 코드(WebView 룸 라우트, dormant 네이티브 자산)는 전부 삭제됐다** — 남은 것은 홈 탭 셸과 익명 기기 유저 등록(SCRUM-259, `lib/*`)뿐이다(git 히스토리에서 복구 가능 — ADR 0003 갱신 노트 참고). 스터디룸 재구축 시 "WebView로 `apps/web`을 로드"하는 방침(ADR 0001)을 따른다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md), [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md) 순서로 참고.

앱 셸(온보딩/로그인/홈 등) 화면을 Figma 기반으로 구현할 때는 [Codex의 AI-native 모바일 개발 설계 문서](../../docs/superpowers/specs/2026-07-22-ai-native-mobile-development-design.md)의 화면 단위 흐름·보호 파일 목록·컴포넌트 승격 규칙을 따른다(단, 이 문서가 전제하는 `AGENTS.md`/`docs/ai-development/`/`docs/screens/`는 아직 이 저장소에 없다 — 루트 [CLAUDE.md](../../CLAUDE.md)의 관련 섹션 참고).

## 구조

`src/` 없이 라우터(`app/`)와 유틸 디렉터리를 루트 바로 아래에 둔다.

- `app/` — `expo-router` 파일 기반 라우팅. `app/(tabs)/`는 탭 네비게이션(현재 홈 탭만).
- `lib/` — 순수 유틸·API 연동 함수(테스트 대상). `deviceId.ts`(기기 UUID), `userApi.ts`(익명 유저 등록), `cameraPermission.ts`(OS 카메라 권한 어댑터), `deviceMotion.ts`(기기 조작 판정 — 순수)·`deviceMotionSource.ts`(`expo-sensors` 가속도 구독 어댑터, BY-340).

(구 스터디룸 라우트 `app/room/[id].tsx`, `features/study-session/`, `platform/{camera,vision,rtc}/`, `components/ui/`는 2026-07-25 기능 리셋으로 삭제 — 재구축 시 git 히스토리의 패턴을 참고한다.)

**경계 규칙**: UI 컴포넌트는 카메라/WebRTC SDK를 직접 import하지 않는다 — 네이티브 전환 시 플랫폼 어댑터 계층을 통한다. 공부 상태 계산은 `@focusmakers/study-core`(순수 TS)에 있고, 카메라/Vision/RTC 구현과 분리된다.

## WebView 스터디룸 (재구축 예정)

- 스터디룸 재구축 시 `react-native-webview`로 `apps/web`의 `/room/:id`를 로드하는 구조(ADR 0001)를 따른다 — 과거 구현은 git 히스토리의 `app/room/[id].tsx` 참고.
- 카메라 권한 문구는 `app.json`의 `ios.infoPlist.NSCameraUsageDescription` / `android.permissions`(`CAMERA`)에 유지되어 있다 — WebView 안의 브라우저 `getUserMedia`도 동일한 네이티브 권한이 필요하다. 마이크 권한은 추가하지 않는다(멀티룸 음성 송출 없음, 방침 변경 없음).
- **2026-07-31(BY-333)부터 로컬 번들 동봉·서빙 인프라가 없다.** 스터디룸을 포함한 모든 화면이 원격 URL을 여는 `RemoteScreen`/`RemoteWebViewHost`로 바뀌면서, `apps/web` 산출물을 앱 번들에 넣고 `@dr.pogodin/react-native-static-server`로 서빙하던 구조([ADR 0005](../../docs/adr/0005-bundled-web-assets-over-localhost-server.md), Superseded)와 `lib/staticWebAssetServer.ts`·`plugins/withWebDistAssets.js`·`scripts/syncWebDist.js`가 전부 삭제됐다. 그 결정이 Expo Go 경로를 닫은 이유로 꼽았던 "로컬 HTTP 서버가 Expo Go에 없는 네이티브 모듈"이라는 전제는 이제 없다.
- **다만 Expo Go로 다시 열렸다고 확정해서 쓰지 말 것 — 미확인.** `app.json`의 `plugins`에는 BY-585(2026-09-03)부터 `expo-build-properties`(iOS `useFrameworks: "dynamic"`, Firebase SPM 요구사항)와 `@react-native-firebase/app`·`messaging`이 들어 있다(BY-282 때의 cleartext 예외용 설정은 HTTPS 전환으로 이미 제거됐다). config plugin은 prebuild/Dev Client 빌드에서만 적용되므로, 이 앱이 실제로 Expo Go에서 뜨는지는 이 문서를 쓴 시점에 실기기·시뮬레이터로 검증하지 않았다. `expo-camera`·`react-native-webview`·`expo-secure-store`·`react-native-svg`·`react-native-reanimated` 등 나머지 네이티브 의존성 자체는 Expo Go SDK 54에 포함된 표준 모듈이지만, 위 config plugin이 걸림돌로 남아 있을 수 있다는 뜻이다. `expo-dev-client` 의존성도 아직 제거되지 않았다.

## 카메라 권한 (`expo-camera`, 권한 API만)

`expo-camera ~17.0.10`이 **권한 조회·요청 목적으로만** 들어 있다([ADR 0004](../../docs/adr/0004-expo-camera-for-permission-api-only.md)).

- **`CameraView`를 쓰지 말 것.** 카메라 스트림·Vision 추론은 `apps/web`의 WebView `getUserMedia` 소유다(ADR 0001). 네이티브에 프리뷰를 그리는 것은 ADR 0003의 전환 트리거 확인이 선행되어야 하는 별개 결정이다.
- 호출은 `lib/cameraPermission.ts` 어댑터 뒤에만 둔다 — 화면·컴포넌트가 `expo-camera`를 직접 import하지 않는다.
- **`app.json`의 `plugins`에 `expo-camera`를 추가하지 말 것.** 네이티브 링킹은 autolinking으로 되고, plugin을 넣으면 영어 기본 `NSMicrophoneUsageDescription`과 Android `RECORD_AUDIO`가 주입된다. `lib/__tests__/permissionCopy.test.ts`가 이 오염을 잡는다.
- 테스트는 `setCameraPermissionAdapter()`로 어댑터를 교체해 권한 분기를 재현한다. `jest.mock("expo-camera")`는 어댑터 단위 테스트에만 쓴다.

## 네트워크 / ATS — 2026-08-02 HTTPS 전환으로 정리 완료

운영 `extra.apiBaseUrl`은 `https://api.focusmakers.app`다(BY-402부터 원천은 `app.config.ts`의
production 분기 — app.json의 값은 개발용 빈 문자열이다). 과거(2026-07-29~08-02) 평문 HTTP +
IP(`http://52.78.219.53:8080`) 시절 열어뒀던 임시 개방은 전부 걷어냈다:

- iOS `NSAppTransportSecurity.NSAllowsArbitraryLoads` 블록 삭제 — **다시 넣지 말 것.** 남긴 채 제출하면 심사에서 사유 소명을 요구받는다. `lib/__tests__/appTransportSecurity.test.ts`가 "https면 ATS 예외 없음"을 강제한다(평문 http로 되돌리면 반대로 예외 추가를 요구).
- `expo-build-properties`의 `android.usesCleartextTraffic` 삭제(플러그인 항목째). Android 디버그 빌드는 RN 기본 debug manifest가 localhost 평문을 계속 허용하므로 `adb reverse` + `http://localhost:5173` dev 흐름은 그대로 동작한다.
- 네이티브 설정이라 반영에는 Dev Client 리빌드가 필요하다.

## Firebase (Remote Config·FCM) — 2026-09-03 도입 (BY-585)

`@react-native-firebase/app`·`remote-config`·`messaging`(26.x). 설계는 [BY-585 설계 문서](../../docs/superpowers/specs/2026-09-03-by-585-firebase-sdk-design.md), 기능(최소 버전 게이트·알림 핸들러)은 BY-586.

- **설정 파일은 커밋하지 않는다.** `google-services.json`·`GoogleService-Info.plist`는 `apps/mobile/firebase/{dev,staging,prod}/`(gitignore)에 두고 `.env.local`의 `GOOGLE_SERVICES_JSON`·`GOOGLE_SERVICES_PLIST` 경로로 `app.config.ts`가 `googleServicesFile`에 주입한다. EAS 빌드는 file 타입 환경변수로 같은 이름을 받는다 — `eas.json`의 `environment` 매핑: development·development-simulator → `development`(dev 프로젝트의 `.dev` 아이덴티티 파일), staging → `preview`(dev 프로젝트의 `.staging` 아이덴티티 파일), production → `production`(prod 프로젝트 파일). 파일의 `package_name`·`BUNDLE_ID`가 빌드 아이덴티티와 다르면 `app.config.ts`가 throw한다. env가 없으면 키를 넣지 않는다: Metro만 띄울 때는 파일이 필요 없고, prebuild가 필요한 명령에서는 RNFB plugin이 명확한 메시지로 실패한다.
- **Firebase 프로젝트는 dev/prod 둘이다**(`focusmakers-dev`·`focusmakers-prod`). `app.config.ts`가 파일 안의 프로젝트 ID를 읽어 `APP_VARIANT`와 어긋나면 설정 읽기 시점에 throw한다 — `guardDevBaseUrl`과 같은 원칙으로, dev 빌드가 운영 Remote Config·FCM에 붙는 것(최소 버전 테스트가 실사용자를 막는 사고)을 막는다. `lib/__tests__/firebaseConfig.test.ts`가 고정한다.
- **iOS는 SPM + dynamic frameworks다.** RNFB 26 기본값이고 `expo-build-properties`의 `ios.useFrameworks: "dynamic"`이 그 요구사항이다. **`disableSPM`(CocoaPods 모드)이나 `static`으로 되돌리지 말 것** — SPM 제품은 static 링크에서 중복 심볼로 깨지고, Firebase는 2026-10부터 CocoaPods에 새 버전을 올리지 않는다. Firebase 12.12+가 Xcode 26.2 이상을 요구해 `eas.json` 전 프로필의 `ios.image`가 `macos-sequoia-15.6-xcode-26.2`다(SDK 54 기본 이미지는 26.0). 프레임워크 모드에서 Expo autolinking은 핵심 pod 4개(ExpoModulesCore·Expo·ReactAppDependencyProvider·expo-dev-menu)만 static으로 내리고 사전 컴파일 RN 코어는 유지한다 — 빌드 오류 시 탈출구는 `ios.forceStaticLinking`(pod 단위) → `ios.buildReactNativeFromSource: true` 순.
- **Firebase Analytics는 링크하지 않는다.** `remote-config`가 `@react-native-firebase/analytics`를 peer로 요구해 pnpm이 자동 설치하지만, `package.json`의 `expo.autolinking.exclude`로 네이티브 링크를 막았다(Analytics SDK가 들어가면 자동 수집이 시작되고 개인정보 라벨 대상이 된다). `firebaseConfig.test.ts`가 고정한다. 나중에 앱 분석이 필요해지면 exclude를 풀고 별도 티켓으로 간다. 네이티브에서만 보이는 사용자 이벤트(탭 터치 등)는 SDK 없이 브리지로 웹 Amplitude에 넘긴다 — 아래 "네이티브 사용자 이벤트 → 웹 Amplitude" 절.
- **화면·컴포넌트는 `@react-native-firebase/*`를 직접 import하지 않는다.** `lib/remoteConfig.ts`·`lib/pushMessaging.ts` 어댑터만 거친다(`cameraPermission.ts` 패턴, `set*Adapter()`로 테스트 교체). RNFB는 설정 파일로 네이티브에서 자동 초기화되므로 별도 init 모듈은 없다.
- **`@react-native-firebase/messaging`은 pnpm patch가 걸려 있다**(`patches/@react-native-firebase__messaging@26.3.3.patch`). iOS 실기기(iPhone 17 Pro, iOS 26.6.1)에서 APNs 등록이 끝나 FIRMessaging이 APNs 토큰을 들고 있는데도 UIKit의 `isRegisteredForRemoteNotifications`가 NO를 돌려줘 `getToken`이 `[messaging/unregistered]`로 실패했다(2026-09-03 실측). 패치는 (1) v25까지 있던 main-queue `methodQueue`를 되돌리고 — 이것만으로는 해결되지 않았다 — (2) `getToken`이 FIRMessaging의 APNs 토큰이 있으면 UIKit 플래그와 무관하게 발급을 진행하게 한다. 플래그가 NO인 이유는 미확정. RNFB를 올릴 때 패치가 깨지면 업스트림 수정 여부를 먼저 확인한다. JS 쪽 `isDeviceRegisteredForRemoteMessages`는 자동 등록을 반영하지 않으니(JS가 직접 등록하기 전엔 false) 판단 근거로 쓰지 말고, `lib/pushMessaging.ts`처럼 APNs 토큰 유무로 본다 — 이미 등록된 상태에서 `registerDeviceForRemoteMessages`를 다시 부르면 직후 `getToken`이 실패한다.
- **강제 업데이트는 네이티브가 판정한다(BY-586).** `lib/forceUpdate.ts`가 부팅 시 Remote Config `min_supported_version`을 activate(1초 제한, 실패는 통과)해 앱 버전과 비교하고, `app/_layout.tsx`가 forced면 라우터 스택 대신 빈 배경만 그리고 `lib/forceUpdateAlert.ts`가 OS 알림창(`Alert.alert`, 버튼 하나)을 띄운다. 문구는 `lib/forceUpdateCopy.ts`가 Remote Config `force_update_title/message/button`에서 읽고 없으면 BY-533 카피다. **Remote Config 기본값은 `UPDATE_CONFIG_DEFAULTS` 한 곳에서 한 번의 `setDefaults`로 등록한다**(RNFB는 맵을 통째로 바꿈 — 다른 곳에서 또 부르면 서로 지운다) — 알림창은 버튼을 누르면 닫히므로 스토어 복귀(`AppState` active)·스토어 실패·배경 탭에서 다시 띄우는 것이 차단 로직이다(iOS는 겹침 방지로 떠 있는 동안 건너뛰고 Android는 새 창이 기존 창을 대체). 반영은 "다음 실행"이다(판정 후 백그라운드 fetch). 웹뷰 URL에 `nativeUpdateGate=1`을 붙여 웹 `useForceUpdateGate`를 건너뛰므로, 웹 상수 `MIN_SUPPORTED_VERSION`은 이 표시가 없는 구버전 바이너리 전용이다. 스토어 이동은 `lib/storeLink.ts`(웹 `storeLink.ts`와 같은 ID, 스킴 → https 폴백). 같은 판정이 `latest_version`도 읽어 막히지 않았을 때만 `recommended`를 돌려주고, `lib/recommendedUpdateAlert.ts`가 홈 위에 "나중에" 있는 알림창을 최신 버전당 한 번(SecureStore 기록) 띄운다(BY-608). 권장 문구도 `lib/recommendedUpdateCopy.ts`가 Remote Config `recommended_update_*` 네 키에서 읽고 없으면 초안 문구다(읽기 공통 `lib/remoteConfigCopy.ts`). 정책과 올리는 절차는 `docs/releases.md` "최소 지원 버전 정책".
- **푸시 배선은 `lib/pushBootstrap.ts`(포그라운드 로그·알림 탭 → `lib/pushNotificationRouting.ts`로 경로 변환 → `router.push`·토큰 갱신 로그)와 `index.ts`(커스텀 엔트리, `lib/pushBackground.ts`의 백그라운드 핸들러)다(BY-586).** 백그라운드 핸들러는 React 트리 밖에 있어야 Android headless에서 불린다 — `package.json` `main`을 `expo-router/entry`로 되돌리지 말 것(`firebaseConfig.test.ts`가 고정). **알림 권한 요청은 개발 빌드(`__DEV__`)에서만** 부팅 시 한다 — 운영 빌드는 어떤 화면에서도 요청하지 않는다(정책 미정). 포그라운드 수신은 표시하지 않고, 토큰은 로그까지만(BE API 없음). Android 전용 알림 채널은 없다 — FCM 기본 채널로 표시되며, 정책이 정해지면 `expo-notifications`/notifee로 추가한다. Expo Go는 지원하지 않는다(엔트리에서 RNFB를 정적 import).
- `aps-environment`는 `development`로 둔다 — 배포 export에서 Xcode가 `production`으로 바꾼다. `UIBackgroundModes: remote-notification`은 넣지 않았다. Android `POST_NOTIFICATIONS`는 Android 13+ 수신 검증을 위해 **임시로만** 선언한다(별도 커밋, 브랜치 push 전에 되돌림 — 2026-09-04 결정). 정식 선언은 권한 정책과 함께. Firebase 콘솔의 GA·Gemini 연동은 dev·prod 모두 끈 상태다(설계 문서 "확정한 결정").

## 에러 모니터링 (Sentry) — 2026-08-06 도입

`lib/sentry.ts`가 `@sentry/react-native`(~7.2.0)를 초기화하고 `app/_layout.tsx`가 렌더 전에 부른다.

- **프로젝트는 `focusmakers-app`이다** — 웹(`focusmakers-web`)·백엔드(`focusmakers-api`)와 분리돼 있다. 같은 세션이라도 웹뷰 안 에러는 웹으로, 셸 에러는 이쪽으로 간다. 산출물도 소스맵도 릴리즈도 완전히 달라서 한 통에 섞으면 어느 쪽 스택인지 구분할 수 없다. **웹 DSN을 복사해 오지 말 것** — `lib/__tests__/sentryConfig.test.ts`가 프로젝트 ID를 못 박는다.
- **DSN은 `app.json`의 `extra.sentryDsn`에 둔다**(환경 무관 고정값이라 `app.config.ts` 분기
  대상이 아니다 — 전송 여부는 런타임 `enabled: !__DEV__`가 가른다). DSN은 비밀이 아니다 — 이벤트를 보낼 주소일 뿐이고 어떤 빌드에도 그대로 들어간다. 반대로 소스맵 업로드용 **`SENTRY_AUTH_TOKEN`은 비밀이라 EAS Secret에 넣는다**(`.env.local`도, 커밋도 금지).
- **Session Replay(`mobileReplayIntegration`)를 추가하지 말 것.** 앱은 전 화면이 WebView 셸인데 RN 리플레이는 WebView를 통째로 마스킹하는 게 기본이라 켜도 마스킹된 사각형만 남아 실익이 없고, 마스킹을 풀면 카메라 프리뷰가 녹화돼 아래 절의 개인정보 원칙과 정면 충돌한다. 웹은 BY-407로 2026-08-20부터 카메라 차단 조건으로 켰고 자세한 내용은 `apps/web/CLAUDE.md`에 있다. 이 금지는 앱에만 남았다. `sendDefaultPii`는 `false`로 못 박았다. Sentry 공식 예제는 `true`지만 따라가지 말 것.
- 성능 추적(`tracesSampleRate`)은 켜지 않았다. 모든 화면이 웹뷰인 셸이라 네이티브에 잴 구간이 사실상 없고 화면 로딩 성능은 웹 프로젝트가 이미 본다.

### 웹과 달리 스크러빙 콜백이 없다

웹은 `?userId=N` 유출 때문에 `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb` 네 개를 붙였다(`apps/web/CLAUDE.md`). **네이티브에는 그 경로가 없어서 붙이지 않았다** — 2026-08-06에 확인한 근거는 이렇다.

- 네이티브 `fetch`는 `lib/userApi.ts` 한 곳뿐이고 **쿼리스트링 없는 POST**다. 웹의 유출 지점이던 fetch 스팬의 `http.query`에 담길 것이 없다.
- `?userId=N`은 웹뷰 URL에만 있는데, 그 로딩은 네이티브 WKWebView가 하므로 JS `fetch`/`xhr` breadcrumb에 잡히지 않는다. `RemoteWebViewHost`의 `onError`/`onHttpError`도 URL을 로그에 남기지 않는다.
- `console.*` 호출 14곳 전부 URL을 담지 않는다(breadcrumb으로 새지 않는다).

⚠️ **네이티브에서 쿼리스트링이 붙은 요청을 추가하거나 URL을 로그에 남기게 되면 이 전제가 깨진다.** 그때는 웹의 `lib/sanitizePath.ts`에 해당하는 스크러빙을 여기에도 넣어야 한다.

### 동작 확인은 릴리즈 빌드로만 된다

`enabled: !__DEV__`라 **개발 빌드·Expo Go에서는 아무것도 전송되지 않는다**(Fast Refresh 중 나는 일시적 에러가 실사용자 에러를 덮는 것을 막기 위해서다). 게다가 `@sentry/react-native`는 네이티브 모듈이고 config plugin은 prebuild에서만 적용되므로 **Expo Go에서는 네이티브 크래시 수집 자체가 없다.** 검증은 EAS `staging`(내부 배포)/`production`(TestFlight) 빌드에서 에러를 한 번 내고 Sentry에서 확인하는 방식으로 한다.

⚠️ **`metro.config.js`를 `getDefaultConfig`로 되돌리지 말 것.** `getSentryExpoConfig`가 번들과 소스맵에 같은 debug ID를 심는다. 되돌려도 빌드는 성공하고 업로드도 성공하는데 **스택트레이스만 압축된 채로 남는다** — 로그에 신호가 없어 원인을 찾기 가장 어려운 실패다(웹에서 2026-08-05에 같은 종류를 겪었다). 확인법: `npx expo export --platform ios` 후 산출된 `.hbc`에서 `sentry-dbid-`가 1개 나오면 정상.

## 웹 dev 서버로 화면 띄우기 (2026-09-04 갱신, BY-600 3티어)

**모든 화면이 `extra.webBaseUrl`이 가리키는 원격 주소를 연다**(BY-333). 값의 원천은 `app.config.ts`다.
`APP_VARIANT`는 `production`, `staging`, `development` 세 값이고 미설정은 development다. 세 값 밖의
문자열은 설정 평가 시점에 throw한다. 이 값 하나에서 주소, bundle id·package 접미사(`.staging`/`.dev`),
표시명 접미사(` STG`/` DEV`), `extra.appEnv`(Sentry environment)가 파생된다. 근거는
[ADR 0007](../../docs/adr/0007-three-tier-environment-model-and-eas-profiles.md).

- **EAS production 빌드**: `APP_VARIANT=production` → 운영 주소 상수, 아이덴티티 `com.breathlessyouth.mobile`.
- **EAS staging 빌드**: `APP_VARIANT=staging` → `api-dev`·`web-dev` 상수, 아이덴티티 `com.breathlessyouth.mobile.staging`, 표시명 `포커스 메이커스 STG`. 운영 앱과 한 기기에 나란히 설치된다.
- **로컬 Metro·개발 빌드**: `APP_VARIANT` 없음 → development. 주소는 `.env.local`의 `WEB_BASE_URL`·`API_BASE_URL`이고 미주입이면 빈 주소라 폴백 화면이 뜬다. 아이덴티티 `com.breathlessyouth.mobile.dev`.
  ```bash
  # apps/mobile/.env.local
  WEB_BASE_URL=http://localhost:5173
  API_BASE_URL=http://localhost:8080
  ```
  production·staging에서는 이 주입이 무시된다(`lib/__tests__/appConfigVariant.test.ts`).

Dev Client에서는 이 값이 Metro 매니페스트로 오므로 **Metro만 재시작하면** 반영된다.

**딥링크 선언의 원천도 같은 변형 표다**(2026-09-04, BY-601). `app.config.ts`가 `schemes`와 App Link 호스트(`webBaseUrl`의 호스트 + `legacyHosts`)에서 `scheme`, `ios.associatedDomains`, `android.intentFilters`를 만들고 **`app.json`에는 이 세 키가 없다**. production은 `focusmakers`·`focuson` 스킴에 `web.focusmakers.app`·`web.sunqstudio.kr`, staging은 `focusmakers-staging`에 `web-dev.focusmakers.app`, **development는 `focusmakers-dev` 스킴만 두고 App Link를 선언하지 않는다**(웹 주소가 로컬이라 걸 호스트가 없고, staging과 같은 호스트를 두 앱이 claim하면 어느 앱이 열릴지 OS가 보장하지 않는다). 푸시 딥링크 허용 목록(`lib/pushNotificationRouting.ts`)도 같은 값을 `extra.appSchemes`·`extra.deepLinkHosts`에서 읽으므로 스킴·호스트를 코드에 다시 적지 않는다. `lib/__tests__/deepLinkDomains.test.ts`가 이 파생을 고정한다.

### Android

`getUserMedia`는 secure context를 요구하고 `http://`는 **`localhost`일 때만** 인정된다. `adb reverse`로 기기의 localhost를 Mac으로 넘긴다.

```bash
pnpm --filter web dev                     # Vite 5173
adb reverse tcp:5173 tcp:5173
# .env.local: WEB_BASE_URL=http://localhost:5173
```

### iOS 실기기

`adb reverse`에 해당하는 것이 없다. **LAN IP를 http로 쓰면 secure context가 아니라 카메라가 막힌다** — 그래서 HTTPS가 필수다.

```bash
brew install mkcert nss
sudo mkcert -install                       # Mac 키체인에 루트 CA 등록
cd apps/web && mkdir -p .certs && cd .certs
mkcert 192.168.0.19 localhost 127.0.0.1 ::1   # 본인 Mac의 LAN IP

VITE_DEV_HTTPS=1 pnpm --filter web dev     # 옵트인이다 — 아래 주의 참고
# .env.local: WEB_BASE_URL=https://192.168.0.19:5173
```

기기에는 `mkcert -CAROOT`의 `rootCA.pem`을 AirDrop 등으로 옮겨 프로파일을 설치하고, **설정 → 일반 → 정보 → 인증서 신뢰 설정**에서 신뢰시켜야 한다. LAN IP는 네트워크가 바뀌면 달라지므로 그때마다 인증서를 다시 만든다.

⚠️ **HTTPS는 `VITE_DEV_HTTPS=1`일 때만 켜진다. 인증서 존재만으로 켜지지 않는다** — Android는 반대로 http여야 하기 때문이다(위 절 참고). 인증서 파일이 남아 있다는 이유로 프로토콜이 바뀌면 그날따라 Android가 안 되는 원인을 찾기 어렵다. `.certs/`는 개인 키라 `.gitignore` 대상이다.

### 클라이언트 격리 네트워크(AP isolation)에서는 LAN IP가 안 통한다

회사망 등에서 폰·Mac이 같은 Wi-Fi인데도 서로 통신이 안 되면 위 LAN IP 경로는 어떤 설정으로도 뚫리지 않는다(2026-07-30 확인). 이때는 `VITE_DEV_TUNNEL=1`로 `apps/web/vite.config.ts`의 터널 모드를 켜고 `cloudflared`로 Vite·Metro 양쪽을 터널링한다 — 자세한 이유·설정은 `vite.config.ts`의 `tunnelServerOptions` 주석 참고. 공개 URL이라 검증 후 반드시 내린다.

## 네이티브 사용자 이벤트 → 웹 Amplitude (`lib/nativeAnalytics.ts`, 2026-09-04)

분석 SDK는 웹에만 있다(위 Firebase Analytics 미링크, 네이티브 Amplitude SDK도 들이지 않는다 — device_id가 웹뷰와 갈라져 신원 통합이 필요해진다). 하단 탭 터치·카메라 권한 게이트 결과·권한 거부 안내(S2-3) 행동·권장 업데이트 알림창 응답·알림 탭·초대 딥링크 진입·웹뷰 로드 실패/재시도처럼 **네이티브에서만 일어나는 사용자 이벤트**는 `lib/nativeAnalytics.ts`의 `trackNativeEvent`로 기록하고, 웹뷰 호스트가 브리지 `track-event`로 웹에 넘겨 웹 Amplitude가 같은 user_id·세션으로 전송한다(`apps/web/src/lib/nativeAnalytics.ts` → `trackNativeShellEvent`, `source: "native"`). **이벤트 카탈로그(이름·속성 타입)는 `NativeAnalyticsEventMap` 한 곳이다** — 새 이벤트는 거기 추가하면 타입이 발신부를 강제하고, 웹은 이름을 해석하지 않고 형식만 검증한다. 속성은 원시값만, 식별자·초대코드·자유 문자열 금지(웹 CLAUDE.md 사용 분석 규칙과 동일).

- **전달 대상(sink)은 항상 하나다.** 탭 4개 웹뷰가 동시에 마운트돼 있어 아무 웹뷰에나 주입하면 한 터치가 N번 찍힌다. `RemoteWebViewHost`는 `focused`(탭은 `useIsFocused` — `RemoteScreen`이 `suppressTabBarMessages`에서 파생해 내려 준다)이면서 웹이 `analytics-ready`를 보낸 문서일 때만 sink로 붙는다. 세션 화면(`room/[id]`)은 탭 위 전체 화면이라 prop을 생략해 항상 활성이다.
- **sink가 없는 동안은 큐에 보관한다**(최대 100건, 오래된 것부터 폐기). 권한 거부 화면이 탭을 덮은 동안·로드 실패·재로드·렌더러 복구 중에 난 이벤트는 다음 sink가 붙는 순간 순서대로 흘러간다. `atMs`(발생 시각)를 그대로 갖고 가서 웹이 Amplitude `time`으로 쓴다 — 늦게 도착해도 타임라인이 맞는다. 한 번 넘긴 이벤트는 다시 넘기지 않는다.
- **`analytics-ready`는 `home-ready`와 같은 handshake다.** 어느 로드 콜백도 "웹 JS가 돌았고 구독까지 걸렸다"를 보장하지 못한다(Android는 실패한 로드에도 finish를 합성). 호스트는 재시도·사망 복구 진입에서 준비 상태를 되돌리고, **`onLoadEnd`에서는 되돌리지 않는다** — 새 문서의 신호가 onLoadEnd보다 먼저 올 수 있어 거기서 되돌리면 준비된 문서를 미준비로 덮어쓴다(`RemoteWebViewHost.test.tsx`가 고정).
- 못 잡는 구간: 강제 업데이트 화면(웹뷰 미마운트), 하드웨어 백·스와이프 백으로 S2-3을 떠나는 경로, `/contact` 문서 내비게이션 중(구 문서 파괴~새 문서 준비 사이)에 난 이벤트. 이 구간이 실제로 필요해지면 그때 네이티브 SDK를 검토한다(`packages/types/src/bridge.ts`의 `TrackEventMessage` 주석).
- 설계 문서: `docs/superpowers/specs/2026-09-04-native-analytics-bridge-design.md`.

## 화면 방향 — 룸만 회전 (2026-07-30, 2026-08-01 집행 주체 정정, 2026-08-26 BY-444 재정정)

**싱글룸(`room/[id]`)과 소셜룸(웹 브리지 `set-orientation`)만 회전하고 나머지는 전부 세로다.** 가로 레이아웃이 실제로 구현된 화면이 룸뿐이라서다(S3-5·S3-6, 소셜룸 가로 그리드).

정책은 **세 곳이 함께** 만든다. 한쪽만 보고 고치면 조용히 깨진다.

| 위치                                             | 값                                                             | 역할                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `app.json`의 `orientation`                       | `"default"`                                                    | 네이티브가 허용하는 방향의 **상한**(iOS `UISupportedInterfaceOrientations`) |
| `lib/orientation.ts` (`expo-screen-orientation`) | 루트 세로 잠금 / 룸에서 해제                                   | **iOS의 단일 집행자** — 아래 재정정 참고                                    |
| `app/_layout.tsx`의 `screenOptions`              | **Android에서만** `orientation: "portrait"` / 세션 `"default"` | Android 집행(`setRequestedOrientation`) — iOS에는 싣지 않는다(아래 재정정)  |

- **`app.json`을 `"portrait"`로 되돌리지 말 것.** 그건 앱을 세로로 만드는 설정이 아니라 상한을 세로로 닫는 설정이라, 세션이 landscape를 요청해도 회전하지 않게 된다.
- **P0-3("rn-screens가 처리하므로 `expo-screen-orientation` 불필요") 정정 (2026-08-01)** — iOS는 회전 판단 시 앱 델리게이트에 마스크를 묻는데, Expo의 구현은 구독자가 없으면 Info.plist(= `"default"` = 전 방향)를 그대로 반환한다. 세션 회전이 "동작"했던 것은 설정 덕이 아니라 `fullScreenModal`(presented VC는 UIKit이 직접 조회)이라서였고, 홈·기록·설정의 세로 잠금은 동작한 적이 없다(2026-08-01 실기기). 그래서 `expo-screen-orientation`이 들어왔다.
- **P0-3 정정의 재정정 (BY-444, 2026-08-26)** — 그 뒤로도 iOS TestFlight에서 전 화면이 회전됐다. P0-3 정정이 "iOS에서 무력하지만 무해"라며 남겨 둔 rn-screens `orientation` screenOption이 원인이다: `expo-screen-orientation`의 iOS 집행자(루트 VC `ScreenOrientationViewController`)는 **orientation이 실린 RNSScreen이 하나라도 있으면 JS 잠금(`lockAsync`)을 무시하고 rn-screens에 양보**하는데(`shouldUseRNScreenOrientation()` — "부르는 코드가 없다"던 P0-3의 전제가 틀렸다, 이 패키지 자신이 호출자다), 양보받은 rn-screens의 iOS 마스크 산출은 우리 계층 구조에서 전 방향 허용으로 떨어진다. 그래서 **rn-screens `orientation` 옵션은 Android에서만 싣는다**(`_layout.tsx`의 `Platform.OS` 분기). **iOS에 이 옵션을 되살리면 세로 잠금이 통째로 조용히 죽는다.** 소셜룸의 `set-orientation` 브리지(`RemoteWebViewHost`)도 같은 커밋부터 양 플랫폼 공통이다 — 종전 "iOS 무시"는 잠금이 우회되던 동안에만 성립하던 결정이다. 근거 전문은 `lib/orientation.ts` 주석.
- 세션 해제를 `ALL`이 아니라 `DEFAULT`로 둔 이유는 iOS에서 `ALL`이 거꾸로 세로까지 포함하기 때문이다(rn-screens 시절 `"default"`와 같은 이유).
- `expo-screen-orientation`은 네이티브 모듈이라 **Dev Client 리빌드가 필요하다.** 구형 빌드에서는 잠금 호출이 조용히 실패해 이전 동작(회전 허용)으로 물러난다(`lib/orientation.ts`의 catch).

⚠️ 세션 외 화면에 가로 레이아웃을 만들기 전에는 이 정책을 풀지 말 것 — 현황은 [SCR-S3-5-S3-6](../../docs/screens/SCR-S3-5-S3-6-session-landscape.md)의 "화면별 가로 대응 현황" 참고.

## 개인정보 원칙 (변경 불가, WebView·네이티브 어느 쪽이든 동일)

- 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말 내부에서만 처리. 서버 전송·저장·로그 금지. 서버에는 비공부 상태 이벤트(`StudyEventStatus`: `PHONE`/`DEVICE`/`AWAY`/`PAUSE`)와 세션 집계만 전송 — 용어는 [docs/domain-glossary.md](../../docs/domain-glossary.md) 참고.
- 싱글룸: 영상 자체가 어디에도 전송되지 않는다.
- 멀티룸: 카메라 영상은 WebRTC P2P로 상대 참여자에게 직접 전송된다(서버 미경유, 녹화·저장 안 함). "영상이 서버로 전송되지 않는다"고 쓰지 말 것 — "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다"로 표현. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것.

## 네이티브 전환 시 (지금은 해당 없음)

`eas.json`(development/development-simulator/staging/production 프로필)은 전환 대비로 남겨뒀다. 실제로 네이티브로 되돌릴 때 할 일은 [ADR 0003의 전환 체크리스트](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때)를 따른다 — `expo-camera`/`expo-dev-client` 재설치, `platform/*` mock을 실제 구현으로 교체, `eas init`으로 EAS project id 발급 등.

## Expo SDK

**SDK 54 고정이다(의도적).** 최신은 57이지만 올리지 않는다 — 참조할 문서는 https://docs.expo.dev/versions/v54.0.0/ 이다. 버전이 낡아 보인다는 이유로 업그레이드를 제안하거나 실행하지 말 것.

## 명령

```bash
pnpm --filter mobile start      # expo start — Expo Go로 바로 스캔 가능
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

## 컨벤션

- 스타일은 NativeWind(Tailwind 클래스, `className`)를 우선 사용. `StyleSheet.create`는 NativeWind로 표현하기 어려운 경우에만.
- 새 화면 추가 시 `app/` 디렉터리 구조로 라우팅이 결정되므로, 화면 단위 로직은 해당 라우트 파일 옆에 co-locate 한다. 재사용 로직은 `features/`·`platform/`·`packages/*`로 올린다.
- `platform/*`의 mock 구현을 실제 라이브러리로 바꾸기 전에 반드시 [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md)의 전환 트리거/체크리스트를 확인할 것 — 조기 전환하지 않는다.
