# BY-586 앱 버전 관리(Remote Config)·알림 서비스 초기 세팅 설계

- 대상: `apps/mobile`(+ 웹 `features/force-update` 한 줄)
- 관련 티켓: BY-586 (선행 BY-585, 대체 BY-535·BY-536·BY-579, 관련 BY-532·534·537)
- 작성일: 2026-09-04

## 배경

BY-585로 Firebase SDK와 어댑터(`lib/remoteConfig.ts`·`lib/pushMessaging.ts`)가 들어왔다. 이 티켓은 그 위에 (A) 최소 지원 버전을 Remote Config로 관리하는 네이티브 강제 업데이트 게이트와 (B) 푸시 알림 서비스 계층을 세운다. 강제 업데이트 모달은 웹에 이미 있지만(BY-534·537) 그 웹 게이트는 **Remote Config 이전 바이너리 전용**으로 남기고, 새 바이너리는 웹뷰를 띄우기 전에 네이티브가 판단한다.

## A. 앱 버전 관리 — 이번 커밋에 구현

### Remote Config 키

- `min_supported_version` (string, `x.y.z`). dev·prod 프로젝트 모두 클라이언트 템플릿에 만들고 게시한다. 앱 기본값 `"1.0.0"`.
- `force_update_title` / `force_update_message` / `force_update_button` (string, 선택). 알림창 문구. 키가 없거나 비어 있으면 앱 기본 문구(BY-533 카피). 세 키의 기본값은 `min_supported_version`과 한 번의 `setDefaults`로 함께 등록한다(`UPDATE_CONFIG_DEFAULTS`).

### `lib/forceUpdate.ts`

- `compareVersions`·`shouldForceUpdate`: 웹 `version.ts`와 같은 규칙(세그먼트 숫자 비교, `x.y.z` 아니면 통과). 코드는 각자 둔다(공유 패키지 없음).
- `resolveForceUpdate()`: 기본값 등록 → `activate`(1초 제한) → 값 읽기 → `nativeApplicationVersion`과 비교. 어떤 실패도 throw하지 않고 통과(fail-open). 판정 후 `fetch`를 백그라운드로 걸어 다음 실행에 반영한다.

### `app/_layout.tsx` 게이트

- 상태 `pending | pass | forced`. 폰트 로드와 판정이 모두 끝나야 스플래시를 걷고 그린다 — 웹뷰가 잠깐 떴다가 안내로 바뀌는 깜빡임을 막는다. `forced`면 라우터 스택 대신 빈 배경(`Pressable`)만 그리고 `forceUpdateAlert.start()`로 OS 알림창을 띄운다. 배경 탭은 `reshow()` — 배경을 탭할 수 있다는 것 자체가 알림창이 없다는 뜻이다.

### `lib/forceUpdateAlert.ts`

- OS 기본 알림창(`Alert.alert`). 문구는 띄울 때마다 `lib/forceUpdateCopy.ts`가 Remote Config에서 읽고, 없으면 BY-533 확정 카피(웹 `copy.ts`와 동일: "업데이트가 필요해요" / "원활한 이용을 위해 최신 버전으로 업데이트 해주세요." / "지금 업데이트"). 버튼 하나, `cancelable: false`. 확인 시 `lib/storeLink.ts`의 `openAppStore()`가 `itms-apps://`·`market://` 스킴으로 스토어를 열고 실패 시 https로 폴백한다. ID는 웹 `storeLink.ts`와 같다.
- 알림창은 버튼을 누르면 닫히므로 재표시가 곧 차단이다: 스토어 복귀(`AppState` active)에서 다시 띄우고, 스토어가 안 열려 앱이 활성이면 0.5초 뒤 다시 띄운다. iOS는 겹쳐 쌓이므로 떠 있다고 아는 동안 건너뛰고, Android는 새 창이 기존 창을 대체하므로 복귀마다 다시 띄운다(액티비티 재생성으로 창만 사라진 경우 복구).
- 처음엔 전체 화면 컴포넌트(`components/ForceUpdateScreen.tsx`)로 만들어 실기기 검증까지 했으나, 디자인 시안 없이 가기로 해 OS 알림창으로 바꿨다(2026-09-04). 시안이 나오면 배경 `Pressable` 자리에 화면을 넣고 `forceUpdateAlert` 호출을 빼면 된다.

### 웹 게이트 분리

- `lib/remoteQueryParams.ts`에 `nativeUpdateGate=1`을 붙인다(`share`·`cameraGate`와 같은 capability 표시). 웹 `useForceUpdateGate`는 이 표시가 있으면 판정하지 않는다. 웹 상수 `MIN_SUPPORTED_VERSION`은 표시가 없는 구버전 바이너리 전용이 된다.

### 문서

- `docs/releases.md`에 최소 지원 버전 정책 문단(원천·반영 시점·fail-open·올리는 절차·구버전 바이너리 처리).

## B. 알림 서비스 — 구현 (2026-09-04)

목표는 "알림에 필요한 코드를 갖춰 두고 필요할 때 쓴다"다. 표시·저장·서버 등록 같은 정책성 동작은 넣지 않았다.

