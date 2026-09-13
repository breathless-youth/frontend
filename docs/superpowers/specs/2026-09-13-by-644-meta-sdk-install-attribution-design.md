# BY-644 Meta SDK 설치 및 앱 설치 어트리뷰션 설계

- 대상: `apps/mobile`, `apps/web`, `packages/types`
- 관련 티켓: BY-644 (브랜치 `feature/BY-644-meta-sdk-install-attribution`)
- 작성일: 2026-09-13

## 배경

Meta(Facebook·Instagram) 앱 설치 광고를 집행하려는데 설치와 앱 내 전환을 잴 SDK가 앱에 없다. 앱은 `apps/web`을 WebView로 여는 셸이라 "웹에 Meta Pixel을 심으면 되지 않나"가 먼저 떠오르지만, 그 경로로는 설치 전환이 잡히지 않는다.

- **설치 이벤트는 네이티브 SDK(또는 MMP)만 보낸다.** Meta의 앱 설치 어트리뷰션은 앱 첫 실행에서 SDK가 보내는 활성화 이벤트로 판정하고, 앱 홍보 캠페인 자체가 앱 대시보드 등록 + SDK/MMP의 설치 이벤트 수신을 전제로 한다.
- **클릭과 앱 실행이 이어지지 않는다.** 광고 클릭은 페이스북 앱에서 일어나 스토어를 거쳐 앱이 열린다. 웹뷰에는 `fbclid`도 브라우저 쿠키도 없어 Pixel 이벤트를 캠페인에 매칭할 근거가 없다.
- **iOS는 SKAdNetwork 기반이다.** ATT 이후 iOS 설치 측정은 SKAN 등록과 전환값 갱신으로 이뤄지고 이건 네이티브 API다. Meta SDK가 자동으로 처리한다.
- Meta 공식 문서도 웹뷰 내 Pixel은 어트리뷰션을 지원하지 않는다고 하고, 대신 "하이브리드 앱 이벤트"로 Pixel 이벤트를 네이티브 SDK에 넘기라고 안내한다 — 결국 네이티브 SDK가 필요하다.

전제와 제약:

- Expo SDK 54 고정, Dev Client(prebuild) 방식. 네이티브 모듈이 늘어나므로 **새 빌드가 필요하다**(OTA 불가). BY-622로 iOS 빌드 번호 5가 예정돼 있어 그 빌드에 같이 태우면 빌드 횟수를 아낀다.
- 화면·컴포넌트는 네이티브 모듈을 직접 import하지 않고 `lib/` 어댑터를 거친다(`apps/mobile/CLAUDE.md` 경계 규칙).
- 저장소가 public이고 Meta 앱은 dev/prod가 갈릴 수 있어 앱 ID·클라이언트 토큰은 Firebase 파일과 같은 방식으로 env 주입한다.
- `react-native-fbsdk-next` 13.4.3 기준: peer `expo >= 47`, iOS `FBSDKCoreKit ~> 18.0`(CocoaPods), Android `facebook-android-sdk 18.+`. config plugin이 Info.plist·AndroidManifest·strings.xml에 앱 ID·토큰·자동 로깅 플래그와 Meta SKAdNetwork 식별자 2개를 넣는다. plugin은 로그인용 `scheme`·`displayName`이 없으면 throw한다.
- `expo-tracking-transparency` 6.0.8(SDK 54 번들): iOS ATT 프롬프트 API. plugin이 Android `com.google.android.gms.permission.AD_ID`를 넣고, iOS `NSUserTrackingUsageDescription`은 `app.json`에 있으면 그대로 둔다.

## 결정: SDK는 네이티브에 한 번, 전환 정의는 웹이 소유

SDK 설치·초기화·ATT·설치 이벤트는 네이티브가 맡고(한 번 빌드), **앱 내 전환 이벤트의 정의는 웹이 소유**한다. 웹이 브리지 `meta-app-event`로 이름·파라미터를 보내면 네이티브는 형식만 검증해 SDK에 넘긴다 — `track-event`(네이티브 → 웹 Amplitude, BY-616)의 역방향이다. 전환 목록을 바꿀 때 앱을 다시 빌드하지 않기 위해서다.

대안 검토:

