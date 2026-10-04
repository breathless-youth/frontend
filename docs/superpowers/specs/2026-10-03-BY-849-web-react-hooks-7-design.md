# BY-849 웹 react-hooks 7 업그레이드와 React Compiler 규칙 위반 정리 설계

## 배경

- BY-816에서 모바일의 react-hooks 7 컴파일러 규칙 지적 11건을 정리했다. 웹은 `eslint-plugin-react-hooks`를 5.2로 고정하고 있어 같은 규칙이 돌지 않았다.
- 2026-10-02 dev(`ccf3f3fb`) 기준으로 7.1.1을 돌리면 41건이 나온다. `refs` 33, `set-state-in-effect` 7, `purity` 1. 대부분 세션·소셜룸 핵심 훅이다.
- React Compiler를 켜려면 이 41건이 0이어야 한다. 컴파일러는 렌더 중 읽은 `ref.current`를 메모해 다음 렌더에서 옛 값을 쓰게 되고, effect 안 동기 setState는 렌더를 연쇄시킨다.

### 목표

- `apps/web`이 모바일과 같은 react-hooks 7 컴파일러 규칙을 켜고 lint 오류·경고 0이 된다.
- 41건이 0이 된다. 남기는 건은 `eslint-disable-next-line`과 이유 주석뿐이고 파일 단위 끄기는 없다.
- 세션 시간·룸 상태·복구 경로 동작이 바뀌지 않는다. 기존 vitest가 그대로 판정하고, 테스트가 없던 동작은 고정 테스트를 더한다.

## 실측

- 41건의 파일·행·메시지와 건별 분류·처방은 저장소 밖 로컬 작업 폴더(`focus-makers/reports/by-849/_workspace/`)에 두었다. 저장소 안에서는 아래 범주별 건수와 작업 단위 표가 근거다. 같은 목록은 `ccf3f3fb`에 7.1.1만 올리고 `pnpm --filter web lint`를 돌리면 다시 얻을 수 있다.
- `useForceUpdateGate.ts`의 `useRef(...).current` 한 줄에서 16건이 번졌다. 실제로 손댈 자리는 32곳, 약 115줄이다.
- 7.1.1로 실측한 통과·불통과 패턴: `useState(() => Date.now())` 통과, `useLayoutEffect` 안 ref 대입 통과, effect·인터벌·구독 콜백 안 `useEffectEvent` 호출 통과, 렌더 중 조건부 setState 통과, callback ref로 받은 state를 포털 `container`로 넘기기 통과. 렌더 중 만든 객체(`useState` 초기화)에 ref 콜백을 넘기는 자리는 어떤 감싸기로도 불통과. `eslint-disable-next-line`은 보고된 행 바로 위에 있어야 먹는다.

## 확정 결정