### `lib/pushMessaging.ts` (어댑터 확장)

- `PushMessage`(messageId·data(문자열 값만)·notification(title/body))로 RNFB `RemoteMessage`를 좁혀 내보낸다.
- `onPushMessage`(포그라운드)·`onPushNotificationOpened`(백그라운드 탭)·`getInitialPushNotification`(종료 상태 탭)·`setPushBackgroundHandler`(백그라운드·종료 수신).

### `lib/pushNotificationRouting.ts`

- data `link` → expo-router 경로. 허용: 앱 스킴(`focusmakers://`, `focuson://`), 딥링크 등록 https 호스트(`web.focusmakers.app`·`web.sunqstudio.kr`), 앱 내 경로(`/...`). 그 외·없음은 홈 `/`. 실제 딥링크와 같은 라우트(`app/social/join.tsx`)로 합류한다. `link` 키 이름은 BE 알림 API 확정 시 맞춘다.

### `lib/pushBootstrap.ts` + `app/_layout.tsx`

- `startPushMessaging({ navigate })`: 포그라운드 수신 로그(표시 안 함), 알림 탭·초기 알림 → `router.push(경로)`, 토큰 갱신 로그. 해제 함수 반환. 어떤 실패도 throw하지 않는다.
- **권한 요청은 개발 빌드(`__DEV__`)에서만** 부팅 시 한다 — 권한 없이는 iOS가 알림을 앱에 전달하지 않아 검증이 불가능해서다(2026-09-04 결정). 운영 빌드는 어떤 화면에서도 요청하지 않는다.
- `lib/firebaseSmoke.ts`는 삭제했다. 개발 로그는 `[push] permission=… token=…`로 대체.

### `index.ts` (커스텀 엔트리) + `lib/pushBackground.ts`

- `package.json` `main`을 `index.ts`로 바꾸고 `expo-router/entry` 뒤에 백그라운드 핸들러를 건다. Android는 앱 종료 상태에서 headless로 이 파일만 실행하므로 React 트리 안에서는 절대 불리지 않는다. 핸들러는 로그만.
- Android 알림 채널은 만들지 않았다. `notification` 페이로드는 FCM SDK가 기본 채널("기타")로 표시하고, 전용 채널은 알림 정책이 정해질 때 `expo-notifications`나 notifee로 추가한다(RNFB messaging만으로는 채널을 만들 수 없다).

### Android `POST_NOTIFICATIONS`

- Android 13+ 검증을 위해 `app.json` `android.permissions`에 임시로 선언했다(별도 커밋). **브랜치를 push하기 전에 그 커밋을 되돌린다**(2026-09-04 결정). 권한 정책이 정해지면 그때 정식으로 넣는다.

## 확정한 결정

- 판정 주체는 네이티브. 웹 게이트는 삭제하지 않고 구버전 전용으로 유지한다(스토어에 구버전이 남아 있는 동안).
- 반영은 "다음 실행". 부팅을 네트워크에 묶지 않는다.
- 강제 업데이트 문구는 Remote Config 키 세 개로 뺀다(2026-09-04 사용자 결정 — 09-03의 "빼지 않는다"를 뒤집음). 앱 기본 문구는 바이너리에 남아 키가 없어도 동작한다.
- 안내 UI는 OS 기본 알림창이다(2026-09-04 사용자 결정, 디자인 시안 없이 진행). 레이아웃은 바이너리 고정이고 콘솔은 `min_supported_version` 값만 바꾼다.

## 테스트

- `lib/__tests__/forceUpdate.test.ts`: 비교 규칙, fail-open 케이스(값 없음·형식 이상·activate 시간 초과·실패), 백그라운드 fetch 호출.
- `lib/__tests__/storeLink.test.ts`: ID 일치, 스킴 → https 폴백, 실패 시 무throw.
- `lib/__tests__/forceUpdateCopy.test.ts`: 기본 문구·기본값 맵, 콘솔 값 사용, 빈 값·공백·throw 시 항목별 기본 문구.
- `lib/__tests__/forceUpdateAlert.test.ts`: 기본 문구·버튼 하나·cancelable false, 콘솔 문구 사용·재표시 때 재읽기, 겹침 방지, 스토어 복귀 재표시, 스토어 실패 시 지연 재표시, iOS/Android 복귀 규칙, 배경 탭 재표시, 해제.
- `__tests__/root-layout-font-gate.test.tsx`: 판정 전 미렌더, forced 시 배경만 렌더·알림창 시작·배경 탭 재표시·언마운트 해제, pass·reject 시 통과.
- `lib/__tests__/remoteQueryParams.test.ts`: `nativeUpdateGate=1`. 웹 `useForceUpdateGate.test.tsx`: 표시가 있으면 `forced=false`.
- `lib/__tests__/pushMessaging.test.ts`: `toPushMessage` 정규화, 포그라운드·탭 구독 변환·해제, 초기 알림, 백그라운드 핸들러 등록.
- `lib/__tests__/pushNotificationRouting.test.ts`: 허용 주소 3종 → 경로, 허용 밖 → null, `resolvePushRoute` 홈 폴백.
- `lib/__tests__/pushBootstrap.test.ts`: 구독·해제, 탭 라우팅, 포그라운드 미이동, 초기 알림, 해제 후 무시, 개발 빌드 한정 권한 요청, 실패 무throw.
- `lib/__tests__/pushBackground.test.ts`: 등록·핸들러 정상 종료, 등록 실패 무throw. `firebaseConfig.test.ts`: `main === "index.ts"`.
- `__tests__/root-layout-font-gate.test.tsx`: 마운트 시 `startPushMessaging`, 언마운트 시 해제.