- **웹뷰 Pixel만**: 위 배경대로 설치 전환 불가. 채택하지 않는다.
- **MMP(Airbridge·AppsFlyer·Adjust)**: 마찬가지로 네이티브 SDK라 빌드는 똑같이 필요하다. Meta 외 채널 광고가 확정되면 그때 MMP로 갈아탄다 — 이 설계의 어댑터 경계(`lib/metaAds.ts`)가 그 교체 지점이다.
- **Conversions API(서버 전송)**: SDK 보완용이고 iOS SKAN을 대체하지 못한다. 범위 밖.
- **빌드 없는 대략치**: App Store Connect 앱 분석의 "앱 리퍼러: Facebook", Play Console UTM 획득 리포트. 캠페인 단위 분해·앱 내 전환·광고 최적화가 안 된다. 임시 지표로만 쓴다.

## 변경 1: 의존성

- `react-native-fbsdk-next@13.4.3` (정확한 버전 고정 — config plugin 옵션과 네이티브 SDK 버전이 함께 묶인다)
- `expo-tracking-transparency@~6.0.8`

둘 다 jest에서 루트 import가 죽는다(`FBAccessToken`이 로드 시점에 `NativeEventEmitter`를 만든다). 그래서 SDK import는 `lib/metaAdsSdk.ts` 한 파일에만 있고 나머지는 순수 모듈 `lib/metaAds.ts`를 본다(변경 3).

## 변경 2: 설정 주입 (`app.config.ts`·`app.json`)

- env `META_APP_ID`·`META_CLIENT_TOKEN` → `react-native-fbsdk-next` plugin 옵션 + `expo-tracking-transparency` plugin + `extra.metaAppId`. 둘 다 없으면 plugin을 넣지 않고 `extra.metaAppId`는 빈 문자열이다(Metro·광고 없는 개발 빌드는 그대로 돌아간다). 하나만 있으면 어느 변형이든 throw, 앱 ID가 숫자가 아니면 throw.
- **production만 EAS 빌더(`EAS_BUILD=true`)에서 누락을 끊는다** — 어트리뷰션 없는 운영 바이너리가 조용히 나가면 광고 집행 뒤에야 알게 된다. eas-cli의 로컬 평가는 통과시킨다(BY-620과 같은 이유).
- plugin 옵션: `appID`, `clientToken`, `displayName`(변형 표시명), `scheme: fb<앱 ID>`(plugin 필수값 — 로그인은 쓰지 않는다), `isAutoInitEnabled: true`(네이티브 auto-init — JS 초기화 전 이벤트도 SDK가 받는다), `autoLogAppEventsEnabled: true`(설치·실행·세션 길이 자동 로깅 — 설치 어트리뷰션의 근거), `advertiserIDCollectionEnabled: true`(Android GAID. iOS는 ATT 응답으로 런타임이 다시 정한다).
- `app.json` `ios.infoPlist.NSUserTrackingUsageDescription`에 한국어 ATT 문구를 둔다: "설치 경로와 광고 효과를 확인하는 데 사용해요. 카메라 영상이나 공부 기록은 광고에 쓰이지 않아요." 두 plugin 모두 옵션으로 덮어쓰지 않아 이 값이 그대로 실린다.
- `metaSdkConfig.test.ts`·`permissionCopy.test.ts`가 고정한다. `.env.local.example`에 두 env 항목을 추가했다.

빌드 산출물에 생기는 변화(실기기 검증 때 확인할 것): iOS Info.plist에 `FacebookAppID`·`FacebookClientToken`·`SKAdNetworkItems`·URL 스킴 `fb<앱 ID>`·`LSApplicationQueriesSchemes`(fbapi 등), Android 매니페스트에 `com.facebook.sdk.*` meta-data, `com.facebook.FacebookActivity`·`CustomTabActivity`, **권한 `AD_ID` 추가**(BY-643의 권한 드리프트 점검 항목에 넣는다 — `permissionCopy.test.ts`의 app.json 열거와는 별개다).

## 변경 3: 어댑터 (`lib/metaAds.ts` · `lib/metaAdsSdk.ts`)

`lib/metaAds.ts` — SDK를 import하지 않는 순수 모듈. `userApi`·`nativeBridgeHandler`·`webBridge`가 끌어와 테스트 대부분이 지나간다.

