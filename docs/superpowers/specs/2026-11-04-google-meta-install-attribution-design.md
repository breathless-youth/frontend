# 구글·메타 광고 유입 경로를 서버와 Amplitude에 남기는 설계

- 대상: `apps/web`, `apps/mobile`, `packages/types`, 백엔드 요청 사항, 광고 콘솔 설정
- 관련 티켓: BY-1065(상위), BY-1066(BE 완료), BY-1067(광고 설정), BY-1068(FE 검토 중), BY-1016(메타 순공 5분)
- 기준 코드: `origin/dev` `b1c554b2` (2026-11-04)
- 작성일: 2026-11-04

## 왜 하는가

- 플래너 광고, 그룹 기능 광고처럼 소재가 다른 광고를 돌리고 있고, 소재마다 들어온 사람이 실제로 남는지 알고 싶다.
- 팀이 보는 지표는 두 가지로, 한 세션에서 순공 1분을 달성했는지와 한 주에 3일 이상 공부하는 "남는 사용자"가 됐는지다.
- 광고 관리자 화면은 광고별 합계만 보여 줘서 "플래너 광고로 온 사람들이 2주 뒤에도 공부하는가" 같은 질문에 답하지 못한다.
- 그래서 사람마다 "어느 광고로 들어왔는지" 꼬리표가 서버 DB와 Amplitude 양쪽에 남아야 한다.
- 메타 광고는 BY-1065로 앱 수집과 Amplitude 기록까지 출시됐지만, 웹이 서버로 보내는 연결이 빠져 있어 서버 DB에는 쌓이지 않는다.
- 구글 앱 설치 광고도 iOS와 Android에서 이미 집행 중이라 같은 통로에 구글을 더한다.

## 목표

- 메타 광고로 들어온 사람의 첫 유입 경로가 서버 DB에 저장된다.
- 메타 Android 유입은 캠페인·광고 세트·광고 ID까지, 메타 iOS 유입은 추적을 허용한 사람에 한해 광고 번호까지 남는다.
- 구글 광고로 들어온 Android 사용자는 서버 DB와 Amplitude에 "구글 광고"로 분류되고 광고 그룹 번호가 붙는다.
- Amplitude의 유입 경로 사용자 속성은 서버 응답을 기준으로 남는다.
- 구글 애즈 화면에서 광고 그룹별 설치 수와 순공 1분 달성 수가 iOS·Android 합계로 보인다.

## 하지 않는 것

- 구글 광고로 들어온 iOS 사용자에게 사람별 꼬리표를 붙이지 않는다 (구글은 iOS에서 광고 식별자를 쓰지 않고 추정치로 집계한다).
- iOS에서 추적을 허용하지 않은 사람의 메타 광고별 유입은 남기지 않는다.
- MMP(Airbridge·AppsFlyer 등)를 도입하지 않는다.
- GA4 기록을 BigQuery로 내보내 서버가 가져가는 연결은 만들지 않는다 (구글 스파이크가 실패했을 때의 대안으로만 남긴다).
- 광고비를 Amplitude로 가져오지 않는다.
- 리텐션 차트는 만들지 않고, 분석할 데이터만 남긴다.

## 실패로 보는 것

이 기준을 어기면 기능이 동작해도 실패다.

- 메타 설치 정보 복호화 키가 앱, 웹, 로그, API 응답 어디에든 나타난다.
- 플레이 설치 정보 원문이나 `gclid` 같은 클릭 식별자가 Amplitude나 GA4로 나간다.
- 사용자의 첫 유입 경로가 나중 요청으로 덮어써진다.
- 기존 초대코드 복원 흐름이 깨진다.
- 이미 켜 둔 메타 광고를 수정해야 하는 변경이 생겨 메타 학습이 처음부터 다시 시작된다.

## 지금 상태

### 앱

- `lib/installAttribution.ts`가 설치당 한 번 Android 플레이 설치 정보 원문과 메타 지연 딥링크의 `fm_ad` 값을 읽는다.
- iOS는 추적 허용 응답을 메타 SDK에 알린 뒤에 지연 딥링크를 묻는다.
- 읽은 값은 SecureStore에 보관했다가 준비된 웹뷰에 브리지 `install-attribution`으로 넘긴다.
- 웹이 `install-attribution-received`로 답하면 앱은 보관을 끝낸다.
- 광고 번호는 `INSTALL_AD_LABEL_PATTERN`(`^(ios|aos)_v\d{1,2}$`)에 맞는 값만 넘긴다.