| 번호 | 결정                  | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 플러그인 업그레이드   | `apps/web`의 `eslint-plugin-react-hooks`를 7.1.1로 올리고 `reactHooks.configs.recommended.rules`를 그대로 쓴다(7의 recommended가 컴파일러 규칙을 포함한다). 모노레포에 7.1.1 하나만 남는다. 이 티켓의 첫 커밋이다                                                                                                                                                                                                                                                                                                                                                               |
| 2    | 처방 범주             | A 최신값 ref 대입을 `useLayoutEffect`로(6건) · B ref를 state로(20건) · C `useEffectEvent`(5건) · D effect 안 setState를 렌더 중 파생·조정·소유자 state로(6건) · E `Date.now()`를 `useState` 지연 초기화로(1건) · F 지시문과 이유(3건)                                                                                                                                                                                                                                                                                                                                           |
| 3    | `useEffectEvent` 도입 | 저장소 첫 사용. ref를 읽는 쪽이 effect가 만든 콜백(인터벌·구독)뿐이고 그 콜백이 effect 정리와 함께 사라지는 자리에만 쓴다. 이벤트 핸들러나 바깥에 내준 함수에서도 읽는 자리는 A로 둔다(린트가 핸들러 안 호출을 막는다). `useEffectEvent` 결과는 effect 의존성 배열에 넣지 않는다                                                                                                                                                                                                                                                                                                |
| 4    | A의 대입 위치         | `useLayoutEffect`. 자식 passive effect가 부모 것보다 먼저 돌아 `useEffect`면 낡은 값을 볼 틈이 생긴다. 웹은 SSR이 없고 이미 세 곳이 쓴다                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5    | F로 남기는 기준       | (1) 렌더 중 만든 외부 객체(STOMP 채널 `LiveRoomSession.tsx:148`, Vision 검출기 `useVisionReadyTracking.ts:199`)에 나중에 불릴 ref 콜백을 넘기는 자리. (2) 외부 시스템 시작 직후 동기 결과를 state에 반영하는 자리(`useStudyRoomSession.ts:317`). API를 바꾸면 테스트 8곳 이상으로 번지고 얻는 것은 지시문 하나다                                                                                                                                                                                                                                                                |
| 6    | 소셜룸 입장 래치      | `LiveRoomEntry.tsx:166`은 렌더 중 조정(`if (!entered && ready) setEntered(true)`)으로 래치하고 입장 계측은 `entered`에 반응하는 effect로 분리한다. 세션이 한 커밋 일찍 마운트되는 차이만 있다                                                                                                                                                                                                                                                                                                                                                                                   |
| 7    | 복구 훅의 effect 리셋 | `useActiveSessionRestore.ts`·`useLaunchSessionRecovery.ts` 모두 effect 안 리셋을 렌더 중 조건부 리셋(`if (state.userId !== userId) setState(...)`)으로 바꿔 사용자 전환 때 이전 결과를 같은 렌더에서 버린다. 처음에는 소유자 가드에만 맡기려 했으나, 네이티브 토큰 갱신이 실패하면 `userId`가 id→null→id로 오가므로(`nativeBridgeHandler.ts`의 `request-token-refresh` 응답) 옛 복원값으로 세션이 다시 마운트될 수 있어 되돌렸다. 복구 훅은 처음에 소유자 꼬리표 state로 숨기기만 했으나 codex 채점에서 A→null→A 재노출이 이전 동작과 다르다고 지적돼 같은 리셋 패턴으로 맞췄다 |
| 8    | 포털 자리             | `RoomPage.tsx`·`LiveRoomSession.tsx`의 `sessionSurfaceRef.current`는 callback ref로 받는 `sessionSurface` state로 바꾼다. 마운트 직후 렌더가 1회 늘지만 그 사이 시트·다이얼로그를 열 수 없어 체감 차이가 없다                                                                                                                                                                                                                                                                                                                                                                   |
| 9    | 기타 D·E              | 온보딩 스텝 리셋은 `prevStep` 렌더 중 조정(첫 프레임에 이전 경과값이 비치던 것이 사라진다). 결과 히어로 카운트업은 `canAnimate ? value : target` 파생. 시트 툴팁 리셋은 `prevOpen` 조정. 입장 시각은 `useState(() => Date.now())`                                                                                                                                                                                                                                                                                                                                               |

## 작업 단위 (위험 낮은 순)

| 순서 | 단위                                                                        | 건       | 규모     | 실기기                                                                                    |
| ---- | --------------------------------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| 0    | 플러그인 7.1.1 업그레이드                                                   | 0        | 설정 2곳 | 없음                                                                                      |
| 1    | `useForceUpdateGate.ts`                                                     | 5~20     | 2줄      | 브라우저 모바일 UA로 `?appVersion=0.0.1` 강제 업데이트 모달 유지                          |
| 2    | `OnboardingGuideFlow.tsx`·`StudyCompleteHero.tsx`·`lib/nativeRouteReset.ts` | 29·30·39 | 18줄     | 온보딩 스텝 타이머 리셋, 결과 카운트업(모션 축소 켜고 끄고), Android 탭 리셋 뒤 쿼리 유지 |
| 3    | `useAmbientSound.ts`·`AmbientSoundSheet.tsx`                                | 1~4      | 15줄     | 배경음 자동 재생·일시정지·비집중 감쇠·종료 정지, iOS 자동재생 차단 안내, 툴팁 리셋        |
| 4    | `RoomPage.tsx`                                                              | 40·41    | 4줄      | 라이트 테마에서 시트·다이얼로그 색                                                        |
| 5    | `useBackgroundGraceWatch.ts`·`useRoomStatePublisher.ts`                     | 26~28    | 15줄     | 기기 2대 소셜룸: 순공시간 즉시 0·1분 갱신, 백그라운드 10초(유지)·35초(종료)               |
| 6    | `LiveRoomSession.tsx`                                                       | 22~25    | 12줄     | 종료 다이얼로그 색, `social_room_exited.duration_sec`                                     |
| 7    | `LiveRoomEntry.tsx`                                                         | 21       | 12줄     | 일반 입장·유예 재입장·권한 거부, `social_room_entered` 입장당 1건                         |
| 8    | `useActiveSessionRestore.ts`·`useLaunchSessionRecovery.ts`                  | 31·32    | 15줄     | 세션 중 강제 종료 뒤 복구 모달 1회, 같은 방 재진입 시 복원값                              |
| 9    | `usePauseAutoEnd.ts`·`useStudyRoomSession.ts`·`useVisionReadyTracking.ts`   | 33~38    | 20줄     | 일시정지 자동 종료(화면 꺼진 채 임계 초과 포함), 종료 이벤트의 배경음 사용 시간           |