- `MetaAdsAdapter { initialize, requestTrackingPermission, setAdvertiserTrackingEnabled, logEvent }`, `setMetaAdsAdapter()`.
- `initMetaAds()`: 프로세스당 한 번 — `initialize` → ATT 요청 → 응답을 `setAdvertiserTrackingEnabled`에 전달 → 큐 flush. 이후 호출은 같은 프라미스. 어댑터가 없으면 즉시 끝난다. 실패해도 resolve하고 큐를 흘린다(SKAN 경로는 ATT와 무관).
- `logMetaAppEvent(name, params?, valueToSum?)`: 어댑터 없음 → 버림, 초기화 전 → 큐(최대 50건), 이후 → 즉시. iOS는 ATT 응답을 SDK에 알린 **뒤** 보낸 이벤트만 광고 식별자 매칭에 쓰이므로 큐가 필요하다 — 첫 실행의 가입 완료가 ATT 응답 전에 나온다.
- `logMetaRegistration()`: Meta 표준 이벤트 `fb_mobile_complete_registration`.
- `META_EVENT_NAME_PATTERN`(`^[A-Za-z][A-Za-z0-9_\- ]{0,39}$`)·`META_EVENT_MAX_PARAMS`(25): Meta 앱 이벤트 규칙. 브리지 파서가 쓴다.

`lib/metaAdsSdk.ts` — 실구현. `Settings.initializeSDK`, `requestTrackingPermissionsAsync`, iOS에서만 `Settings.setAdvertiserTrackingEnabled` + `setAdvertiserIDCollectionEnabled`(거부하면 수집도 끈다), `AppEventsLogger.logEvent`(인자 개수로 오버로드가 갈려 `undefined`를 넘기지 않는다). `installMetaAdsSdk()`는 `extra.metaAppId`가 있을 때만 어댑터를 붙인다.

## 변경 4: 부팅 배선 (`app/_layout.tsx`)

1. 모듈 스코프 `installMetaAdsSdk()` — `initSentry()` 옆. 첫 실행의 가입 완료(`ensureUserRegistered`, 마운트 effect)보다 먼저 통로가 있어야 큐에 들어간다.
2. 홈이 그려진 뒤(폰트·강제 업데이트 게이트 통과) `initMetaAds()` — 스플래시 위에서는 OS가 ATT 프롬프트를 띄우지 않고, 강제 업데이트로 막힌 실행에서는 물을 이유가 없다.
3. 권장 업데이트 알림창은 `initMetaAds()`가 끝난 뒤 띄운다 — 둘 다 OS 알림창이라 겹치면 나중 것이 묻힌다.

`root-layout-font-gate.test.tsx`가 세 순서를 고정한다.

## 변경 5: 전환 이벤트 — 브리지 `meta-app-event` (`packages/types`·`apps/web`·`apps/mobile`)

계약(`packages/types/src/bridge.ts`): 웹 → 네이티브 `{ type: "meta-app-event", name, params?, valueToSum?, atMs }`. `params` 값은 문자열·수만(boolean은 1/0). 네이티브 `parseToNativeMessage`는 이름이 형식에 어긋나면 통째로 버리고, 파라미터는 형식에 맞는 항목만 25개까지 남긴다. 이름은 화이트리스트하지 않는다. `nativeBridgeHandler`는 `logMetaAppEvent`로 넘기고 응답은 없다.

발신(`apps/web/src/lib/metaAppEvents.ts`) — Amplitude 이벤트와 같은 자리에서 같은 값으로 부르되 **의도적으로 부분집합**이다. Meta는 광고 최적화에 쓸 소수의 전환만 원하고, 여기 실린 것은 전부 Meta 서버로 나간다.

| 이벤트                            | 파라미터                              | 발신                                                           | Meta 용도                               |
| --------------------------------- | ------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| `fb_mobile_complete_registration` | —                                     | **네이티브** `lib/userApi.ts` — 서버 `isNew === true`일 때만   | 표준 이벤트 "가입 완료"                 |
| `fb_mobile_tutorial_completion`   | `fb_success: 1`                       | `OnboardingGuideFlow` `finish("completed")` — 건너뛰기 제외    | 표준 이벤트 "튜토리얼 완료"             |
| `study_session_started`           | `room_type`                           | `useStudyRoomSession` 마운트 — 복원 진입(`restored`)은 안 보냄 | 커스텀 전환 "첫 공부 시작"(핵심 활성화) |
| `study_session_ended`             | `room_type`, `study_sec`, `focus_sec` | `useStudyRoomSession` 세션당 한 번 가드 안                     | 커스텀 전환 "공부 완료"(값 필터 가능)   |
| `social_room_entered`             | —                                     | `LiveRoomEntry` 실제 입장 — 유예 재입장 제외                   | 커스텀 전환 "소셜룸 입장"               |