### 웹

- `lib/installAttribution.ts`의 `installAttributionProperties`가 원문을 직접 해석해 Amplitude 사용자 속성 `install_source`, `install_ad`, `install_utm_*`를 `setOnce`로 남긴다.
- 원문은 localStorage `focusmakers:install-attribution`에 보관만 하고 서버로 보내지 않는다.
- 웹 해석에는 구글 분류가 없어서, 구글 광고 설치는 `other_link`나 `unknown`으로 남는다.

### 서버

- `POST /api/users/me/acquisition`이 dev Swagger(2026-11-03 스냅샷)에 올라가 있다.
- 요청은 `platform`(`IOS`·`ANDROID`), `installReferrer`, `deepLinkAd`, `capturedAt`(오프셋 포함 ISO-8601)이다.
- 응답은 `source`(`META_AD`·`INVITE`·`ORGANIC`·`OTHER_LINK`·`UNKNOWN`), `metaAd`, `inviteCode`, `firstTouchAt`이다.
- 사용자마다 처음 저장한 값만 남고, 같은 요청을 다시 보내도 처음 값을 돌려준다.
- 메타 암호문을 풀지 못해도 원문을 저장하고 200으로 답한다.
- 400은 다시 보내도 같은 결과라 재시도할 필요가 없다.

### 분석 도구

- 앱에 `@react-native-firebase/analytics` 26.3.3이 들어 있고, Amplitude 이벤트가 destination 플러그인을 거쳐 GA4 앱 스트림으로 복사된다 (ADR 0010).
- GA4에도 Amplitude와 같은 `user_id`가 붙는다.
- 메타로는 한 세션 순공이 300초에 닿는 순간 `fb_mobile_achievement_unlocked`가 기기당 한 번 나간다 (BY-1016).
- 이 순공 5분 이벤트는 Amplitude와 GA4에는 없다.

### 광고 설정

- 메타 설치 정보 복호화 키는 운영 서버에 들어가 있다 (2026-11-04 사용자 확인, Jira BY-1067은 아직 `할 일`로 남아 있다).
- 메타와 구글 광고 모두 지금 집행 중이다 (2026-11-04 사용자 확인).
- 구글 광고가 이미 돌고 있어서, 광고 시작 뒤 설치한 Android 사용자의 플레이 설치 정보에는 `gclid`가 들어 있다.

## 확인한 외부 사실

