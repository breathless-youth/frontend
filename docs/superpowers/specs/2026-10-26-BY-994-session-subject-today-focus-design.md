# BY-994 세션 화면 과목별 순공을 플래너 하루 기준 오늘 값으로

- Jira: [BY-994](https://breathless-youth.atlassian.net/browse/BY-994)
- 관련: BY-696(과목 시트의 카드·라벨 순공), BY-817 §1(플래너 하루 기준), BY-939(세션 과목 페이지)

## 문제

세션 화면의 과목별 순공이 초기화되지 않는다.

- 과목 페이지 카드(`SubjectPanel`), 타이머 위 라벨(`SubjectLabel`), 소셜룸 알약(`RoomSubjectPill`)은 `GET /api/subjects`의 `focusSec`에 이번 세션 몫(`liveSubjectTime`)을 더해 보여 준다.
- 그 `focusSec`은 서버 `sumBySubjectIds`가 과목 구간 전부를 더한 값이라 날짜 조건이 없다. 과목을 만든 뒤로 계속 쌓인다.
- 플래너는 05:00~다음 날 05:00 하루 기준으로 그날 값만 보여 준다(`plannerDay.ts`의 `PLANNER_DAY_START_HOUR`). 같은 과목의 숫자가 두 화면에서 다르다.
- 세션 화면만 자정 기준으로 바꾸면 새벽 0~5시에 플래너와 다시 어긋난다.

## 결정

| 항목                      | 결정                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 하루 기준                 | 플래너와 같은 하루(KST 05:00~다음 날 05:00). 원천은 `PLANNER_DAY_START_HOUR` 하나다. 플래너와 맞추는 것 외에, 자정을 넘겨 공부하는 사람보다 05시를 넘겨 공부하는 사람이 더 적어 세션 중에 하루가 바뀌는 사람이 적다고 봤다                                                                                                                                              |
| 계산 위치                 | 앱. 서버는 바꾸지 않는다. 플래너가 쓰는 `assemblePlannerDay`·`plannerSubjectItems`를 그대로 써서 두 화면이 같은 코드로 같은 값을 낸다                                                                                                                                                                                                                                   |
| 데이터                    | 일간 조회(`dailyStatsQuery`)를 `plannerDateKeyOf(지금)` 날짜와 그 다음 날짜(미래면 생략)로 받는다. 싱글턴 `queryClient.fetchQuery`를 써서 홈·기록·플래너와 캐시를 나눈다                                                                                                                                                                                                |
| 적용 지점                 | `useSubjects`의 `load`에 세션용 로더를 넘긴다. 목록(`listSubjects`)을 받은 뒤 각 과목의 `focusSec`을 오늘 값으로 바꿔 넣는다. 카드·라벨·알약은 `subject.focusSec + 이번 세션 몫`을 그대로 쓰므로 바뀌지 않는다                                                                                                                                                          |
| 일간 조회 실패            | 목록은 그대로 두고 오늘 값은 0으로 보여 준다. 과목 선택과 측정을 막지 않는다 (2026-10-26 확인)                                                                                                                                                                                                                                                                          |
| 세션 중 05:00을 지날 때   | 들어올 때의 하루 기준을 세션 끝까지 유지한다. 다음 세션부터 새 날 값이다 (2026-10-26 확인)                                                                                                                                                                                                                                                                              |
| 응답 모양이 이상할 때     | 세션 목록이 아닌 응답(프록시 오류 페이지, 손상된 세션 항목 등)은 실패로 본다. 오늘 값 조립 전체를 `try`로 감싸 어떤 응답이든 목록은 살린다. `listSubjects`의 배열 검사와 같은 이유다. 조립 실패는 응답 형식 어긋남이라 `reportHandled(…, "session-subject-today")`로 보고하고, 조회 실패는 다음 세션에 복구되므로 보고하지 않는다 (2026-10-26 확인, codex·봇 리뷰 반영) |
| 일간 조회 재시도          | 하지 않는다(`retry: false`). 실패해도 0으로 가므로 재시도 대기가 과목 목록만 늦춘다 (2026-10-26 확인)                                                                                                                                                                                                                                                                   |
| 오늘 값을 받는 시점       | 세션 입장 때 한 번, 과목 목록과 같은 흐름. 제출 성공 시 통계 캐시가 비워져 다음 세션은 새 값이다 (2026-10-26 확인)                                                                                                                                                                                                                                                      |
| 이름이 같은 지운 과목     | 플래너처럼 살아 있는 과목에 합산한다. 같은 함수를 쓰므로 따로 정하지 않는다 (2026-10-26 확인)                                                                                                                                                                                                                                                                           |
| `studySec`                | 화면에 쓰이지 않아 손대지 않는다(서버 누적값이 그대로 실린다) (2026-10-26 확인)                                                                                                                                                                                                                                                                                         |
| `/api/subjects` 누적 필드 | 그대로 둔다. 제거는 범위 밖                                                                                                                                                                                                                                                                                                                                             |

검토하고 버린 방식은 아래와 같다.

- 서버 `sumBySubjectIds`에 자정 조건을 거는 방식은 새벽 0~5시에 플래너와 어긋나서 버렸다.
- 서버에 05시 조건을 거는 방식은 과목 구간 행이 자정에서만 나뉘어 05시를 걸친 구간을 서버가 다시 잘라야 해서 버렸다(ADR-0023의 "조회 때 합산 한 문장"이 깨진다).
- `RoomPage`에서 `usePlannerDay`(react-query `useQuery`)를 직접 쓰는 방식은 세션 라우트 테스트가 Provider 없이 렌더해서(10여 파일) 버렸다. `useSubjects`가 react-query를 쓰지 않는 이유와 같다.

## 구성

### `loadSessionSubjects.ts` (study-session, 새 파일)

```ts
export async function loadSessionSubjects(userId: number, now = new Date()) {
  const dateKey = plannerDateKeyOf(now);
  const nextKey = addDaysToDateKey(dateKey, 1);
  const [subjects, day, next] = await Promise.all([
    listSubjects(),
    fetchDay(userId, dateKey),
    nextKey > kstDateKey(now) ? EMPTY_STATS : fetchDay(userId, nextKey),
  ]);
  if (day === null || next === null) {
    return subjects.map((subject) => ({ ...subject, focusSec: 0 }));
  }
  const items = plannerSubjectItems(assemblePlannerDay(dateKey, day, next), subjects);
  const todayFocus = new Map(items.map((item) => [item.subjectId, item.focusSec]));
  return subjects.map((subject) => ({ ...subject, focusSec: todayFocus.get(subject.id) ?? 0 }));
}

const fetchDay = (userId: number, dateKey: string) =>
  queryClient.fetchQuery(dailyStatsQuery(userId, dateKey)).catch(() => null);
```

- `EMPTY_STATS`는 훅 파일이 아닌 순수 모듈 `plannerDay.ts`로 옮겨 플래너 훅과 같이 쓴다.
- `listSubjects` 실패는 지금처럼 로더 전체 실패다(토스트·재시도).
- 이름이 같은 지운 과목의 기록은 플래너처럼 살아 있는 과목에 합쳐진다(`plannerSubjectItems`가 이름으로 맞춘다).
- `now`를 넣을 수 있게 둬서 05시 전후를 단위 테스트로 잡는다.

### 호출부

- `RoomPage.tsx`·`LiveRoomSession.tsx`: `useSubjects(enabled, onError, "sheet", () => loadSessionSubjects(userId))`. "서버 누적 + 이 세션 몫" 주석을 "오늘(플래너 하루) 기록 + 이 세션 몫"으로 고친다.
- 제출 성공 시 `statsKeys.all` 무효화(`useStudyRoomSession.ts`)가 이미 있어 다음 세션은 새 값으로 시작한다.
- `useSubjects.reload`는 변경 실패를 되돌릴 때 로더를 다시 부르는데 `fetchQuery`가 30초 캐시를 쓰므로 추가 요청은 거의 없다.
- `SubjectPanel.tsx` 머리 주석, `docs/screens/SCR-S12-planner.md` 18행("이 기준은 플래너에만 쓴다")을 고친다.

## 경계 사례

- 새벽 0~5시에 세션을 열면 dateKey는 어제, 다음 날짜는 오늘이라 두 번 조회한다. 밤새 공부한 시간이 이어진다.
- 복원 세션: 저장되지 않은 세션은 일간 조회에 없고 이번 세션 몫이 그 시간을 전부 맡는다. 서버가 이미 확정해 버린 세션은 일간 조회에 들어온다. 둘이 겹치지 않는다.
- 세션 중 05:00을 지나면 플래너는 새 날로 넘어가지만 세션 화면은 들어올 때 기준 + 이번 세션 몫을 보여 준다. 세션을 다시 열면 맞는다.
- Provider 없이 렌더하는 세션 테스트는 `listSubjects`만 모킹한다. 일간 조회가 실패해 오늘 값은 0이 되는데, 기존 픽스처가 `focusSec: 0`이라 깨지지 않는다.

## 테스트

- `loadSessionSubjects.test.ts`: 05시 전후 날짜 선택, 두 날짜 응답 조립, 일간 조회 실패 시 0, 지운 동명 과목 합산.
- `LiveRoomPage.test.tsx`: `@/lib/statsApi`를 모킹해 알약이 오늘 저장 기록(10분) + 이번 세션 몫을 보이는 것 1건(기존 "서버 누적" 단언을 바꿈). 세션 라우트 테스트는 싱글턴 캐시를 거치므로 `beforeEach`에서 `queryClient.clear()`를 한다.

## 작업 순서

1. 로더와 단위 테스트
2. `RoomPage`·`LiveRoomSession` 호출부 교체, 주석·화면 문서 갱신
3. 실기기 확인(세션 화면 카드·라벨·소셜룸 알약이 같은 날짜 플래너 값 + 이번 세션 몫인지)
4. PR → dev

`.ai` 위키의 BY-696·BY-817 명세 갱신은 별도 `.ai` PR이다.

## 검증 기록 (2026-10-26, Android 에뮬레이터)

사람 손 없이 에뮬레이터 `by617`의 dev 클라이언트(26.42.0)에서 확인했다. Metro는 그 클라이언트와 네이티브가 같은 시점의 워크트리에서 띄우고, 웹만 이 브랜치의 로컬 Vite를 `WEB_BASE_URL`로 줬다(`adb reverse`). 조작과 읽기는 WebView CDP(`Runtime.evaluate`)로 했고, 데이터는 페이지 안에서 Vite가 서빙하는 모듈(`/src/lib/manualRecordApi.ts` 등)을 동적 import해 앱의 토큰으로 만들었다.

- dev 계정에 과목 `국어`(서버 누적 5초)가 있는 상태에서 오늘 06:00~06:10 수동 기록 10분을 넣었다.
- 플래너: `국어 10분`.
- 세션 화면 과목 페이지 카드: `국어 00:10:00`. 과목을 고른 뒤 타이머 위 라벨: `국어 00:10:00`. 바꾸기 전이라면 누적 `00:00:05`가 보였을 값이다.
- 세션 중 자리 비움 상태라 이번 세션 몫은 0초였다. 소셜룸 알약은 같은 식이라 단위 테스트로 대신했다.
- 화면 아래에 글자 없는 빨간 느낌표 바가 한 번 보였는데, 파이프로 띄운 Metro가 끊겨 Expo dev 클라이언트가 띄운 알림이었다. Metro를 다시 띄우자 사라졌고 웹 토스트 영역은 비어 있었다.
- 확인 뒤 수동 기록은 삭제했다.

## 검증 기록 (2026-10-26, iOS 시뮬레이터)

iPhone 17 Pro 시뮬레이터에 이 브랜치로 dev 클라이언트(26.43.1)를 새로 빌드해 같은 절차로 확인했다. 한글 경로에서는 pod install이 실패해 ASCII 경로 워크트리에서 빌드했고, Keychain이 동작하도록 로컬 ad-hoc 서명(`CODE_SIGN_IDENTITY=-`)을 줬다. dev launcher가 탭 없이 로컬 Metro에 붙도록 최근 연 앱 목록과 자동 실행 설정을 `simctl spawn … defaults import`로 미리 넣었다. WebView 조작은 `ios_webkit_debug_proxy`로 WebKit 인스펙터에 붙어 `Runtime.evaluate`로 했고, WebKit은 `awaitPromise`를 기다리지 않아 비동기 결과는 전역 변수에 담아 다시 읽었다.

- 새로 등록된 dev 계정에 과목 `수학`을 만들고 오늘 06:00~~06:10 10분, 어제 10:00~~10:20 20분 수동 기록을 넣어 서버 누적 30분 상태를 만들었다.
- 플래너: `수학 10분`.
- 세션 화면 과목 페이지 카드와 타이머 위 라벨: 둘 다 `수학 00:10:00`. 바꾸기 전이라면 누적 `00:30:00`이 보였을 값이다.
- 시뮬레이터에는 카메라가 없어 자리 비움 상태였고 이번 세션 몫은 0초였다.
- 확인 뒤 수동 기록과 과목은 삭제했다.
