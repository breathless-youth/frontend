# apps/mobile

Expo RN 앱(네이티브 셸). 탭바·스택·권한 게이트·스플래시·토큰을 맡고, 카메라 권한 거부 안내(`app/permission-denied.tsx`)를 뺀 모든 화면은 `RemoteScreen`이 원격 URL 웹뷰로 `apps/web`을 연다([ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md)). 배경은 루트 [CLAUDE.md](../../CLAUDE.md), 되돌린 경위는 [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md).

## 구조

`src/` 없이 라우터(`app/`)와 유틸 디렉터리를 루트 바로 아래에 둔다. `app/(tabs)/`는 탭 네비게이션, `app/room/`·`app/social/`은 세션·소셜룸, `lib/`는 순수 유틸·API 연동 함수(테스트 대상)다.

- `lib/auth.ts`(BY-527)가 access·refresh 토큰의 유일한 소유자다. SecureStore 키 `focuson.auth` 하나에 JSON으로 저장하고 읽기·쓰기·삭제 전부에 `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`를 넘긴다. 이 옵션을 빼면 iCloud 키체인 동기화로 1회용 refresh 토큰이 다른 기기에 복사되고, 두 기기가 같은 토큰을 써 서버가 탈취로 판정해 전량 폐기한다. 등록(`ensureAuth`)과 갱신(`refreshAuth`)은 앱 전체 single-flight이고, 토큰 변경은 `subscribeAuth`로 마운트된 모든 웹뷰 호스트에 `auth-token`으로 전파된다(분석 이벤트의 단일 sink와 반대). 웹뷰 URL의 `guestAuth=1`은 이 바이너리가 `auth-ready`에 답할 수 있다는 표시다.
- **경계 규칙**: UI 컴포넌트는 카메라/WebRTC SDK를 직접 import하지 않고 어댑터 계층을 통한다. 공부 상태 계산은 순수 TS로 두고 카메라/Vision/RTC 구현과 분리한다.

## 원격 웹뷰 화면

- `react-native-webview`로 `apps/web`을 로드하고, 모든 화면이 `extra.webBaseUrl`이 가리키는 원격 주소를 연다. 카메라 권한 문구는 `app.json`의 `ios.infoPlist.NSCameraUsageDescription` / `android.permissions`(`CAMERA`)에 유지한다(WebView 안 `getUserMedia`도 같은 네이티브 권한 필요). 마이크 권한은 추가하지 않는다(멀티룸 음성 송출 없음). Android는 `android.blockedPermissions`로 `RECORD_AUDIO`를 명시적으로 차단한다 — `expo-camera`가 plugin 없이도 넣기 때문이며, **이 항목을 지우지 말 것**(ADR 0004 "남는 위험").
- **Dev Client가 필요하고 Expo Go는 지원하지 않는다.** 커스텀 엔트리(`index.ts`)가 푸시 모듈을, 그 모듈이 `@react-native-firebase/*`를 정적 import하기 때문이다(Expo Go에 없는 네이티브 모듈). `app.json` `plugins`의 `expo-build-properties`·RNFB config plugin도 prebuild/Dev Client 빌드에서만 적용된다.

## 카메라 권한 (`expo-camera`, 권한 API만)

- `expo-camera`는 권한 조회·요청 목적으로만 들어 있다([ADR 0004](../../docs/adr/0004-expo-camera-for-permission-api-only.md)). **`CameraView`를 쓰지 말 것** — 카메라 스트림·Vision 추론은 `apps/web`의 WebView `getUserMedia` 소유다. 호출은 `lib/cameraPermission.ts` 어댑터 뒤에만 두고 화면·컴포넌트가 `expo-camera`를 직접 import하지 않는다.
- **`app.json`의 `plugins`에 `expo-camera`를 추가하지 말 것.** 단, plugin을 안 넣어도 Expo가 자동 적용해 영어 기본 `NSMicrophoneUsageDescription`(iOS)·`RECORD_AUDIO`(Android)가 들어간다 — Android는 `android.blockedPermissions`가 걷어내고, iOS 문구는 아직 남아 있다(별도 결정). `permissionCopy.test.ts`는 `android.permissions` 열거만 잠그므로 실제 바이너리 권한은 운영 AAB의 merged manifest로 확인한다.

## 네트워크 / ATS

