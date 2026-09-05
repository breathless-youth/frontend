# BY-428 API 요청 캐싱(react-query) 설계

작성일: 2026-09-03
티켓: [BY-428](https://breathless-youth.atlassian.net/browse/BY-428)
브랜치: `feature/BY-428-react-query-caching` (base `dev`)

## 배경

웹의 `QueryClient`는 `apps/web/src/App.tsx`에서 `new QueryClient()`로 만들어져 모든 값이 기본값이다. 즉 `staleTime`이 0이고 `retry`가 3이다. 그래서 화면이 다시 마운트될 때마다 요청이 그대로 다시 나간다.

- 기록 탭에서 날짜를 A에서 B로 바꿨다가 다시 A로 돌아오면 A를 매번 다시 조회한다.
- 웹뷰가 다시 보일 때마다 홈과 기록의 모든 쿼리가 다시 나간다.
- 조회가 실패하면 자동 재시도 3회가 끝나야 오류 UI가 뜬다. 대기 시간은 약 1초, 2초, 4초다.
- 오류 화면에는 이미 재시도 버튼이 있어서 사용자가 직접 다시 시도할 수 있다.

모바일 `apps/mobile/app/_layout.tsx`에는 `staleTime: 30_000, retry: 1`이 있다. 하지만 BY-329와 BY-330에서 홈과 기록을 웹으로 이식할 때 이 설정이 웹에 반영되지 않았다. 지금 모바일에는 `useQuery` 호출이 하나도 없어서 그 `QueryClient`에는 소비자가 없다.

백엔드에는 같은 목적의 BY-429(Redis 캐싱)가 있다.

## 범위

- 대상은 `apps/web`, `apps/mobile/app/_layout.tsx`, `apps/mobile/package.json`이다.
- 백엔드 변경은 없다.
- 화면 UI 변경은 없다.
- 저장소 스킬 `.claude/skills/tanstack-query-best-practices`의 `cache-stale-time`, `cache-gc-time`, `mut-invalidate-queries` 규칙을 따른다.

## 현재 구조

네이티브 앱은 탭 4개를 각각 별도 WebView로 띄우고, 웹뷰마다 `apps/web`을 독립 문서로 로드한다. 세션(스터디룸)도 별도 웹뷰 문서다. 따라서 `QueryClient`는 웹뷰마다 따로 존재하고 탭 사이의 캐시 공유는 없다. 캐시가 실제로 의미를 갖는 단위는 같은 탭 웹뷰 안에서의 재노출, 라우트 왕복, 기록 달력의 날짜 이동이다.

react-query를 타는 GET은 통계 3종(`dailyStatsQuery`, `streakQuery`, `periodStatsQuery`)과 프로필(`profileQuery`)이다.

- 정의는 `apps/web/src/lib/statsQueries.ts`와 `apps/web/src/lib/profileQueries.ts`에 있다.
- 키 팩토리(`statsKeys`, `profileKeys`)와 `queryOptions` 패턴이 이미 잘 잡혀 있어 그대로 쓴다.
- 세션 복원과 마감 조회(`restoreActiveSession`, `closeStaleSession`)는 react-query 밖에 있다.
- 이 둘은 일회성 게이트라 타임아웃, 404 정상 처리, 사용자 전환 취소 정책이 고유하고 복원 스냅샷은 캐시되면 안 된다.

웹의 재조회 트리거는 `refetchOnWindowFocus` 하나뿐이고 브라우저 `visibilitychange`에 기댄다. 네이티브는 `app-state` 메시지를 보내지 않고, 웹도 `focusManager`를 연결하지 않는다.

프로필 쿼리는 화면마다 정책이 갈려 있다. `ProfilePage`는 staleTime 0으로 쓰고 `LiveRoomEntry`는 `staleTime: Infinity`로 오버라이드한다. 또 `statsQueries.ts` 주석은 세션 종료 후 홈 갱신을 "라우트 이동으로 새로 마운트되면 staleTime 0이라 다시 조회된다"에 기대고 있다.

## 설계

쿼리별로 정하는 값은 다음과 같다.

| 쿼리                            | staleTime  | gcTime | 비고                                          |
| ------------------------------- | ---------- | ------ | --------------------------------------------- |
| 기본값(`QueryClient`)           | `30_000`   | 기본   | `retry: 1` 동반                               |
| `dailyStatsQuery` (정착된 날짜) | `Infinity` | 30분   | 어제보다 과거이고, 이번 달도 어제의 달도 아님 |
| `dailyStatsQuery` (그 외 날짜)  | 기본값     | 기본   | 오늘, 어제, 이번 달                           |
| `profileQuery`                  | 5분        | 기본   | 화면별 오버라이드 없음                        |

### 1. 웹 QueryClient 기본값

새 파일 `apps/web/src/lib/queryClient.ts`에 설정된 `queryClient`를 두고 `App.tsx`가 이를 import한다. `App.tsx` 안의 모듈 상수는 테스트가 닿을 수 없어서 파일을 분리한다.

```ts
defaultOptions.queries = { staleTime: 30_000, retry: 1 };
```

staleTime을 30초로 두는 근거는 이렇다. 오늘 통계가 바뀌는 경로는 세션 종료뿐인데, 세션은 홈 탭과 다른 웹뷰 문서에서 돌아가서 홈 캐시를 직접 무효화할 수 없다. 그래서 홈은 재노출 시 `refetchOnWindowFocus`에만 기댄다. 재노출 재조회는 stale일 때만 나가므로, staleTime은 "세션을 다녀온 뒤 홈이 낡은 값을 보여줄 수 있는 최대 시간"이 된다. 순공 1분 미만 세션은 합산에서 빠지므로(BY-335) 통계를 실제로 바꾸는 세션은 60초 이상 걸린다. 60초 미만이면 돌아온 시점에 반드시 stale이다. 30초는 그 절반의 여유다.

retry를 1로 두는 근거는 오류 UI에 재시도 버튼이 있어서 자동 재시도를 길게 끌 이유가 없다는 점이다. 모바일에서 내린 판단을 그대로 이어받는다.

### 2. 일별 통계 쿼리의 날짜별 옵션

`statsQueries.ts`에 순수 함수 `isSettledStatsDate(date, now = new Date())`를 두고 export한다. 참이 되는 조건은 "어제보다 오래됐고, 이번 달도 어제의 달도 아니다"이다.

- 오늘 키는 `todayKstDateKey(now)`, 어제 키는 `todayKstDateKey(new Date(now.getTime() - DAY_MS))`로 만든다.
- 두 키 모두 기존 `lib/dateKst.ts`의 함수 하나로 만들므로 `features/records`의 날짜 유틸에 기대지 않는다.
- 판정은 `yyyy-MM-dd` 문자열 비교로 한다. `date < yesterdayKey`이면서 `date.slice(0, 7) !== todayKey.slice(0, 7)`이고 `date.slice(0, 7) !== yesterdayKey.slice(0, 7)`이면 참이다.
- `now`를 인자로 받는 이유는 테스트가 고정된 시각으로 경계를 검증하기 위해서다.

`dailyStatsQuery(userId, date)`는 `isSettledStatsDate(date)`가 참이면 `staleTime: Infinity`와 `gcTime: 30 * 60 * 1000`을 옵션에 추가한다. 거짓이면 기본값 30초를 그대로 쓴다.

오늘과 어제를 짧게 두는 이유는 두 가지다.

- 자정을 넘긴 세션은 서버가 자정에서 둘로 나누기 때문에 어제 날짜 기록이 오늘 새벽에 생긴다.
- 강제 종료로 남은 세션은 서버가 나중에 확정한다.

이번 달 전체를 짧게 두는 이유는 응답 구조 때문이다. 일별 조회 응답에는 그 달 전체의 달력 도트 목록 `studiedDatesInMonth`가 함께 실려 오고, 기록 화면(`useRecordsData`)은 선택한 날짜의 응답에서 도트를 꺼내 찍는다. 이번 달 과거 날짜를 영구 캐시하면 오늘 세션을 마친 뒤 그 날짜를 눌렀을 때 오늘 도트가 사라진다.

- 매월 1일에는 어제가 지난달이라 지난달 전체가 짧은 수명으로 남는다. 그날 새로 생기는 어제 기록이 지난달 도트 목록을 바꾸고, 그 목록은 지난달 모든 날짜의 응답에 실려 오기 때문이다.
- 지난달 이전 날짜는 기록도 도트도 더는 바뀌지 않고, 달력을 넘나드는 동안 캐시가 살아 있어야 해서 gcTime을 30분으로 늘린다.
- 앱 실행 직후 마감(`useLaunchSessionRecovery`)의 `statsKeys.all` 무효화는 `Infinity`여도 stale로 표시하므로 그대로 동작한다.
- react-query는 stale 데이터를 먼저 보여 주고 뒤에서 다시 받으므로, 이번 달 과거 날짜를 누른 직후 응답이 도착하기 전까지 옛 도트가 잠깐 보였다가 채워지는데 이는 지금(staleTime 0)과 같은 동작이라 이번 변경으로 나빠지지 않는다.

`statsQueries.ts`의 낡은 주석도 손본다. staleTime 0을 전제한 설명과 탭 전환 시 조회 비용 언급을 현재 구조에 맞게 고친다.

### 3. 프로필 staleTime 정리

- `profileQuery`에 `staleTime: 5 * 60 * 1000`을 둔다.
- `LiveRoomEntry`의 `staleTime: Infinity` 오버라이드를 없앤다.
- 프로필 저장 PATCH는 전체 프로필을 돌려주므로 기존처럼 `setQueryData`로 바로 반영한다.

### 4. 세션 제출 성공 후 통계 무효화

`useStudyRoomSession`이 `lib/queryClient.ts`의 `queryClient`를 직접 import해서, `submitStudySession`이 성공한 직후 다음을 부른다.

```ts
void queryClient.invalidateQueries({ queryKey: statsKeys.all });
```

`useQueryClient()` 훅을 쓰지 않는 이유는 테스트 때문이다. 이 훅의 기존 테스트 3개 파일이 `QueryClientProvider` 없이 렌더하는데, 직접 import면 그 파일들을 손대지 않고 `queryClient.invalidateQueries`를 스파이하면 된다.

30초 기준에서는 브라우저 단독 모드에서 이 무효화가 없어도 결과가 같다. 60초 이상 세션이면 돌아온 시점에 이미 stale이기 때문이다. 그래도 두는 이유는 나중에 30초를 올리더라도 정확성이 그 상수에 묶이지 않게 하기 위해서다.

네이티브 웹뷰에서는 세션이 별도 문서라 이 무효화가 홈 탭에 닿지 않고, 홈은 `refetchOnWindowFocus`로 갱신된다. 세션 모달이 닫혀 홈 탭 웹뷰가 다시 드러날 때 `visibilitychange`가 실제로 발화하는지 실기기에서 확인한다. 발화하지 않으면 네이티브 신호 연동은 별도 티켓에서 다룬다.

### 5. 모바일의 사용되지 않는 QueryClient 정리

- `apps/mobile/app/_layout.tsx`에서 `QueryClient`, `QueryClientProvider`, `focusManager`와 그 `AppState` 연결 effect를 제거한다.
- `apps/mobile/package.json`에서 `@tanstack/react-query` 의존성을 빼고 `pnpm-lock.yaml`을 갱신한다.

## 하지 않는 것

- `periodStatsQuery`는 BY-459에서 만들어 뒀지만 화면 소비자가 없어 옵션을 정하지 않는다.
- 세션 복원과 마감 조회를 react-query로 바꾸지 않는다.
- 오프라인 persist는 웹뷰가 원격 URL이라 오프라인이면 화면 자체가 뜨지 않으므로 다루지 않는다.
- 도트를 선택한 날짜 응답에서 분리해 별도 조회로 만드는 구조 변경은 하지 않는다.
- 스트릭 쿼리의 키 분기는 손대지 않는다. 홈은 범위가 없고 기록은 주간 범위지만, 탭 웹뷰가 분리된 지금은 실제 비용이 없다.

## 테스트

- `queryClient.ts`: `getDefaultOptions().queries`가 `staleTime 30_000`, `retry 1`이다.
- `isSettledStatsDate`: 오늘, 어제, 이번 달 1일은 거짓이다.
- `isSettledStatsDate`: 지난달 말일과 두 달 전은 참이고, 매월 1일 기준으로는 어제와 그 전날을 포함한 지난달 전체가 거짓이며 두 달 전 말일은 참이다.
- `dailyStatsQuery`: 정착된 날짜면 `staleTime: Infinity`와 `gcTime: 30분`이 실린다.
- `dailyStatsQuery`: 정착되지 않은 날짜면 두 옵션이 없다.
- `profileQuery`: `staleTime: 5분`을 갖는다.
- `useStudyRoomSession`: 제출 성공 테스트에 `queryClient.invalidateQueries`가 `statsKeys.all`로 한 번 불리는지 추가한다.
- `useStudyRoomSession`: 제출 실패 시에는 무효화가 불리지 않는다.
- 모바일의 import 부재는 `pnpm typecheck`가 잡는다.

## 완료 조건

- 웹 `QueryClient` 기본값이 `staleTime: 30_000`, `retry: 1`이다.
- 같은 날짜 통계를 30초 안에 다시 마운트하면 요청이 나가지 않는다.
- 조회 실패 시 자동 재시도 1회 뒤 오류 상태가 된다.
- 어제보다 오래됐고 이번 달도 어제의 달도 아닌 날짜의 `dailyStatsQuery`는 `staleTime: Infinity`이고, 그 외 날짜는 기본값이다.
- `profileQuery`가 `staleTime: 5분`을 갖고 `LiveRoomEntry`에 오버라이드가 없다.
- 세션 제출이 성공하면 `statsKeys.all`이 무효화된다.
- 모바일에 `@tanstack/react-query` import가 남지 않는다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과한다.

## 남는 한계

- 앱 실행 직후 홈 웹뷰가 마감을 끝내기 전(상한 4초)에 기록 탭에서 어제보다 오래된 날짜를 먼저 조회하고, 하필 그 날짜에 마감 기록이 붙는 경우만 영구 캐시에 걸린다. 실사용에서 거의 없는 조합이라 수용한다.
- 서버 자동 확정이 며칠 뒤에 일어날 수 있는지는 백엔드에 확인한다.
- 기록 탭 웹뷰는 홈 탭의 마감 무효화를 받지 못한다. 위 조합이 그 결과다.
- 이번 달 날짜를 캐시한 채 자정을 넘겨 달이 바뀌면 그 캐시가 다음 판정부터 영구로 바뀌어, 달 중간에 받은 도트 목록이 gcTime 30분 동안 남을 수 있다. 드물고 30분이면 지워지므로 수용한다.
- 브라우저 단독 모드에서는 세션 제출 후 `statsKeys.all` 무효화가 정착된 날짜 캐시도 stale로 만들어 다음 조회 때 다시 받는다. 정확성에는 문제가 없고 요청이 조금 늘 뿐이라 수용한다.