## 실기기 검증 절차

1. dev 프로젝트 Remote Config에 `min_supported_version` = 설치된 앱 버전(1.0.2)보다 높은 값(예: `9.9.9`)을 넣고 게시한다.
2. 앱을 완전히 종료했다가 연다(백그라운드 fetch). 다시 종료했다가 열면 강제 업데이트 알림창이 뜬다.
3. "지금 업데이트"로 스토어 앱이 열리고, 앱으로 돌아오면 알림창이 다시 떠 있는지 확인한다.
   3-1. 문구: dev에 `force_update_title`을 만들어 아무 값이나 게시하고 두 번 재실행하면 제목이 바뀐다. 값을 비우고 게시하면 기본 문구로 돌아온다.
4. 값을 `1.0.0`으로 되돌리고 두 번 재실행하면 정상 진입한다.

## 실기기 검증 결과 (2026-09-04, dev 프로젝트)

- iOS(1.0.2, build 2)·Android(1.0.2, versionCode 6) 개발 빌드 모두: `min_supported_version=9.9.9` 게시 → 두 번째 실행에서 `forced=true`와 OS 알림창, "지금 업데이트"로 스토어 이동, `1.0.0` 복귀 시 통과.
- 플랫폼 조건: iOS 앱 조건으로 다른 값(`1.0.1`)을 주자 iOS 로그에 그 값이 내려왔다. 코드 변경 없이 동작.
- 문구 키: `force_update_title` 등을 게시하자 알림창 문구가 바뀌었고, 키가 없을 때는 기본 문구.
- 반영은 매번 "다음 실행"이었다(게시 → 실행에서 fetch → 재실행에서 적용). 의도된 동작.
- 알림창 뒤에서도 스모크(Remote Config·APNs·FCM 토큰)는 정상.

## 알림 실기기 검증 절차

1. 개발 빌드를 열면 권한 다이얼로그가 뜬다(개발 빌드 전용). 허용하면 로그 `[push] permission=granted token=…`.
2. Firebase 콘솔 → Messaging → 새 캠페인 → "테스트 메시지 전송"에 그 토큰을 넣는다.
3. 포그라운드: 로그 `[push] foreground message …`만 찍히고 알림은 안 뜬다.
4. 백그라운드(홈 버튼): OS 알림이 뜬다. 누르면 앱이 앞으로 오고 `[push] notification opened … → /`.
5. 종료 상태: 알림을 누르면 앱이 켜지고 같은 로그. 데이터에 `link=focusmakers://social/join?code=1234`를 넣으면 소셜 탭으로 간다.
6. Android 13+는 임시 `POST_NOTIFICATIONS` 커밋이 들어간 개발 빌드가 필요하다.

## 알림 실기기 검증 결과 (2026-09-04, dev 프로젝트, 콘솔 테스트 메시지)

- iOS(1.0.2, build 2): 개발 빌드 권한 다이얼로그 → 허용 → 토큰 로그. 포그라운드 수신은 로그만(알림 미표시). 백그라운드에서 OS 알림 표시 → 탭 → `notification opened → /`. 종료 상태에서 탭 → 앱 기동 + 같은 로그.
- Android(1.0.2, versionCode 7, 임시 `POST_NOTIFICATIONS` 포함 빌드): 권한 허용 → 토큰. 포그라운드 로그만. 백그라운드·종료 상태에서 `index.ts`의 백그라운드 핸들러가 headless로 불리고(`background message` 로그) OS 알림 표시 → 탭 → `notification opened → /`.
- `data.link` 딥링크 이동은 실기기 검증을 생략했다(2026-09-04 결정 — 당장 쓸 알림이 없음). 변환 규칙은 `pushNotificationRouting.test.ts`가 고정한다.
- 검증 후 `POST_NOTIFICATIONS` 임시 커밋(dcdc37c)은 revert했다. Android 13+에서 다시 검증하려면 그 revert를 되돌린 개발 빌드가 필요하다.
- Metro 세션이 끊기면 Dev Client가 "Error loading app"을 띄운다 — 알림 문제가 아니라 번들 서버 문제였다(재시작으로 해결).

## 범위 밖

- 토큰 서버 등록 API·FE 연동(BE 티켓 생성 후), 운영 빌드 권한 요청 시점·설정 토글·알림 콘텐츠·Android 전용 채널(정책 미정), 웹 강제 업데이트 로직 제거, U2 공지 배너(BY-376·377), 권장 업데이트(별도 티켓, stash), 기능 플래그·실시간 Remote Config(별도 티켓).