운영 `extra.apiBaseUrl`은 `https://api.focusmakers.app`(원천은 `app.config.ts` production 분기), HTTPS 전용이라 ATS 예외가 없다. **iOS `NSAppTransportSecurity.NSAllowsArbitraryLoads`를 다시 넣지 말 것**(심사 소명 요구). `appTransportSecurity.test.ts`가 "https면 ATS 예외 없음"을 강제한다. Android 디버그 빌드는 RN 기본 debug manifest가 localhost 평문을 허용해 `adb reverse` + `http://localhost` dev 흐름이 그대로 동작한다.

## Firebase (Remote Config · FCM)

`@react-native-firebase/app`·`remote-config`·`messaging`. 도입·설계는 [BY-585](../../docs/superpowers/specs/2026-09-03-by-585-firebase-sdk-design.md), 버전 게이트·알림은 [BY-586](../../docs/superpowers/specs/2026-09-04-by-586-remote-config-version-push-service-design.md)과 [docs/releases.md](../../docs/releases.md).

- **설정 파일은 커밋하지 않는다.** `google-services.json`·`GoogleService-Info.plist`는 `apps/mobile/firebase/{dev,staging,prod}/`(gitignore)에 두고 `.env.local` 경로로 `app.config.ts`가 주입한다. 파일의 프로젝트·아이덴티티가 빌드와 다르면 `app.config.ts`가 throw한다(dev 빌드가 운영에 붙는 것을 막는다). 파일 형식은 경로 확장자가 아니라 변수(`GOOGLE_SERVICES_JSON`=JSON, `GOOGLE_SERVICES_PLIST`=plist)로 정한다. production 파일 누락만 EAS 빌더(`EAS_BUILD=true`)에서 끊는다 — eas-cli가 로컬에서도 설정을 평가하는데 secret file은 빌더에서만 풀리므로, 로컬에서 막으면 `eas build --profile production`이 시작조차 안 된다. `firebaseConfig.test.ts`가 고정한다.
- **iOS는 SPM + dynamic frameworks다.** `disableSPM`이나 `static`으로 되돌리지 말 것(중복 심볼로 깨진다). 예외로 `expo-build-properties`의 `forceStaticLinking`에 `react-native-fbsdk-next` 하나가 들어 있다 — **지우지 말 것.** 이 파드의 `RCTConvert` 카테고리가 React 코어를 링크 대상으로 선언하지 않아, 동적으로 묶으면 `Undefined symbols: _OBJC_CLASS_$_RCTConvert`로 iOS 빌드가 전부 깨진다. `metaSdkConfig.test.ts`가 이 값을 고정한다. **Firebase Analytics(GA4)는 링크한다** — FCM 콘솔의 오디언스·유저 속성 타겟팅이 이 데이터만 보기 때문이다. SDK는 `lib/firebaseAnalyticsSdk.ts`만 import하고 다른 코드는 `lib/firebaseAnalytics.ts`의 공개 함수만 본다(`metaAds`와 같은 경계, 어댑터 없으면 no-op). 이벤트의 원천은 여전히 웹 Amplitude이고, 웹이 브리지 `analytics-event`·`analytics-user-properties`로 사본을 보내면 네이티브는 형식만 검증해 SDK에 넘긴다(이름 화이트리스트 금지 — 목록은 웹 카탈로그가 소유). 형식 규칙은 `packages/types`의 `ANALYTICS_*` 상수가 원천이고 **문자열 값은 토큰만** 통과한다(자유 문자열이 Google로 나가면 안 된다 — Meta 경로와 같은 원칙). 유저 속성 키 화이트리스트는 웹이 갖고, `null`은 지움이다. GA user_id는 백엔드 userId다([ADR 0010](../../docs/adr/0010-native-firebase-analytics-for-push-targeting.md)). ⚠️ **릴리즈 게이트**: 앱스토어 개인정보 라벨과 `docs/privacy-policy-analytics-sync.md`를 갱신하기 전에는 이 코드가 든 빌드를 스토어에 내지 않는다. `package.json`에 `expo.autolinking.exclude`를 되살리지 말 것 — 이벤트가 조용히 사라진다. SDK의 자동 화면 보고(`screen_view`)는 `firebase.json`으로 껐다 — 웹뷰 셸이라 RN 화면 하나만 반복 보고돼 잡음뿐이다. `firebaseConfig.test.ts`가 둘 다 고정한다.
- **화면·컴포넌트는 `@react-native-firebase/*`를 직접 import하지 않는다.** `lib/remoteConfig.ts`·`lib/pushMessaging.ts` 어댑터만 거친다. **`messaging`은 pnpm patch가 걸려 있다**(iOS APNs 등록 후 `getToken` 실패 우회) — 올릴 때 패치가 깨지면 업스트림 수정 여부를 먼저 확인하고, `isDeviceRegisteredForRemoteMessages` 대신 APNs 토큰 유무로 판단한다.
- **강제 업데이트는 네이티브가 판정한다.** `lib/forceUpdate.ts`가 Remote Config `min_supported_version`을 앱 버전과 비교한다. 기본값은 `UPDATE_CONFIG_DEFAULTS` 한 곳에서 한 번의 `setDefaults`로 등록한다(다른 곳에서 또 부르면 서로 지운다). 권장 업데이트는 `recommendedUpdateAlert.ts`가 최신 버전당 한 번 띄운다.
- **푸시 백그라운드 핸들러는 `index.ts`(커스텀 엔트리)에 있어야 Android headless에서 불린다.** `package.json` `main`을 `expo-router/entry`로 되돌리지 말 것. 알림 권한은 운영 빌드에서도 묻는다 — 홈이 그려진 뒤 `ensurePushPermission`(`lib/pushBootstrap.ts`)이 ATT 프롬프트 다음, 권장 업데이트 알림창 앞에 부른다(iOS는 권한이 없으면 알림을 표시하지 않는다). `aps-environment`는 `development`로 두고(배포 export에서 Xcode가 바꾼다) Android `POST_NOTIFICATIONS`는 정식 권한 정책 전까지 선언하지 않는다.