- 구글 앱 설치 광고로 Android에 설치하면 플레이 설치 정보에 `gclid`가 들어온다 ([Google 문서](https://developers.google.com/app-conversion-tracking/api/privacy-compliant-guide)).
- 구글 애즈 API의 `click_view`는 앱 설치 캠페인의 `gclid`를 돌려주지 않아서, `gclid`로 광고 그룹 이름을 조회할 수 없다 ([ClickView](https://developers.google.com/google-ads/api/reference/rpc/v26/ClickView)).
- 구글 앱 설치 캠페인에도 딥링크를 넣을 수 있고, GA4 for Firebase SDK가 설치 후 첫 실행에서 그 딥링크를 받아 온다 ([딥링크 설정](https://support.google.com/google-ads/answer/10024200), [측정 SDK의 지연 딥링크](https://support.google.com/google-ads/answer/12373942)).
- Android에서는 받아 온 딥링크가 SharedPreferences `google.analytics.deferred.deeplink.prefs`의 `deeplink` 키에 저장된다고 알려져 있다 (Google 도움말과 외부 사례 기준이며 스파이크로 확인한다).
- iOS에서 이 지연 딥링크가 동작하는지는 확인하지 못했다.
- 구글은 iOS에서 광고 식별자를 쓰지 않고 전환을 추정해 집계한다.

## 설계

### 1. 웹이 보관한 원문을 서버로 보낸다 (메타·구글 공통)

- 웹은 토큰이 준비된 뒤 localStorage에 보관한 원문을 `POST /api/users/me/acquisition`으로 보낸다.
- `platform`은 대문자로, `capturedAtMs`는 ISO-8601 문자열 `capturedAt`으로 바꿔 보낸다.
- 200을 받으면 응답으로 Amplitude 사용자 속성을 남기고 보관한 원문을 지운다.
- 400을 받으면 다시 보내도 같은 결과라 보관한 원문을 지운다.
- 401, 5xx, 네트워크 실패면 원문을 남겨 두고 다음 실행에서 다시 보낸다.
- 앱 수정이 필요 없어서 웹 배포만으로 메타 DB 적재가 시작된다.
- 플레이는 설치 정보를 설치 후 90일 동안 보관하고 앱은 이미 원문을 웹에 넘기고 있어서, 이 배포 전에 설치한 Android 사용자도 다음 실행 때 서버에 저장된다.

### 2. Amplitude 유입 속성은 서버 응답을 기준으로 남긴다

- 사용자 속성 `install_source`는 서버 `source`를 소문자로 바꾼 값이다 (`meta_ad`, `google_ad`, `invite`, `organic`, `other_link`, `unknown`).
- `install_ad`는 메타 광고 번호(`metaAd.label`)나 구글 광고 그룹 번호(`googleAd.label`)다.
- 메타 Android 유입은 `install_meta_campaign_id`, `install_meta_adset_id`, `install_meta_ad_id`를 문자열로 남긴다 (18자리라 숫자로 다루면 값이 깨진다).
- 서버가 첫 값을 보장하므로 Amplitude에는 `set`으로 남긴다.
- `setOnce`를 쓰면 BY-1068 출시 뒤 웹이 직접 해석해 먼저 남긴 값(구글 설치라면 `other_link`)이 서버 값을 막는다.
- 웹이 원문을 직접 해석해 `install_source`를 정하던 부분은 지운다.
- 서버 응답에는 UTM이 없어서, `install_utm_source`·`install_utm_medium`·`install_utm_campaign`은 지금처럼 웹이 원문에서 토큰 형식 값만 꺼내 남긴다.
- 유입 속성은 GA4로 보내지 않는다 (`FIREBASE_USER_PROPERTY_KEYS`에 넣지 않는다).

### 3. 순공 1분 달성을 Amplitude와 GA4에도 보낸다

- 기준은 한 세션 순공 60초다.
- 처음에는 메타 이벤트와 같은 300초였는데, 2026-11-04 사용자 결정으로 메타 이벤트까지 함께 60초로 낮췄다.
- 메타 `fb_description`은 `focus_1min`으로 바꿔 이벤트 관리자에서 5분 기준 시절 이벤트와 구분한다.
- 메타의 기기당 한 번 표시 키는 이름을 그대로 둬서, 5분 기준으로 이미 보낸 기기가 1분 기준으로 다시 보내지 않는다.
- 메타 이벤트를 보내는 자리(`useStudyRoomSession`이 `trackMetaFocusMilestone`을 부르는 곳)에서 Amplitude 이벤트 `focus_milestone_reached`도 보낸다.
- 메타와 같은 조건으로 기기당 한 번만 보낸다.
- Amplitude 이벤트는 destination 플러그인을 거쳐 GA4로 자동 복사되므로, 구글 애즈 전환은 이 이벤트로 잡는다.
- BY-1016은 Amplitude에서 `study_session_ended`의 `focus_sec`으로 걸러 볼 수 있다며 Amplitude 이벤트를 두지 않았다.
- 이번에는 광고 화면 숫자와 Amplitude 숫자를 같은 기준으로 맞춰 보려고 같은 이벤트를 둔다.
- 세션을 끝내지 않고 앱을 꺼도 60초가 된 순간에 이미 나가 있다는 점도 `study_session_ended` 필터와 다르다.

### 4. 구글 광고 그룹 번호를 Android 앱이 읽는다

따로 스파이크 빌드를 만들지 않고 운영 앱 업데이트에 넣어 실제 광고 설치로 확인한다 (2026-11-04 사용자 결정).

- 읽기 모듈은 어떤 오류가 나도 `null`을 돌려주고, 앱 시작과 기존 유입 수집 흐름을 막지 않는다.
- `@react-native-firebase/analytics`가 쓰는 GA4 for Firebase SDK의 지연 딥링크를 켠다.
- 켜는 방법은 Google 도움말이 안내하는 AndroidManifest `meta-data`(`google_analytics_deferred_deep_link_enabled`)이며, config plugin으로 넣는다.
- SDK가 저장한 딥링크는 RN에서 읽을 API가 없어서, `modules/app-lock`과 같은 방식의 로컬 Expo 모듈로 SharedPreferences를 읽는다.
- 로컬 네이티브 모듈을 새로 두므로 ADR을 하나 추가한다 (ADR 0017과 같은 형식).
- 딥링크 형식은 메타와 같은 `focusmakers://?fm_ad=<라벨>`이고, 구글 라벨은 `g_`로 시작한다 (예: `g_planner`, `g_group`).
- 구글 라벨은 메타 패턴과 다른 별도 패턴으로 거른다.
- SDK는 첫 실행에서 딥링크를 비동기로 받아 오므로, 앱은 읽기를 몇 번 다시 시도한다.
- 브리지 `install-attribution`에 `googleDeepLinkAd: string | null` 필드를 더한다.
- 구버전 웹은 모르는 필드를 무시하고, 구버전 앱은 이 필드를 보내지 않으므로 웹은 없으면 `null`로 본다.
- iOS는 구현하지 않는다.
- 앱 코드라 iOS·Android 스토어 업데이트가 필요하다.

### 5. 백엔드에 요청할 것

FE 타입은 백엔드가 Swagger에 올린 뒤에 만든다. 아래는 제안이고 최종 모양은 백엔드가 정한다.

- `source`에 `GOOGLE_AD`를 더한다.
- 설치 정보에 `gclid`가 있으면 `GOOGLE_AD`로 분류한다.
- 요청에 구글 지연 딥링크 라벨 필드(제안 이름 `googleDeepLinkAd`, 64자 이하)를 더한다.
- 이 라벨이 있으면 `GOOGLE_AD`로 분류한다.
- 응답에 `googleAd: { label }`을 더하고, `GOOGLE_AD`가 아니면 `null`로 둔다.
- 판별 순서는 메타 암호문, 초대코드, 구글(`gclid` 또는 구글 라벨), 메타 딥링크 라벨, 오가닉, 그 밖의 링크 순으로 제안한다.
- `gclid`는 원문과 함께 서버에만 저장하고 응답에는 싣지 않는다.

### 6. iOS 구글 광고 측정

- Info.plist `SKAdNetworkItems`에 구글 식별자를 넣는다 (지금은 메타 식별자만 있다).
- 정확한 식별자 값과 Firebase iOS SDK가 SKAdNetwork 등록을 자동으로 하는지는 구현 전에 Google 문서로 확인한다.
- 4절과 같은 앱 빌드에 넣는다.

## 광고 콘솔 설정

이 절은 코드가 아니라 마케팅·개발 담당이 콘솔에서 하는 일이다.

### 구글 애즈

- 운영 Firebase 프로젝트(`focusmakers-prod`)의 GA4 속성이 구글 애즈 계정에 연결돼 있는지 확인하고, 없으면 연결한다.
- GA4에서 `focus_milestone_reached`를 주요 이벤트로 표시하고 구글 애즈 전환으로 가져온다.
- 이 전환을 입찰 최적화 목표로 쓸지는 마케팅 담당이 정하고, 정하기 전까지는 보조 전환으로 둔다.
- 소재마다 광고 그룹을 나눈다 (예: 플래너, 그룹 기능).
- 광고 그룹마다 `focusmakers://?fm_ad=g_<소재>` 딥링크를 넣는다.
- 지금 켜진 광고 그룹을 고치면 학습이 다시 시작될 수 있어서, 기존 광고 그룹에 딥링크를 넣을지 딥링크를 넣은 새 광고 그룹을 만들지는 마케팅 담당이 정한다.
- 지금 앱은 `focusmakers://?fm_ad=...`를 홈으로 열기 때문에, 앱 업데이트 전에 딥링크를 넣어도 사용자 화면에는 문제가 없다.

### 메타

- 복호화 키는 운영 서버에 들어가 있어서 추가로 할 일이 없다.
- BY-1067의 Jira 상태를 실제에 맞게 고친다.

## 배포 순서

1. 백엔드가 `GOOGLE_AD` 분류와 구글 라벨 필드를 Swagger에 올리고 운영에 배포한다.
2. 웹이 서버 전송, 서버 응답 기준 Amplitude 속성, `focus_milestone_reached`를 배포한다.
3. 2번이 나가면 메타 DB 적재가 시작되고, 구글 Android 설치는 `gclid`로 `GOOGLE_AD`까지 분류된다.
4. 개인정보처리방침과 스토어 라벨을 갱신하고, 구글 애즈 콘솔에서 GA4 연결과 `focus_milestone_reached` 전환을 설정한다.
5. 4절과 6절을 담은 앱 업데이트를 iOS·Android 스토어에 낸다.
6. 마케팅 담당이 구글 광고 그룹에 딥링크를 넣는다 (5번보다 먼저 넣어도 된다).
7. 업데이트된 앱을 실제 구글 광고로 설치해 서버 DB에 라벨이 남는지 확인한다.

2번은 1번이 운영에 나간 뒤에 낸다.
웹은 200을 받으면 원문을 지우고 Amplitude 속성을 한 번만 남기므로, 그 전에 서버가 구글을 분류할 수 있어야 한다.
서버가 나중에 다시 분류해도 웹이 다시 물어볼 API가 없어 Amplitude는 그 결과를 따라가지 못한다.
메타 복호화 키는 이미 운영 서버에 있어서 2번을 막지 않는다.

## 운영에서 확인하기: 구글 지연 딥링크 (Android)

- 따로 스파이크 빌드를 만들지 않고, 운영 앱 업데이트와 지금 돌고 있는 구글 광고로 확인한다 (2026-11-04 사용자 결정).
- 확인할 것은 GA4 for Firebase SDK가 광고 그룹의 딥링크를 받아 SharedPreferences에 저장하는지, 앱이 그 값을 첫 실행 몇 초 안에 읽는지다.
- 개발 빌드는 패키지가 `.dev`이고 Firebase도 `focusmakers-dev`라 광고 설치로 시험할 수 없다.
- 테스트 기기에서 앱을 지우고 구글 광고를 눌러 새로 설치한 뒤, 서버 DB에 `GOOGLE_AD`와 `g_` 라벨이 남는지 본다.
- 라벨이 남지 않으면 읽기 시점 문제인지 SDK가 값을 받지 못한 것인지 가릴 수 있게, 읽기 결과(성공, 빈 값, 오류)를 Amplitude나 Sentry에 남긴다.
- 끝까지 라벨을 받지 못하면 구글 Android는 `GOOGLE_AD` 분류까지만 남기고, 광고 그룹별 사람 단위 비교가 필요하면 GA4 BigQuery 내보내기를 다시 검토한다.
- 읽기 모듈은 실패해도 `null`만 돌려주므로 앱을 되돌릴 필요는 없다.

## 개인정보

- 개인정보처리방침의 Google LLC 위탁 업무에 "앱 설치 광고 성과 측정"을 더한다.
- 게시된 방침에 "서비스 유입 경로(광고·링크 등)" 수집 문구가 들어 있는지 확인한다 (BY-1066에서 남은 확인 항목이다).
- App Store 개인정보 라벨과 Play Console 데이터 보안에 구글 광고 측정 목적을 반영한다.
- ADR 0010의 릴리즈 게이트에 따라, GA4가 아직 구글 애즈에 연결돼 있지 않다면 방침과 라벨을 갱신한 뒤에 연결한다.
- 이미 연결돼 있다면 방침과 라벨을 바로 갱신한다.

## 검증

### 자동 테스트

- 웹 전송이 성공, 400, 401·5xx·네트워크 실패 각각에서 보관한 원문을 맞게 지우거나 남긴다.
- 서버 응답이 Amplitude 사용자 속성으로 바뀌는 규칙을 응답 종류마다 확인한다.
- `focus_milestone_reached`가 기기당 한 번만 나간다.
- 앱이 구글 딥링크에서 `g_` 라벨만 꺼내고 형식 밖 값은 버린다.
- 브리지 파서가 `googleDeepLinkAd`가 없거나 형식 밖이면 `null`로 본다.

### 실기기와 데이터 확인

- 메타 App Ads Helper 딥링크 테스트로 설치한 기기의 사용자 행이 서버 DB에 `META_AD`로 저장된다.
- 같은 사용자의 Amplitude 사용자 속성에 `install_source=meta_ad`와 광고 번호가 보인다.
- 구글 테스트 설치가 서버 DB에 `GOOGLE_AD`와 라벨로 저장된다.
- GA4 DebugView에 `focus_milestone_reached`가 들어오고, 구글 애즈 전환 상태가 "기록 중"으로 바뀐다.

## 만드는 사람이 정할 것

- 웹이 서버 전송을 시도하는 정확한 시점 (토큰 준비 직후, 홈 진입 뒤 등).
- 구글 라벨 정규식의 세부 모양 (`g_`로 시작한다는 것만 정했다).
- 구글 딥링크 읽기 재시도 횟수와 간격 (처음 값은 만드는 사람이 정하고, 운영 확인 결과로 고친다).
- 읽기 결과를 Amplitude와 Sentry 중 어디에 남길지.
- 로컬 Expo 모듈 이름과 API 모양.
- 서버 전송 실패를 Sentry나 Amplitude로 남길지 여부.
