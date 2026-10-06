# BY-885 세션 훅의 렌더 중 ref 읽기 제거 설계

## 배경

- BY-817이 `useStudyRoomSession` 반환값에 `sessionEvents: allEvents(renderNowMs)`를 넣었다. `allEvents`는 `timelineRef.current`를 읽으므로 렌더 중 ref 접근이고, 그 줄에 `react-hooks/refs` 억제 주석이 있다. 둘 다 React Compiler가 함수를 건너뛰는 사유라 BY-863 뒤에도 이 훅은 컴파일되지 않는다.
- 세션 화면의 `RoomSessionScreen`은 컴파일되지만 훅이 빠져 있어 효과가 절반이다. BY-864에서 이 훅 안 `useCallback` 10곳도 같은 이유로 남겨 두었다.
- 조사 결과(저장소 밖 작업 보관 폴더 `reports/by-885/_workspace/01_survey.md`에 전문, 요지는 다음과 같다): 렌더 중 ref 읽기는 이 한 곳뿐이다. `subjectTracker`는 이미 ref + state 사본(`subjectTrackerRef`·`setSubjectTracker`)으로 돼 있다. `timelineRef`를 쓰는 자리는 `applyState`의 `transition`과 `endAndSubmit`의 `closeSessionTimeline` 둘뿐이고, 둘 다 불변 객체를 새로 만들며 같은 단계에서 state가 바뀌어 재렌더가 따라온다. `renderNowMs`는 렌더 때 읽는 `Date.now()`이고, 200ms 틱의 `setTotals`가 초당 1회 재렌더를 만든다.
- 프로브 실험(2026-10-05): `sessionEvents`의 ref 읽기와 그 억제 주석만 없애면 훅이 컴파일된다(실험 때 memoSlots 129, 구현 뒤 132). `purity`(`Date.now()`)·`set-state-in-effect` 억제 주석은 컴파일을 막지 않는다.

### 목표

- `useStudyRoomSession`이 컴파일되고 `react-hooks/refs` 억제 주석이 사라진다.
- 사용자 동작·계측·제출 페이로드는 바뀌지 않는다.
- 훅 안의 수동 메모이제이션을 BY-864 기준으로 정리한다.

## 접근 비교

| 안      | 내용                                                                                                                                      | 평가                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A(채택) | `timeline` state 사본을 두고 ref에 쓰는 두 자리 직후에 `setTimeline(timelineRef.current)`. 반환은 `toStatusEvents(timeline, renderNowMs)` | `subjectTracker`와 같은 패턴. 전이 때는 어차피 재렌더되고, 같은 참조면 React가 setState를 무시해 틱 비용이 없다 |
| B       | 타임라인을 통째로 state·reducer로 바꾸고 ref 제거                                                                                         | `pause`·`resume`이 `applyState` 직후 ref를 동기로 읽어 판단하므로 전면 재설계. 범위 초과                        |
| C       | effect에서 `sessionEvents`를 state로 계산                                                                                                 | 틱마다 렌더가 한 번 더 생긴다                                                                                   |

## 확정 결정