## Meta 광고 SDK (`lib/metaAds.ts` · `lib/metaAdsSdk.ts`)

`react-native-fbsdk-next`·`expo-tracking-transparency`. 앱 설치 어트리뷰션과 앱 내 전환 이벤트(BY-644). 설계는 [BY-644](../../docs/superpowers/specs/2026-09-13-by-644-meta-sdk-install-attribution-design.md).

- **SDK는 `lib/metaAdsSdk.ts`만 import한다.** 루트 import가 네이티브 없이(jest) 로드 시점에 죽고, 이 통로는 `auth`·`nativeBridgeHandler`·`webBridge`가 끌어와 테스트 대부분이 지나간다. 다른 코드는 `lib/metaAds.ts`의 공개 함수만 본다. **그 파일 안에서도 맨 위 import가 아니라 `installMetaAdsSdk`의 앱 ID 확인 뒤에 `require`한다** — 루트를 불러오기만 해도 Android가 `FBAccessToken` 네이티브 모듈을 만들어, Meta env 없는 빌드(development·staging)가 시작 직후 `FacebookSdkNotInitializedException`으로 죽는다. `metaAdsSdk.test.ts`가 고정한다. `_layout` 테스트처럼 `app/_layout.tsx`를 렌더하는 테스트는 `lib/metaAdsSdk`를 mock한다(모듈 스코프 호출이라 factory 안에서 `jest.fn`을 만든다).
- **설정은 env 주입이다.** `META_APP_ID`·`META_CLIENT_TOKEN`이 둘 다 있을 때만 `app.config.ts`가 두 plugin과 `extra.metaAppId`를 넣는다. 둘 다 없으면 plugin도 런타임 동작(ATT 프롬프트·이벤트)도 없다. 하나만 있으면 throw, production은 EAS 빌더에서 누락도 throw — **다음 production 빌드 전에 EAS production environment에 두 값을 등록해야 한다.** `metaSdkConfig.test.ts`가 고정한다. `app.json`에 앱 ID를 직접 적지 말 것(공개 저장소).
- **ATT 문구는 `app.json`의 `ios.infoPlist.NSUserTrackingUsageDescription`이다.** 두 plugin 모두 옵션(`iosUserTrackingPermission`·`userTrackingPermission`)을 주지 말 것 — 영어 기본값이나 다른 문구로 덮인다. `permissionCopy.test.ts`가 고정한다. Android `AD_ID` 권한은 tracking-transparency plugin이 매니페스트에 넣는다 — `app.json` 권한 열거에는 없지만 산출물에는 있다(권한 드리프트 점검 시 참고).
- **초기화 순서**: 모듈 스코프 `installMetaAdsSdk()` → 홈이 그려진 뒤 `initMetaAds()`(ATT 프롬프트) → 알림 권한 요청 → 그 뒤 권장 업데이트 알림창. **ATT는 앱이 active일 때만 뜬다.** 그 전에 요청하면 창 없이 "미결정"이 돌아오므로, 어댑터가 active를 기다렸다 묻고 미결정이면 다시 묻는다. **이 대기·재시도를 지우지 말 것**(프롬프트가 뜨지 않는 빌드는 App Store 심사에서 반려된다). `metaAdsSdk.test.ts`가 고정한다. 초기화 전 이벤트(첫 실행의 가입 완료)는 큐에 두었다가 ATT 응답을 SDK에 알린 뒤 흘린다. 이 순서를 바꾸면 iOS 광고 식별자 매칭이 빠지거나 OS 알림창이 겹친다.
- **전환 이벤트 정의는 웹이 소유한다**(`apps/web/src/lib/metaAppEvents.ts`). 네이티브는 브리지 `meta-app-event`의 이름·파라미터 **형식만** 검증해(`webBridge.ts`) SDK에 넘긴다 — 이름을 화이트리스트하지 말 것(전환 목록 변경에 앱 빌드가 필요해진다). 네이티브가 직접 찍는 것은 가입 완료(`auth.ts` `loadOrRegister`의 등록 응답 `isNew`) 하나다.
- `autoLogAppEventsEnabled`·`isAutoInitEnabled`를 끄지 말 것(설치 어트리뷰션의 근거 이벤트가 사라진다). 로그인·공유 기능은 쓰지 않는다 — plugin의 `scheme`·`displayName`은 필수값일 뿐이다.

