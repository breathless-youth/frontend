# BY-864 수동 메모이제이션(useMemo·useCallback) 제거 설계

## 배경

- BY-857로 두 앱에 React Compiler가 켜져 있고, BY-863으로 컴파일에서 빠지던 함수 대부분이 컴파일된다. 컴파일되는 컴포넌트·훅에서는 컴파일러가 함수와 객체를 같은 의존성으로 메모이제이션하므로 손으로 단 `useCallback`·`useMemo`는 중복이다.
- 저장소 스킬 `vercel-react-best-practices`의 `rerender-memo` 규칙도 컴파일러가 켜져 있으면 수동 메모이제이션이 필요 없다고 안내한다.
- 기준선(`origin/dev` 3335ca4e, 2026-10-05): 웹 60곳(useCallback 53, useMemo 7, 17개 파일), 모바일 19곳(16, 3). `memo()`는 없다. 인벤토리 전문은 `reports/by-864/_workspace/01_memo_inventory.md`(저장소 밖 작업 보관 폴더).

### 분류

| 분류 | 뜻                                                                     | 웹  | 모바일 |
| ---- | ---------------------------------------------------------------------- | --- | ------ |
| A    | JSX·핸들러·지역 계산에만 쓰임                                          | 37  | 10     |
| B    | 같은 컴포넌트·훅의 effect 의존성                                       | 6   | 5      |
| C    | 자식 컴포넌트·훅으로 넘어가 그쪽 effect 의존성                         | 2   | 4      |
| D    | 외부 API가 신원을 비교(addEventListener 짝)                            | 1   | 0      |
| E    | 컴파일되지 않는 함수 안(`useStudyRoomSession` 10, `LiveRoomSession` 4) | 14  | 0      |
| F    | 비싼 계산                                                              | 0   | 0      |

### 목표

- 컴파일되는 파일의 수동 메모이제이션을 지워 컴파일러에 맡긴다. 사용자 동작은 바뀌지 않는다.
- 결과: 웹 60→24(E 14 + C 유지 2 + B·연쇄 7 + 컴파일러 범위 1), 모바일 19→6(B 5 + jest 신원 테스트 1).

## 확정 결정