| 번호 | 결정                     | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 방식                     | A. ref가 진실이고 state는 화면용 사본이다. 콜백·인터벌·제출은 계속 ref를 읽는다                                                                                                                                                                                                                                                                                                                                                                |
| 2    | 사본 갱신 위치           | `applyState`에서 `timelineRef.current = transition(...)` 직후, `endAndSubmit`에서 `timelineRef.current = closeSessionTimeline(...)` 직후에 각각 `setTimeline(timelineRef.current)` 한 줄. 200ms 틱에는 넣지 않는다. 같은 참조면 React가 무시하므로 조건문을 두지 않는다                                                                                                                                                                        |
| 3    | 반환값                   | `sessionEvents: [...initial.priorEvents, ...toStatusEvents(timeline, renderNowMs)]`. `allEvents`는 스냅샷·제출용으로 유지한다                                                                                                                                                                                                                                                                                                                  |
| 4    | 주석                     | `react-hooks/refs` 억제 주석 한 줄을 지운다. `timeline` state 선언 위에 "화면용 사본이고 콜백은 ref를 읽는다"는 이유를 한 줄 적는다. `purity`·`set-state-in-effect` 억제 주석은 lint에 여전히 필요하므로 유지한다                                                                                                                                                                                                                              |
| 5    | 훅 안 `useCallback` 정리 | 삭제 후보 3곳: `resume`·`selectSubject`·`flipCamera`(핸들러로만 쓰임). 유지 7곳: 같은 훅 effect 의존성 `withBase`·`allEvents`·`applyState`·`onReturnFromBackground`, 같은 훅의 effect 의존성이기도 하고 컴파일되지 않는 `LiveRoomSession`의 effect 의존성이기도 한 `pause`·`endAndSubmit`, 다른 훅 옵션(`onAutoEnd`)으로 넘어가는 `handleAutoEnd`. 구현자가 소비자의 effect 의존성을 확인한 뒤 지운다. 지우면 lint 경고가 나는 자리는 유지한다 |
| 6    | 테스트                   | 훅 테스트 2건 추가: `pause()` 뒤 반환 `sessionEvents`에 `PAUSE` 이벤트가 생기고 `resume()` 뒤에는 그 이벤트의 `endedAt`이 더 늘지 않는다. `endAndSubmit()` 뒤에는 종료 시각에서 닫혀 그 뒤 렌더에도 늘지 않는다. 각 케이스는 `applyState`·`endAndSubmit`의 `setTimeline`을 지우면 실패하는 것을 확인했다. 지금은 반환 `sessionEvents`를 보는 테스트가 없어 사본 갱신 누락을 못 잡는다                                                          |
| 7    | 검증                     | 프로브(훅 `OK`·memoSlots), 두 앱 lint 0/0, typecheck, 세션·라우트 vitest, 웹 운영 번들 sentinel·gzip, healthcheck 전후                                                                                                                                                                                                                                                                                                                         |
| 8    | 실기기                   | iPhone Dev Client: 세션 시작, 과목 전환(시트 라벨의 과목 시간이 타이머와 함께 흐름), 일시정지·재개, 종료 제출, 플래너 반영. 소셜룸은 1대로 입장과 자리비움 종료 경로 1회                                                                                                                                                                                                                                                                       |
| 9    | 커밋                     | ① `refactor(web): 세션 타임라인 화면용 사본을 state로 두어 세션 훅이 컴파일되게 한다` + 테스트 ② `refactor(web): 세션 훅의 핸들러용 useCallback을 걷어낸다` + 설계 문서                                                                                                                                                                                                                                                                        |

## 구현 중 확인한 점 (2026-10-05)

- 훅이 컴파일되면서 `renderNowMs = Date.now()`가 메모 블록 안에 들어간다(컴파일 결과 확인). 블록 키는 `totals`·`timeline`·`phase` 등이라, 그 값이 바뀌지 않는 렌더(부모가 일으킨 렌더 등)에서는 `Date.now()`를 다시 읽지 않는다. 공부 중에는 200ms 틱이 초당 1회 `totals`를 바꾸고 일시정지 중에도 `pauseSec`가 늘어나므로 화면의 과목 시간은 지금처럼 초 단위로 흐른다. 늦어도 1초 안팎이고 `subjectSegments`와 같은 시각을 쓰므로 서로 어긋나지 않는다. 더 정확하게 하려면 틱에서 `nowMs` state를 두면 되지만 이 티켓에서는 하지 않는다.
- `setTimeline`은 ref 쓰기와 같은 동기 배치 안에서 호출되므로 추가 렌더를 만들지 않고, StrictMode 이중 호출에도 같은 값을 넣어 안전하다.
- 잠금 테스트는 `applyState`와 `endAndSubmit` 두 자리 모두 `setTimeline`을 지우면 실패하는지 확인해 둔다.

## 바뀌지 않는 것

- `timelineRef`를 읽는 콜백·인터벌·제출 경로. `pause`·`resume`은 `applyState` 직후 ref를 동기로 읽어야 하므로 state 사본을 읽지 않는다.
- `renderNowMs`의 `Date.now()` 읽기와 그 억제 주석. 카메라 effect의 `set-state-in-effect` 억제 주석.
- `subjectSegments`·`subjectSelection` 파생(이미 state 사본에서 읽는다).
- `LiveRoomSession`·`useTrackedVisionDetector`의 렌더 중 ref 접근(범위 밖).

## 실패 경로

- 프로브에서 훅이 여전히 `CompileError`면 사유를 적고 그 자리만 추가로 푼다.
- 새 테스트가 사본 갱신 누락을 잡으면 `setTimeline` 위치를 다시 본다. ref 쓰기 뒤에 state를 쓰는 순서를 지켜야 한다.
- 실기기에서 과목 시간 라벨이 멈추거나 일시정지가 화면에 늦게 반영되면 `renderNowMs`와 사본의 조합을 의심한다.
