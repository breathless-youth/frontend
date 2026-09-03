# BY-586 앱 버전 관리(Remote Config)·알림 서비스 초기 세팅 설계

- 대상: `apps/mobile`(+ 웹 `features/force-update` 한 줄)
- 관련 티켓: BY-586 (선행 BY-585, 대체 BY-535·BY-536·BY-579, 관련 BY-532·534·537)
- 작성일: 2026-09-04

## 배경

BY-585로 Firebase SDK와 어댑터(`lib/remoteConfig.ts`·`lib/pushMessaging.ts`)가 들어왔다. 이 티켓은 그 위에 (A) 최소 지원 버전을 Remote Config로 관리하는 네이티브 강제 업데이트 게이트와 (B) 푸시 알림 서비스 계층을 세운다. 강제 업데이트 모달은 웹에 이미 있지만(BY-534·537) 그 웹 게이트는 **Remote Config 이전 바이너리 전용**으로 남기고, 새 바이너리는 웹뷰를 띄우기 전에 네이티브가 판단한다.

## A. 앱 버전 관리 — 이번 커밋에 구현

### Remote Config 키

- `min_supported_version` (string, `x.y.z`). dev·prod 프로젝트 모두 클라이언트 템플릿에 만들고 게시한다. 앱 기본값 `"1.0.0"`.

### `lib/forceUpdate.ts`

- `compareVersions`·`shouldForceUpdate`: 웹 `version.ts`와 같은 규칙(세그먼트 숫자 비교, `x.y.z` 아니면 통과). 코드는 각자 둔다(공유 패키지 없음).
- `resolveForceUpdate()`: 기본값 등록 → `activate`(1초 제한) → 값 읽기 → `nativeApplicationVersion`과 비교. 어떤 실패도 throw하지 않고 통과(fail-open). 판정 후 `fetch`를 백그라운드로 걸어 다음 실행에 반영한다.

### `app/_layout.tsx` 게이트

- 상태 `pending | pass | forced`. 폰트 로드와 판정이 모두 끝나야 스플래시를 걷고 그린다 — 웹뷰가 잠깐 떴다가 안내로 바뀌는 깜빡임을 막는다. `forced`면 라우터 스택 대신 빈 배경(`Pressable`)만 그리고 `forceUpdateAlert.start()`로 OS 알림창을 띄운다. 배경 탭은 `reshow()` — 배경을 탭할 수 있다는 것 자체가 알림창이 없다는 뜻이다.

### `lib/forceUpdateAlert.ts`

- OS 기본 알림창(`Alert.alert`). BY-533 확정 카피(웹 `copy.ts`와 동일: "업데이트가 필요해요" / "원활한 이용을 위해 최신 버전으로 업데이트해 주세요." / "지금 업데이트"), 버튼 하나, `cancelable: false`. 확인 시 `lib/storeLink.ts`의 `openAppStore()`가 `itms-apps://`·`market://` 스킴으로 스토어를 열고 실패 시 https로 폴백한다. ID는 웹 `storeLink.ts`와 같다.
- 알림창은 버튼을 누르면 닫히므로 재표시가 곧 차단이다: 스토어 복귀(`AppState` active)에서 다시 띄우고, 스토어가 안 열려 앱이 활성이면 0.5초 뒤 다시 띄운다. iOS는 겹쳐 쌓이므로 떠 있다고 아는 동안 건너뛰고, Android는 새 창이 기존 창을 대체하므로 복귀마다 다시 띄운다(액티비티 재생성으로 창만 사라진 경우 복구).
- 처음엔 전체 화면 컴포넌트(`components/ForceUpdateScreen.tsx`)로 만들어 실기기 검증까지 했으나, 디자인 시안 없이 가기로 해 OS 알림창으로 바꿨다(2026-09-04). 시안이 나오면 배경 `Pressable` 자리에 화면을 넣고 `forceUpdateAlert` 호출을 빼면 된다.

### 웹 게이트 분리

- `lib/remoteQueryParams.ts`에 `nativeUpdateGate=1`을 붙인다(`share`·`cameraGate`와 같은 capability 표시). 웹 `useForceUpdateGate`는 이 표시가 있으면 판정하지 않는다. 웹 상수 `MIN_SUPPORTED_VERSION`은 표시가 없는 구버전 바이너리 전용이 된다.

### 문서

- `docs/releases.md`에 최소 지원 버전 정책 문단(원천·반영 시점·fail-open·올리는 절차·구버전 바이너리 처리).

## B. 알림 서비스 — 다음 커밋

- `lib/pushMessaging.ts`에 포그라운드 수신·알림 탭(`onNotificationOpenedApp`·`getInitialNotification`) → 딥링크 라우팅, 커스텀 엔트리 `index.ts`의 백그라운드 핸들러, Android 기본 채널. 권한 요청은 화면에 연결하지 않고, 포그라운드 수신은 표시하지 않으며, 토큰은 로그까지만(정책 미정·BE API 없음).
- `lib/firebaseSmoke.ts` 삭제.

## 확정한 결정

- 판정 주체는 네이티브. 웹 게이트는 삭제하지 않고 구버전 전용으로 유지한다(스토어에 구버전이 남아 있는 동안).
- 반영은 "다음 실행". 부팅을 네트워크에 묶지 않는다.
- 강제 업데이트 문구는 Remote Config로 빼지 않는다(2026-09-03 사용자 결정).
- 안내 UI는 OS 기본 알림창이다(2026-09-04 사용자 결정, 디자인 시안 없이 진행). 레이아웃은 바이너리 고정이고 콘솔은 `min_supported_version` 값만 바꾼다.

## 테스트

- `lib/__tests__/forceUpdate.test.ts`: 비교 규칙, fail-open 케이스(값 없음·형식 이상·activate 시간 초과·실패), 백그라운드 fetch 호출.
- `lib/__tests__/storeLink.test.ts`: ID 일치, 스킴 → https 폴백, 실패 시 무throw.
- `lib/__tests__/forceUpdateAlert.test.ts`: 확정 카피·버튼 하나·cancelable false, 겹침 방지, 스토어 복귀 재표시, 스토어 실패 시 지연 재표시, iOS/Android 복귀 규칙, 배경 탭 재표시, 해제.
- `__tests__/root-layout-font-gate.test.tsx`: 판정 전 미렌더, forced 시 배경만 렌더·알림창 시작·배경 탭 재표시·언마운트 해제, pass·reject 시 통과.
- `lib/__tests__/remoteQueryParams.test.ts`: `nativeUpdateGate=1`. 웹 `useForceUpdateGate.test.tsx`: 표시가 있으면 `forced=false`.

## 실기기 검증 절차

1. dev 프로젝트 Remote Config에 `min_supported_version` = 설치된 앱 버전(1.0.2)보다 높은 값(예: `9.9.9`)을 넣고 게시한다.
2. 앱을 완전히 종료했다가 연다(백그라운드 fetch). 다시 종료했다가 열면 강제 업데이트 알림창이 뜬다.
3. "지금 업데이트"로 스토어 앱이 열리고, 앱으로 돌아오면 알림창이 다시 떠 있는지 확인한다.
4. 값을 `1.0.0`으로 되돌리고 두 번 재실행하면 정상 진입한다.

## 범위 밖

- 토큰 서버 등록 API·FE 연동(BE 티켓 생성 후), 권한 요청 시점·설정 토글·알림 콘텐츠(정책 미정), 웹 강제 업데이트 로직 제거, U2 공지 배너(BY-376·377).