| 번호 | 결정                      | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 삭제 범위                 | 컴파일되는 파일의 `useCallback`·`useMemo` 중 A(단순)와 소비자가 컴파일되는 C를 지운다. 컴파일러가 같은 의존성으로 메모이제이션하므로 신원이 같다. B(같은 컴포넌트·훅의 effect 의존성)와 D(`invalidateFlipRects`, effect 의존성이기도 함)는 유지한다. `eslint-plugin-react-hooks` 7의 `exhaustive-deps`가 effect 의존성에 든 평범한 함수·객체를 "매 렌더 바뀐다"고 경고하고(컴파일러 메모이제이션을 모른다), lint 0 warnings 제약과 티켓 원문("effect 의존성은 남긴다")이 우선이다. Task 1 실측(2026-10-05)에서 B·D 6곳을 지우자 경고 6건이 생겨 되돌렸고, 남는 `useCallback`의 의존성에 들어가는 함수(`useAmbientSound.commit`, 분류표에서는 B)도 같은 경고를 내 함께 유지했다(연쇄 규칙). 웹에서 유지한 B·D·연쇄는 7곳이다                              |
| 2    | 유지 2곳                  | `useBackgroundGraceWatch`의 `isExpiredNow`와 `useRoomRejoin`의 반환 함수는 유지한다. 소비자인 `LiveRoomSession`이 컴파일되지 않아 그 effect 의존성 안정성을 훅의 컴파일 여부에 걸어 두지 않기 위함이다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3    | E 14곳                    | 유지. `useStudyRoomSession`은 BY-885로 컴파일된 뒤에 정리한다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4    | `components/ui/chart.tsx` | 파일은 남긴다(앞으로 쓸 컴포넌트, 사용자 결정 2026-10-05). 안의 `useMemo`만 다른 파일과 같은 기준으로 지운다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5    | 지우는 방법               | `useCallback(fn, deps)`는 `fn`으로, `useMemo(() => v, deps)`는 `v`로 바꾼다. 함수 선언으로 바꿀지 화살표 상수로 둘지는 주변 코드 관례를 따른다. 의존성 배열에 적혀 있던 값은 코드가 이미 참조하므로 따로 보존할 것이 없다. import에서 쓰지 않게 된 `useCallback`·`useMemo`를 뺀다                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6    | 컴파일 확인 게이트        | 손댄 파일마다 `.superpowers/rc-probe.cjs`로 해당 컴포넌트·훅이 `OK`인지 확인한다. 컴파일되지 않는 함수에서 지우면 진짜 성능 회귀가 되므로 이 게이트가 핵심이다. 확인 명령은 BY-863 설계 문서의 프로브 절과 같다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7    | 테스트                    | 새 테스트 없음. 기존 vitest·jest가 배경음 자동 시작, 과목 로드, 결과 이동, 웹뷰 복구·구독 경로를 지난다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8    | 실기기                    | iPhone Dev Client: 세션 전체 흐름, 배경음 자동 시작 1회, 기록·플래너·온보딩·프로필 화면, 소셜룸 타일 플립(iPhone + A23 2대). 네이티브: 콜드 스타트, 탭 전환, 백그라운드 복귀, 세션 모달 열고 닫기, 권한 거절 화면 복귀                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9    | 측정                      | 웹 운영 번들 gzip·`react.memo_cache_sentinel`, healthcheck, 삭제 줄 수를 전후로 PR에 남긴다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 10   | 커밋 단위                 | ① `refactor(web): 세션·소셜룸·배경음 훅의 수동 메모이제이션을 걷어낸다`(BY-868) ② `refactor(web): 나머지 화면의 수동 메모이제이션을 걷어낸다`(BY-869) ③ `refactor(mobile): 웹뷰 호스트와 화면의 수동 메모이제이션을 걷어낸다`(BY-870). 설계 문서는 ③에 포함                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11   | 주의가 필요한 자리        | 컴포넌트 경계를 넘어 자식의 effect 의존성으로 들어가는 콜백은 lint가 잡지 못하고 컴파일러 메모이제이션에만 신원을 기댄다. 모바일 `room/[id].tsx`의 `handleMessage`(→`RemoteScreen`의 `[suppressTabBarMessages, onBridgeMessage]` effect)와 `RemoteScreen`의 `query`·`onRecoveryStart`·`onLoadEnd`(→`RemoteWebViewHost`의 `target` 메모·복구 effect·`[showFailureFallback, onLoadEnd]` effect)가 그 자리다. 컴파일러가 `SessionRoomScreen`을 건너뛰면 effect가 렌더마다 돌아 `replyRef`가 빈 함수로 덮이고 `device-handling` 신호가 사라질 수 있다. 지금은 두 파일이 컴파일되고(프로브 OK) react-hooks 7 lint가 건너뛰는 원인 대부분을 먼저 잡으므로 받아들인다. 실기기에서는 세션 모달 열고 닫기, 복구 폴백, 탭 바 숨김·복원이 한 번씩만 일어나는지 본다 |

### 구현 중 추가된 유지 2곳 (2026-10-05)