## 에러 모니터링 (Sentry, `lib/sentry.ts`)

- **프로젝트는 `focusmakers-app`이다**(웹 `focusmakers-web`과 분리). **웹 DSN을 복사해 오지 말 것** — `sentryConfig.test.ts`가 프로젝트 ID를 못 박는다. **DSN은 `app.json`의 `extra.sentryDsn`에 둔다**(전송 여부는 런타임 `enabled: !__DEV__`가 가른다). 소스맵용 `SENTRY_AUTH_TOKEN`은 비밀이라 EAS Secret에 넣는다(커밋 금지).
- **Session Replay(`mobileReplayIntegration`)를 추가하지 말 것.** WebView 셸이라 마스킹된 사각형만 남고, 마스킹을 풀면 카메라 프리뷰가 녹화돼 개인정보 원칙과 충돌한다. `sendDefaultPii`는 `false`로 못 박았다. 성능 추적(`tracesSampleRate`)도 켜지 않는다(웹뷰 셸이라 잴 구간이 없고 화면 로딩은 웹이 본다).
- **웹과 달리 스크러빙 콜백이 없다** — 네이티브에는 `?userId=N`이 새는 경로가 없기 때문이다(근거는 [ADR 0008](../../docs/adr/0008-observability-identifier-scrubbing.md)). 네이티브 `fetch`는 `lib/auth.ts`(`POST /api/users`, `POST /api/auth/refresh`) 한 곳뿐이고 둘 다 쿼리스트링 없는 POST이고 토큰은 본문에 실린다. **쿼리스트링 붙은 요청을 추가하거나 URL을 로그에 남기면 이 전제가 깨지므로 웹과 같은 정제를 여기에도 넣는다.**
- **Android release는 R8로 난독화된다**(`expo-build-properties`의 `enableMinifyInReleaseBuilds`·`enableShrinkResourcesInReleaseBuilds`, Play 2027-02 최적화 요건). 매핑은 Sentry plugin의 `experimental_android.enableAndroidGradlePlugin`이 올린다 — **둘 중 하나만 끄지 말 것**(끄면 빌드는 성공하고 네이티브 스택만 `a.b.c`로 남는다). 옵션은 `experimental_android` 아래에 두어야 읽힌다. `sentryConfig.test.ts`가 짝을 잠근다.
- **`metro.config.js`를 `getDefaultConfig`로 되돌리지 말 것.** `getSentryExpoConfig`가 번들·소스맵에 같은 debug ID를 심는다. 되돌리면 스택트레이스만 압축된 채 남는다. 동작 확인은 EAS staging/production 빌드로만 된다.

## 웹뷰 배경