`valueToSum`은 계약만 열어 두고 쓰지 않는다. 식별자·초대코드·자유 문자열은 싣지 않는다(`track-event`와 같은 원칙).

## 변경 6: 가입 완료 (`lib/userApi.ts`)

`registerOnce`가 `isNew`를 읽어 SecureStore 저장까지 끝난 뒤 `logMetaRegistration()`을 부른다. 저장 전에 찍으면 저장 실패 → 다음 실행 재등록(`isNew=false`)에서 그 사용자의 가입 완료가 한 번도 안 남을 수 있다. `isNew`는 이제 소비자가 있다(2026-07-31 검토의 "소비자 없음"은 낡았다) — 온보딩 분기에는 여전히 쓰지 않는다.

## 코드 밖 절차

### Meta 앱·EAS 환경변수 (빌드 전 필수)

1. Meta for Developers에서 앱 생성(사업자 인증 불필요) → 앱 설정 > 기본 설정의 **앱 ID**, 고급 설정의 **클라이언트 토큰**. 플랫폼에 iOS(번들 ID `com.breathlessyouth.mobile`, App Store ID)와 Android(패키지 `com.breathlessyouth.mobile`, 키 해시)를 등록한다. 개발·staging 빌드는 Meta **테스트 앱**을 만들어 `.dev`·`.staging` 아이덴티티를 거기 등록한다.
2. `eas env:create --environment production --name META_APP_ID --value <앱 ID> --visibility sensitive`, 같은 방식으로 `META_CLIENT_TOKEN`. preview·development 환경은 테스트 앱 값(붙이지 않을 거면 비워 둔다 — 비어 있으면 SDK가 빌드에 들어가지 않는다).
3. ⚠️ **다음 production 빌드부터 두 env가 없으면 EAS 빌더에서 실패한다.** BY-622 iOS 빌드 5 전에 등록한다.
4. Events Manager에서 앱 이벤트 수신 확인 → App Ads Helper로 설치 이벤트 검증 → iOS SKAdNetwork 전환 스키마(가입 완료·첫 공부 시작)를 설정한다. SDK가 스키마에 따라 전환값을 자동 갱신한다.

### 스토어·개인정보

- App Store Connect 개인정보 라벨: "추적에 사용되는 데이터" 예(기기 ID·광고 데이터·사용 데이터). 심사 노트에 ATT 사유 문구를 적는다. 앱 자체 privacy manifest의 `NSPrivacyTracking` 선언 여부는 첫 빌드의 Xcode 경고로 확인한다(FBSDKCoreKit 18은 자체 manifest를 동봉한다).
- Play Console 데이터 보안: 광고 ID·기기 또는 기타 ID·앱 상호작용 수집, 광고 목적.
- 개인정보처리방침 「7. 처리 위탁」·「8. 국외 이전」에 Meta Platforms, Inc.를 추가한다 — [privacy-policy-analytics-sync.md](../../privacy-policy-analytics-sync.md) §2 갱신됨. 원본 → 사본 순서를 지킨다.

### 실기기 검증 (다음 빌드에서)

- iOS 첫 실행: 홈이 뜬 뒤 ATT 프롬프트 → 응답 뒤 Events Manager 테스트 이벤트에 `fb_mobile_activate_app`·`fb_mobile_complete_registration`이 이 순서로 들어온다.
- 온보딩 완료·첫 세션 시작·종료·소셜룸 입장이 각각 한 번씩 들어온다(재진입·복원·유예 재입장은 안 들어온다).
- Android AAB 매니페스트: `AD_ID` 권한과 `com.facebook.sdk.ApplicationId`가 있고 `RECORD_AUDIO`는 여전히 없다(BY-643 해독법).
- iOS `useFrameworks: dynamic` + FBSDKCoreKit(CocoaPods XCFramework) 조합의 빌드 성공 — 실패하면 `expo-build-properties`의 `ios.forceStaticLinking`에 FBSDK pod를 넣는 것이 첫 탈출구다.

## 하지 않는 것

- Facebook 로그인·공유 다이얼로그(plugin의 `scheme`은 필수값일 뿐, `LoginManager`·`ShareDialog`를 쓰지 않는다).
- 구매 이벤트·`valueToSum` 사용.
- Meta Pixel(웹) 도입 — 브라우저 단독 서비스에 광고를 붙일 때 별도 티켓.
- 개인정보 수집 거부(opt-out) 경로 — privacy 문서 §4의 기존 미해결 항목에 Meta도 얹힌다.