| 자리                                                      | 이유                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/records/MonthCalendar.tsx`의 `grid` useMemo     | 값이 뒤따르는 `useRef` 호출을 가로질러 JSX에서 쓰인다. 컴파일러는 훅 호출을 가로지르는 값의 범위를 평탄화해 메모하지 않는다. 래퍼를 지우자 `memoSlots`가 30→24로 줄고 컴파일 결과에서 `buildMonthGrid`가 매 렌더 다시 돌았다. 선언을 `useRef` 아래로 옮기면 풀리지만 코드 순서를 바꾸지 않는 쪽을 택했다 |
| `components/RemoteWebViewHost.tsx`의 `devLoadLog` useMemo | `__tests__/RemoteWebViewHost.test.tsx`가 재렌더 뒤 `onLoadStart` prop 참조가 같은지 `toBe`로 확인한다. jest는 컴파일러 없이 돌아 래퍼를 지우면 이 테스트가 실패한다. 컴파일된 앱에서는 지워도 결과가 같다                                                                                                |

`RemoteWebViewHost.handleLoadEnd` 위의 "인라인 화살표로 넘기면 렌더마다 새 함수가 되어 WebView의 prop이 매번 바뀐다" 주석은 컴파일러가 그 함수를 메모이제이션하는 지금은 거짓이 되어 지웠다. 같은 종류의 함정으로, `routes/RecordsPage.tsx`의 `sessions` 정렬은 래퍼를 지운 뒤 반환 JSX의 큰 메모 범위에 들어가 다른 상태가 바뀔 때도 다시 정렬한다. 하루 세션 수가 작아 그대로 두고, 메모 동작을 설명하던 주석 두 줄은 거짓이 되어 지웠다.

## 작업 단위와 파일

| 순서       | 단위                  | 파일                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (BY-868) | 웹 세션·소셜룸·배경음 | `features/ambient-sound/useAmbientSound.ts`(8), `features/study-session/useSubjects.ts`(7), `features/study-session/useLaunchSessionRecovery.ts`(1), `features/live-room/useCameraPreviewAspect.ts`(1), `features/live-room/useTileFlipAnimation.ts`(1), `routes/RoomPage.tsx`(2)                                                                                                                       |
| 2 (BY-869) | 웹 나머지             | `features/home/useHomeSummary.ts`(1), `features/records/MonthCalendar.tsx`(3), `features/records/useRecordsData.ts`(1), `features/planner/usePlannerDay.ts`(1), `features/onboarding/OnboardingGuideFlow.tsx`(7), `components/ui/chart.tsx`(1), `routes/ProfilePage.tsx`(1), `routes/RecordsPage.tsx`(4), `routes/OnboardingGuidePage.tsx`(2), `routes/PlannerPage.tsx`(1), `routes/ContactPage.tsx`(2) |
| 3 (BY-870) | 모바일                | `app/permission-denied.tsx`(1), `app/room/[id].tsx`(1), `components/RemoteWebViewHost.tsx`(13), `components/RemoteScreen.tsx`(4)                                                                                                                                                                                                                                                                        |

괄호는 조사 시점의 호출 수. 실제로 지운 수는 웹 36(단위 1에서 `syncAfterCommand`·`commit`·`applyMix`·`reload`·`measurePreviewAspect`·`invalidateFlipRects`·`goToResult` 7곳 유지, 단위 2에서 `MonthCalendar.grid` 유지), 모바일 13(`goHome`·`nextGeneration`·`target`·`enterRecovery`·`sendToWeb`·`devLoadLog` 6곳 유지)다. 합계 49.

## 바뀌지 않는 것

- `useStudyRoomSession`·`LiveRoomSession` 안의 메모이제이션 14곳, 유지 결정한 `isExpiredNow`·`useRoomRejoin` 반환 함수.
- 함수형 `setState` 업데이트. 컴파일러와 무관하게 권장 방식이다.
- 사용자 동작, 계측 이벤트, 웹뷰 브리지 메시지 흐름.

## 실패 경로

- 프로브에서 손댄 파일의 함수가 `CompileError`면 그 파일의 삭제를 되돌리고 이유를 기록한다. 컴파일되지 않는 함수의 메모이제이션은 지우지 않는다.
- 실기기에서 구독이 두 번 붙거나 배경음이 두 번 시작하면 해당 자리만 되돌리고 PR 표에 이유를 적는다.

## 범위 밖

- `memo()`·`React.memo` 추가.
- `useStudyRoomSession`의 렌더 중 ref 읽기 정리(BY-885).
- BY-861 측정.