단위마다 끝나면 `pnpm --filter web lint`와 해당 테스트를 돌린다. 한 자리를 고치면 가려져 있던 다음 건이 드러날 수 있다(`useActiveSessionRestore.ts:58`이 그 예).

## 바뀌지 않는 것

- 세션 집계·전송 로직, STOMP 채널 API, Vision 검출기 API, 복원·복구의 소유자 가드.
- 모바일 쪽 코드(BY-816에서 완료).

## 실패 경로

- 컴파일러 규칙이 새 건을 드러내면 같은 범주 기준으로 처리하고, F 기준에 들면 지시문으로 남긴다.
- `useEffectEvent`가 핸들러에서 불리는 구조로 바뀌면 린트가 막는다. 그런 자리는 A로 되돌린다.

## 테스트

- 기존: 테스트가 있는 11개 파일은 기존 테스트가 동작 불변을 판정한다(건별 관련 케이스는 분류표의 "기존 테스트" 열).
- 추가: `LiveRoomEntry`에 "입장 계측은 입장당 1회이고 유예 재입장은 Meta 이벤트 없음" 고정 테스트. `AmbientSoundSheet`에 "시트를 닫았다 다시 열면 안내 문구가 닫혀 있다" 고정 테스트. `useActiveSessionRestore`에 "같은 사용자가 null을 거쳐 돌아오면 옛 복원값을 내주지 않고 다시 조회한다" 회귀 테스트(결정 7 수정의 근거 경로). `useLaunchSessionRecovery`에도 같은 경로의 회귀 테스트(codex 1차 채점 지적). 각 단위의 구현자가 리팩토링 전에 통과하는 고정 테스트를 먼저 두고(Red가 아니라 잠금), 리팩토링 뒤 같은 테스트로 판정한다.
- 없는 곳 중 OnboardingGuideFlow·StudyCompleteHero는 상위 테스트(`onboardingComponents.test.tsx`·`ResultPage.test.tsx`)가 리셋·카운트업을 잠근다.
- 전체: `pnpm --filter web lint`(오류·경고 0), `typecheck`, vitest 전부, `react-compiler-healthcheck` 190/190 유지(2026-10-03 실측).

## 커밋 단위

| 순서 | 커밋                                                                                                    | 범위                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | `build(web): eslint-plugin-react-hooks를 7로 올리고 컴파일러 규칙을 켠다 (BY-850)`                      | package.json·lockfile(eslint.config.mjs는 `recommended.rules`가 7에서도 그대로 먹어 변경 없음) |
| 2    | `refactor(web): 강제 업데이트 게이트의 첫 값을 state로 고정한다 (BY-851)`                               | 단위 1                                                                                         |
| 3    | `refactor(web): 온보딩·결과 히어로·탭 리셋의 effect 안 setState와 ref 읽기를 정리한다 (BY-851, BY-852)` | 단위 2                                                                                         |
| 4    | `refactor(web): 배경음 훅의 최신값 ref 대입을 layout effect에서 한다 (BY-851, BY-852)`                  | 단위 3                                                                                         |
| 5    | `refactor(web): 세션 화면 포털 자리를 callback ref state로 받는다 (BY-851)`                             | 단위 4·6의 포털                                                                                |
| 6    | `refactor(web): 소셜룸 훅에 useEffectEvent를 도입한다 (BY-851)`                                         | 단위 5·6                                                                                       |
| 7    | `refactor(web): 소셜룸 입장 래치를 렌더 중 조정으로 바꾼다 (BY-852)`                                    | 단위 7                                                                                         |
| 8    | `refactor(web): 복구 훅의 effect 안 리셋을 렌더 중 리셋과 소유자 가드로 바꾼다 (BY-852)`                | 단위 8                                                                                         |
| 9    | `refactor(web): 세션 훅의 ref 읽기를 정리하고 남는 건에 이유를 단다 (BY-851, BY-852)`                   | 단위 9                                                                                         |
| 10   | `docs: 웹 react-hooks 7 정리 설계를 기록한다 (BY-849)`                                                  | 이 문서                                                                                        |

단위가 작아 실제 커밋은 합칠 수 있다. 커밋 계획은 구현 뒤 5-2에서 확정한다.

## 범위 밖

- React Compiler 켜기(후속 티켓, 양쪽 앱 동시).
- 채널·검출기 API 변경으로 F 3건을 없애는 것.
