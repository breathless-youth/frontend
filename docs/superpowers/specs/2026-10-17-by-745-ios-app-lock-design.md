# BY-745 iOS 방해 앱 잠금 구현 설계

- Jira: BY-745 (스토리 BY-740)
- 브랜치: `feature/BY-745-ios-app-lock` → PR base `feature/BY-740-app-lock` (dev와 분리된 기능 브랜치)
- 기획 원본: `.ai` `product/screen-time/features.md` §0, `decisions.md`, `platform.md` (PR #36 브랜치 `docs/screen-time-ios18-gate` 기준)
- 시안: Figma V2 페이지 14:4, S11-1(설정) `6463:10253` · S11-2(공부 화면) `6484:10827` · S11-3(Shield·알림) `6484:10831`
- 선행 결과: `docs/superpowers/specs/2026-10-13-by-743-ios-screen-time-spike-design.md` 주의점 1–8

## 목표

설정에서 방해 앱 잠금을 켜고 잠글 앱을 고르면, 공부하는 동안 그 앱들이 잠기고 공부를 끝내면 풀린다. iOS 18 이상만 지원하고, 운영 노출은 기능 브랜치 분리와 앱 기능 조회(`appLock=1`)로 막는다.

## 구조

웹이 "언제" 잠글지 정하고, 네이티브가 "어떻게" 잠근다. BY-478 가속도 센서와 같은 경로다.

```
[웹] 설정 화면 ──app-lock-query/authorize/pick──▶ [네이티브] appLockRelay ──▶ appLock 어댑터 ──▶ RNDA
[웹] useStudyRoomSession ──app-lock-start/stop──▶        │                          (한 파일, lazy require)
[웹] ◀──────────── app-lock-state / app-lock-started ─────┘
[네이티브] 앱 프로세스 시작 시 1회: 잠금·예약 정리 (웹에 묻지 않음)
```

### 네이티브 (`apps/mobile`)

| 단위                          | 역할                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/appLock/rnda.ts`         | `react-native-device-activity`를 import하는 유일한 파일. lazy `require`로 Jest·Android에서 터지지 않게 한다. 쓰는 API만 얇게 감싼다                     |
| `lib/appLock/appLock.ts`      | 상태 조회, 권한 요청, 고르기 결과 저장, 잠금 시작·해제, 실행 시 정리. iOS 버전 판정(`Platform.Version` ≥ 18), "전에 허용했음" 기록(`expo-secure-store`) |
| `lib/appLock/appLockRelay.ts` | 브리지 메시지(`app-lock-*`)를 받아 위 함수를 부르고 결과를 웹으로 보낸다. `nativeBridgeHandler`에 연결                                                  |
| `app/app-lock-picker.tsx`     | 잠글 앱 고르기 모달. RNDA `DeviceActivitySelectionView` 전체 화면 + `완료` 버튼. 닫힐 때 고른 결과를 저장하고 웹에 상태를 보낸다                        |
| `lib/remoteQueryParams.ts`    | iOS에서 `appLock=1`을 붙인다                                                                                                                            |
| `app/_layout.tsx`             | 프로세스 시작 시 `cleanupOnLaunch()` 1회                                                                                                                |
| `app.config.ts`               | RNDA config plugin(`appleTeamId`, `appGroup: group.${bundleIdentifier}`)                                                                                |
| `docs/adr/0016-…`             | RNDA 채택과 iOS 18 게이트, 잠금 데이터가 기기 밖으로 나가지 않는다는 조건을 ADR로 남긴다(루트 CLAUDE.md: 구조 변경 시 ADR)                              |

### 브리지 메시지 (`packages/types/src/bridge.ts`)

웹 → 네이티브

| type                 | 필드 | 동작                                                                                                   |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `app-lock-query`     | —    | 현재 상태를 `app-lock-state`로 답한다                                                                  |
| `app-lock-authorize` | —    | iOS 18 미만이면 바로 상태를 답한다. 권한이 없으면 OS 권한 창을 띄우고 결과를 답한다                    |
| `app-lock-pick`      | —    | 고르기 모달을 연다. 닫히면 `app-lock-state`로 답한다                                                   |
| `app-lock-start`     | —    | 안전 해제 예약(12시간)을 먼저 걸고 잠근다. 잠갔으면 `app-lock-started`, 아니면 아무 것도 보내지 않는다 |
| `app-lock-stop`      | —    | 잠금을 풀고 예약을 지운다                                                                              |

네이티브 → 웹

| type               | 필드                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `app-lock-state`   | `supported`(iOS 18 이상), `authorized`, `revoked`(전에 허용했는데 지금은 아님), `appCount`, `categoryCount` |
| `app-lock-started` | `appCount`, `categoryCount`                                                                                 |

요청과 응답은 타입으로만 짝짓는다(`request-camera-gate` 방식). 동시에 하나만 진행되는 설정 화면 조작이라 id가 필요 없다.

### 웹 (`apps/web`)

| 단위                                                    | 역할                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `features/app-lock/appLockCapability.ts`                | `appLock=1`을 모듈 로드 때 읽어 캐시(`rankingCapability.ts` 패턴). 다른 기능 조회 쿼리처럼 `ALLOWED_SEARCH_PARAMS`에는 넣지 않는다        |
| `features/app-lock/appLockSettings.ts`                  | 켜짐 여부를 localStorage에 저장(타임랩스 설정 패턴)                                                                                       |
| `features/app-lock/nativeAppLock.ts`                    | 브리지 요청 함수(`queryAppLock`, `authorizeAppLock`, `pickAppLockApps`, `startAppLock`, `stopAppLock`)와 응답 대기(타임아웃)              |
| `features/app-lock/useAppLockSettings.ts`               | 설정 화면 상태: 켜짐, 지원 여부, 개수, 토글·고르기 동작과 토스트                                                                          |
| `routes/AppLockSettingsPage.tsx` (`/app-lock-settings`) | 시안 "방해 앱 잠금 설정": 토글 행(ⓘ 툴팁), 잠긴 앱 행(켜졌을 때만), 회색 "기능 설명" 박스                                                 |
| `routes/SettingsPage.tsx`                               | 서비스 섹션의 타임랩스 아래에 "방해 앱 잠금" 행(값 + 셰브론). 기능 조회가 없으면 행을 숨긴다                                              |
| `features/study-session/useStudyRoomSession.ts`         | 세션 시작 시 `startAppLock()`, 종료(`endAndSubmit` 1회 가드)와 언마운트 시 `stopAppLock()`. 일시정지는 건드리지 않는다                    |
| 홈(`HomeTabPage`)                                       | 실행 시 상태 조회에서 `revoked`면 토스트 없이 켜짐을 끈다                                                                                 |
| `lib/amplitude.ts`                                      | `app_lock_permission_result`, `app_lock_apps_selected`, `app_lock_toggled`(features.md 분석 이벤트 표), `trackSettingsRowPressed` 행 추가 |

## 흐름

**켜기.** 토글 ON → `app-lock-authorize`

- `supported=false` → 토글 OFF 유지, 토스트 "방해 앱 잠금은 iOS 18 이상에서 쓸 수 있어요"
- `authorized=true` → 켜짐 저장, `잠긴 앱` 행이 나타난다
- 거부 → 토글 OFF 유지. 토스트는 띄우지 않는다

**고르기.** `잠긴 앱` 행 → `app-lock-pick` → 네이티브 모달 → 닫히면 개수 갱신. 값 표시는 "앱 3개 · 카테고리 1개"(0인 쪽은 생략, 둘 다 0이면 "선택 안 함").

**잠그기.** 세션 시작 시 켜짐이고 기능 조회가 있으면 `app-lock-start`. 네이티브는 권한·선택이 있을 때만 `configureActions`(예약 끝에 해제) → `startMonitoring`(지금부터 12시간) → `updateShield` → `blockSelection` 순으로 부르고 `app-lock-started`를 보낸다. 웹은 받으면 토스트를 띄운다.

**풀기.** `endAndSubmit`의 1회 가드 안과 훅 언마운트에서 `app-lock-stop`. 네이티브는 `resetBlocks` + `stopMonitoring`. 선택 기준이 아니라 걸린 잠금을 전부 푸는 이유는 공부 중에 선택이 바뀌어도 옛 앱이 잠긴 채 남지 않게 하려는 것이다(이 앱의 잠금은 공부 잠금 하나뿐이다). 12시간 안전 해제 액션도 `resetBlocks`다. 일시정지(수동·백그라운드)는 아무 것도 보내지 않아 잠금이 유지된다(ST-D07).

**남지 않게.** 앱 프로세스가 새로 시작되면 네이티브가 `resetBlocks` + `stopMonitoring`을 한 번 부른다. 새 프로세스에는 진행 중인 공부가 없다(웹이 `closeStaleSession`으로 옛 세션을 확정한다). 백그라운드 복귀에서는 부르지 않는다. 강제 종료는 12시간 예약이 푼다.

**권한 꺼짐 감지.** 처음 `approved`를 받을 때 secure-store에 기록한다. 기록이 있는데 지금 `approved`가 아니면 `revoked=true`. 홈이 실행 시와 화면이 다시 보일 때(iOS 설정에서 돌아올 때) 조회해서 처리한다.

**잠금이 풀리지 않을 때.** 해제 호출이 실패하면 안전 해제 예약을 지우지 않는다. 예약은 해제가 성공한 뒤에만 지운다.

## 정한 것 (AI 결정, 사용자 확인 필요)

| #   | 항목                             | 결정                                                                                                                                                              | 이유                                                                                                    |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A1  | 소셜 룸에서도 잠글지             | 잠근다. 잠금은 `useStudyRoomSession`에 걸어 솔로·소셜 모두 동작                                                                                                   | "공부를 시작하면 잠긴다"(ST-R05). 같이 잠그기(BY-749)는 입장 토글 기본값을 이 설정에서 가져온다(ST-R20) |
| A2  | 시작 토스트 개수                 | 카테고리가 없으면 "방해 앱 N개를 잠갔어요", 카테고리가 섞이면 "방해 앱을 잠갔어요"                                                                                | 카테고리는 앱 개수로 셀 수 없어 N이 거짓이 된다                                                         |
| A4  | ST-D20 "그날 공부 기록에 남긴다" | 이번에는 기능을 끄고 분석 이벤트(`app_lock_toggled { on:false, source:"permission_lost" }`)만 남긴다. 서버 공부 기록 필드는 백엔드 계약이 없어 후속 티켓으로 뺀다 | 세션 요청 타입에 해당 필드가 없고, Swagger에 없는 타입은 만들지 않는다(루트 CLAUDE.md)                  |
| A5  | 설정 메인 행 값                  | 꺼짐이면 "꺼짐", 켜짐이면 잠긴 앱 요약, 선택이 없으면 "켜짐"                                                                                                      | 시안의 "꺼짐"·"앱 3개"                                                                                  |
| A6  | `apps/mobile/targets/`           | gitignore에 넣는다                                                                                                                                                | prebuild가 매번 node_modules에서 다시 만든다(주의점 4)                                                  |
| A7  | 출시 안내 카드(ST-D09)           | 이번 범위에서 뺀다                                                                                                                                                | BY-745 완료 조건에 없다. 기능 브랜치를 dev에 합칠 때 함께 낸다                                          |
| A8  | 웹 켜짐 저장 위치                | 웹 localStorage                                                                                                                                                   | 타임랩스 설정과 같은 방식. 서버 저장 결정이 없다                                                        |

2026-10-17 실기기 확인에서 거부한 뒤에도 권한 창이 다시 떠서, 사용자 결정으로 "권한 창 없이 거부" 안내 토스트와 권한 꺼짐 토스트를 둘 다 뺐다.

## 사람이 할 일 (코드 밖)

- Apple Developer: 스테이징·운영 App Group(`group.com.breathlessyouth.mobile.staging`, `group.com.breathlessyouth.mobile`) 등록과 앱·확장 App ID 배정, 확장 App ID마다 Family Controls (Distribution). 개발은 BY-743에서 끝났다.
- 실기기 확인: Shield 제목 줄바꿈.

## 오류 처리

- 브리지가 없거나(일반 브라우저) 기능 조회가 없으면 설정 행을 숨기고 세션 쪽 호출은 아무 일도 하지 않는다.
- 응답 대기는 타임아웃 뒤 "실패"로 끝나고 토글은 OFF로 둔다. 상태 조회는 5초, 권한 요청은 120초(사용자가 OS 권한 창 앞에서 고민하는 시간), 앱 고르기는 대기 제한이 없다. 실패를 사용자에게 따로 알리지 않는다(토글이 켜지지 않은 것으로 충분).
- 권한 거부와 설정에서 권한을 끈 경우도 토스트 없이 토글이 꺼진 채로 둔다.
- 요청 id가 없으므로 웹은 요청을 한 번에 하나씩 보낸다(앞 요청이 끝나야 다음 요청).
- 네이티브 RNDA 호출 실패는 잡아서 로그만 남기고 공부 측정을 막지 않는다(ST-R01).
- 앱 이름·토큰은 어떤 메시지·로그·이벤트에도 싣지 않는다. 브리지에는 개수만 오간다(ST-D06).

## 테스트

- 웹(Vitest): `appLockCapability`, `appLockSettings`, `nativeAppLock`(요청·응답 짝, 타임아웃), `useAppLockSettings`(토글 분기 3개: 미지원·허용·거부), 요약 문구, 세션 시작·종료 시 start/stop 호출, `AppLockSettingsPage`·`SettingsPage` 행 노출 조건.
- 모바일(Jest): `appLock`(RNDA 목으로 예약→잠금 순서, iOS 버전 판정, revoked 판정, 정리), `appLockRelay`(메시지 → 응답), `webBridge` 파서, `remoteQueryParams`.
- 실기기(BY-748 전 자체 확인): 설정 켜기·고르기, 공부 시작 잠금, 일시정지 유지, 종료 해제, 강제 종료 뒤 재실행 정리.