- **웹뷰에는 배경색을 항상 넘긴다.** `RemoteWebViewHost`가 스킴별 `colors.bg.base`를 WebView `style`에 싣는다. 색을 빼면 다크 모드에서 흰 줄과 탭 전환 번쩍임이 돌아온다.
- **iOS는 `patches/react-native-webview@13.16.1.patch`가 있어야 이 색이 WKWebView까지 닿는다.** 원인 실측은 [BY-623 설계 문서](../../docs/superpowers/specs/2026-09-06-by-623-webview-theme-background-design.md).
- **같은 패치가 iOS 앞으로가기 스와이프도 끈다.** `allowsBackForwardNavigationGestures`를 끄면 뒤로 스와이프 미리보기(스냅샷)까지 사라져서, 스위치는 켜 둔 채 앞으로가기 쪽 가장자리 인식기만 끈다([BY-775 설계 문서](../../docs/superpowers/specs/2026-09-29-by-775-disable-forward-swipe-design.md)). 라이브러리를 올릴 때는 두 수정을 따로 확인한다. 업스트림이 한쪽만 해결했으면 그 hunk와 `webviewPatch.test.ts`의 해당 단언만 지우고 패치 파일은 남긴다.
- 인스펙터 연결·브리지 개발 로그·색 실험 등 웹뷰 디버깅 절차는 [webview-debugging 런북](../../docs/runbooks/webview-debugging.md). 개발 빌드는 버려진 브리지 메시지와 나가는 메시지를 `[webview-bridge]` 접두사로 찍는다.

## 환경·주소·딥링크

`APP_VARIANT`(`production`/`staging`/`development`, 미설정은 development, 세 값 밖은 설정 평가 시 throw) 하나에서 주소·bundle id 접미사·표시명·Sentry environment·스킴·딥링크 호스트가 파생된다. 원천은 `app.config.ts`이고 근거는 [ADR 0007](../../docs/adr/0007-three-tier-environment-model-and-eas-profiles.md). 로컬 development 주소는 `.env.local`의 `WEB_BASE_URL`·`API_BASE_URL`이고(production·staging에서는 이 주입이 무시된다) Dev Client에서는 Metro만 재시작하면 반영된다. 실기기에서 화면을 여는 절차는 [device-web-dev-server 런북](../../docs/runbooks/device-web-dev-server.md).

- **딥링크 선언 원천도 같은 변형 표다.** `app.config.ts`가 `scheme`·`ios.associatedDomains`·`android.intentFilters`를 만들고 `app.json`에는 이 세 키가 없다. 스킴·호스트를 코드에 다시 적지 말 것. `expo-dev-client`가 넣는 `exp+mobile` 스킴은 development variant에만 남긴다(릴리즈 빌드에 있으면 Metro QR이 STG를 연다). `deepLinkDomains.test.ts`가 고정한다.

## 네이티브 사용자 이벤트 → 웹 Amplitude (`lib/nativeAnalytics.ts`)

분석의 원천은 웹 Amplitude다(앱의 Firebase Analytics는 그 사본을 받을 뿐이다). 네이티브에서만 일어나는 사용자 이벤트는 `trackNativeEvent`로 기록하고 웹뷰 호스트가 브리지로 웹 Amplitude에 넘긴다. 카탈로그는 `NativeAnalyticsEventMap` 한 곳이고 속성은 원시값만(식별자·초대코드·자유 문자열 금지).

- **전달 대상(sink)은 항상 하나다.** 탭 4개 웹뷰가 동시에 마운트돼 있어, `RemoteWebViewHost`는 `focused`이면서 웹이 `analytics-ready`를 보낸 문서일 때만 sink로 붙는다. sink가 없는 동안은 큐에 보관(최대 100건)했다가 다음 sink에 순서대로 흘린다.
- **`analytics-ready`는 handshake다.** 호스트는 재시도·사망 복구 진입에서 준비 상태를 되돌리고 `onLoadEnd`에서는 되돌리지 않는다. 한 사건을 두 발신부에서 찍지 않는다. 목록·규칙은 [native-analytics 설계 문서](../../docs/superpowers/specs/2026-09-04-native-analytics-bridge-design.md).

## 화면 방향 — 룸만 회전

