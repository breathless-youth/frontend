# BY-1229 서버 거절 이유 문구 설계

- 티켓: 스토리 BY-1227, BE BY-1228, FE BY-1229
- 브랜치: `fix/BY-1229-reject-reason-copy` (base `origin/dev` `c429b424`)

## 왜 하는가

플래너에서 할 일을 다른 날로 옮길 때 그 날짜에 같은 반복 할 일이 있으면 앱은 `잠시 후 다시 시도해 주세요`를 띄웠다. 다시 해도 같은 결과라서 사용자는 앱이 고장 났다고 생각한다. 서버는 이유를 알지만 공통 코드로만 보냈고, 앱의 플래너 화면은 실패하면 참/거짓만 기억해 이유를 볼 수 없었다. 수동 기록은 409를 모두 `이미 기록이 있는 시간이에요`로 보여서, 측정한 기록을 고치려 할 때 엉뚱한 이유가 보였다.

## 정해진 것 (사용자 결정)

- BE가 전용 코드를 내려 준다(BY-1228). 앱은 상태 코드만으로 추측하지 않는다.
- 문구는 한 문장이고 ko·en·ja·zh-Hant에 모두 넣는다.

| 코드                               | 문구                                                                  | 목록 새로 받기 |
| ---------------------------------- | --------------------------------------------------------------------- | -------------- |
| `PLANNER_DUPLICATE_OCCURRENCE` 409 | `그 날짜에 같은 반복 할 일이 이미 있어요`                             | 아니오         |
| `PLANNER_TASK_LIMIT` 409           | `과목 하나에 할 일은 30개까지 넣을 수 있어요` (지금 `plan.taskLimit`) | 아니오         |
| `PLANNER_CARRYOVER_CHANGED` 409    | `그사이 할 일이 바뀌어 목록을 새로 불러왔어요`                        | 예             |
| `PLANNER_PAST_DAY` 400             | `지난 날의 계획은 바꿀 수 없어요`                                     | 아니오         |
| 404 (플래너 할 일)                 | `이미 지워진 할 일이에요`                                             | 예             |
| `MEASURED_RECORD_LOCKED` 409       | `측정한 기록은 고칠 수 없어요`                                        | 지금처럼       |

## 구조 (내 판단)

- `features/planner/plannerErrorCopy.ts`에 `plannerErrorCopy(error: unknown, fallback?: string): string` 하나를 둔다. 코드가 위 표에 있으면 그 문구, 상태가 404면 지워진 할 일 문구, 아니면 `fallback`(기본값 `common:errors.retryLater`)이다.
- 플래너 시트와 대화상자 6곳(`PlannerDateSheet`, `PlannerTaskSheets` 추가·메뉴, `PlannerRepeatSheet`, `PlannerRepeatScopeDialog`, `PlannerCarryoverDialog`)은 `failed: boolean` 대신 받은 오류를 `failure: unknown | null`로 들고 `plannerErrorCopy(failure)`를 보여 준다.
- 이름 바꾸기 시트는 `getErrorMessage`로 `plannerErrorCopy`를 넘긴다.
- 주간 드래그 이동은 토스트에 `plannerErrorCopy(error, t("week.moveFailed"))`를 쓴다.
- `usePlannerPlanMutation`은 지금 409에서만 목록을 다시 받는데 404에서도 다시 받는다. 가져오기(`usePlannerCarryover`)도 409·404면 목록을 다시 받는다.
- 수동 기록은 `useManualRecordMutations`가 409 중 `MEASURED_RECORD_LOCKED`를 `"locked"`로 구분하고, 폼이 그 문구를 보여 준다.
- BE 코드가 dev에 올라오기 전에도 404 처리는 바로 동작하고, 나머지는 코드가 들어오는 순간 동작한다.

## 하지 않는 것

- 수동 기록 400 사유, 그룹 쪽 낮은 위험 항목, 목표 설정 시트(`PlannerGoalSheet`)와 견본(`PlannerSample`)은 바꾸지 않는다.
- 서버 메시지를 그대로 보여 주지 않는다(다른 언어 화면에 한국어가 나온다).

## 구현 순서와 테스트

1. `plannerErrorCopy` 단위 테스트: 코드 5개와 404, 알 수 없는 코드, `ApiError`가 아닌 오류, `fallback` 인자.
2. `PlannerDateSheet`: 이동 실패가 `PLANNER_DUPLICATE_OCCURRENCE`면 그 문구가 보이고 `잠시 후 다시 시도해 주세요`는 없다(신고된 경로 그대로).
3. 주간 드래그 이동: 같은 코드로 실패하면 토스트가 그 문구다.
4. `PlannerTaskSheets` 추가가 `PLANNER_TASK_LIMIT`, 메뉴 삭제가 404면 각 문구.
5. `PlannerRepeatSheet`·`PlannerRepeatScopeDialog`는 `PLANNER_PAST_DAY`, `PlannerCarryoverDialog`는 `PLANNER_CARRYOVER_CHANGED`면 각 문구와 목록 다시 받기.
6. `usePlannerPlanMutation`: 404에도 플래너 목록을 무효화한다.
7. 수동 기록: `MEASURED_RECORD_LOCKED`면 `측정한 기록은 고칠 수 없어요`, 다른 409는 지금 문구 그대로.
8. 전체 lint·typecheck·test, 4개 언어 카탈로그 검사.