**싱글룸(`room/[id]`)과 소셜룸(웹 브리지 `set-orientation`)만 회전하고 나머지는 세로다.** 정책은 세 곳이 함께 만들고 한쪽만 보고 고치면 티 나지 않게 깨진다. 정정·재정정 경위는 `lib/orientation.ts` 주석과 [SCR-S3-5](../../docs/screens/SCR-S3-5-S3-6-session-landscape.md).

| 위치                                            | 값                                        | 역할                            |
| ----------------------------------------------- | ----------------------------------------- | ------------------------------- |
| `app.json`의 `orientation`                      | `"default"`                               | 네이티브가 허용하는 방향의 상한 |
| `lib/orientation.ts`(`expo-screen-orientation`) | 루트 세로 잠금 / 룸에서 해제              | iOS의 단일 집행자               |
| `app/_layout.tsx`의 `screenOptions`             | Android에서만 `portrait` / 세션 `default` | Android 집행                    |

- **`app.json`을 `"portrait"`로 되돌리지 말 것**(상한을 세로로 닫아 세션이 회전하지 않게 된다). **rn-screens `orientation` 옵션은 Android에서만 싣는다** — iOS에 되살리면 `expo-screen-orientation`이 rn-screens에 양보해 세로 잠금이 통째로 죽는다. 세션 해제는 `ALL`이 아니라 `DEFAULT`로 둔다(iOS에서 `ALL`은 거꾸로 세로까지 포함). `expo-screen-orientation`은 네이티브 모듈이라 Dev Client 리빌드가 필요하고, 세션 외 화면에 가로 레이아웃을 만들기 전에는 이 정책을 풀지 말 것.

## 개인정보 원칙 (변경 불가, WebView·네이티브 공통)

- 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말 내부에서만 처리. 서버 전송·저장·로그 금지. 서버에는 비공부 상태 이벤트(`StudyEventStatus`)와 세션 집계만 전송. 용어는 [docs/domain-glossary.md](../../docs/domain-glossary.md).
- 싱글룸 타임랩스 사진과 그 사진으로 만든 공유용 영상만 [ADR 0013](../../docs/adr/0013-timelapse-photo-storage-exception.md)의 조건으로 기기 IndexedDB에 보관하고 서버로 보내지 않는다. 웹이 넘긴 타임랩스 영상은 저장·공유할 때 [ADR 0014](../../docs/adr/0014-webview-video-transfer-to-native.md)의 조건으로 앱 캐시에 사본이 생기고 서버로 보내지 않는다. 저장 사본은 바로 지워지고 공유 사본은 다음 앱 시작이나 다음 전달 때까지 남는다.
- 싱글룸은 영상 자체가 어디에도 전송되지 않는다. 멀티룸은 카메라 영상이 WebRTC P2P로 상대 참여자에게 전송된다(서버 미경유, 녹화·저장 안 함). "영상이 서버로 전송되지 않는다"고 쓰지 말 것. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것.

## 그 밖

- **Expo SDK 57 고정이다(의도적).** 다음 업그레이드는 Jira 티켓으로 범위를 정한 뒤에만 하고, 낡아 보인다는 이유로 제안하거나 실행하지 말 것. 참조 문서는 https://docs.expo.dev/versions/v57.0.0/.
- **App Store 제품 페이지 언어는 바이너리 Info.plist의 `CFBundleLocalizations`·`CFBundleDevelopmentRegion`에서 정해진다.** `app.json` `ios.infoPlist`에 `CFBundleDevelopmentRegion: "ko"`·`CFBundleLocalizations: ["ko"]`·`CFBundleAllowMixedLocalizations: true`를 둔다. 영어 문구를 넣기 전에는 `en`을 추가하지 말 것(스토어에 지원 언어로 표시). `appStoreLocalization.test.ts`가 고정한다.
- 네이티브 전환 시 할 일은 [ADR 0003의 전환 체크리스트](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때)를 따르고, `platform/*`의 mock을 실제 라이브러리로 바꾸기 전에 전환 트리거를 확인할 것.

## 명령·컨벤션

```bash
pnpm --filter mobile start      # expo start
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

- 스타일은 NativeWind(Tailwind 클래스, `className`) 우선. `StyleSheet.create`는 NativeWind로 어려운 경우에만.
- 새 화면은 `app/` 구조로 라우팅되므로 화면 단위 로직은 라우트 파일 옆에 co-locate 하고, 재사용 로직은 `features/`·`packages/*`로 올린다.
