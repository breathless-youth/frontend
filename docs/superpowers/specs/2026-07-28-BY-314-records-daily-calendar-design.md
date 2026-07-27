# BY-314 기록(S5) 일별 기록·달력 연동 — mock 교체 설계

- 날짜: 2026-07-28
- 티켓: [BY-314](https://breathless-youth.atlassian.net/browse/BY-314)
- 화면 스펙: `docs/screens/SCR-S5-records.md`
- 선행 설계: `2026-07-26-session-state-model-and-contract-design.md` 8절, BY-313(홈 실데이터 연동)

## 목표

기록(S5) 화면의 **달력 도트·선택일 학습 요약(2×2 타일)·선택일 공부 기록 리스트**가 mock이 아닌
실제 서버 데이터(`GET /api/stats`)로 표시된다.

## 범위

### 포함

- `records.tsx`의 mock 블록 제거: `buildMockStats` · `MOCK_SESSION_TEMPLATES` ·
  `MOCK_CALENDAR_RECORD_DAY_COUNT` · `mockCalendarRecordDateKeys`
- `lib/statsApi.ts`의 `listStudySessionStats` + BY-313이 도입한 react-query 기반 조회 훅
- 첫 로딩 스켈레톤, 조회 실패 시 캐시 유지·오류 문구+재시도, 탭 포커스 재조회 (BY-313과 동일 방침)

### 범위 밖

- 연속 공부 배너·주간 체크 도트(`MOCK_STREAK_DAYS` · `mockWeekDoneDateKeys`) → **BY-315**. 이 mock은 남긴다.
- 미전송 로컬 세션 합산 → **BY-316**
- BE 합의(스트릭 10분 기준 등)의 서버 반영 — 반영 전까지 FE는 서버 값을 그대로 신뢰

## 상태 모델 (2026-07-28 사용자 확정)

화면 상태는 두 개뿐이며 서로 독립이다.

| 상태          | 의미                                                 | 바꾸는 이벤트                           |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| `selectedKey` | 선택된 날짜. 하단 요약·리스트가 유일하게 바라보는 값 | 달력 칸 클릭(`onSelectDate`)            |
| `month`       | 달력에 보이는 달                                     | ‹ › 화살표(`onPrevMonth`/`onNextMonth`) |

- **달 이동은 선택에 영향을 주지 않는다.** `selectedKey`는 진입 시 오늘로 초기화된 뒤 항상 어떤
  날짜를 갖는다("선택 없음" 상태는 존재하지 않음). 다른 달로 갔다가 돌아오면 이전 선택이 그대로
  하이라이트된다. `SCR-S5-records.md`의 "월 이동 시 선택일 처리 미확정" TODO를 이 정책으로 확정한다.
- 선택 하이라이트는 `selectedKey`가 보이는 달에 속할 때만 그린다(기존 `MonthCalendar` 동작 유지).

## 데이터 조회 설계

`GET /api/stats?userId&date`는 날짜 하나를 받아 그 날의 `sessions`와 그 달의
`studiedDatesInMonth`를 함께 내려준다. 이를 그대로 이용한다 — 월 전용 API를 새로 요청하지 않는다.

- 쿼리 키: `['stats', userId, date]` 하나로 통일한다.
- **조회용 날짜 계산**: 보이는 달에 `selectedKey`가 속하면 `date = selectedKey`(세션+도트를 한
  번에), 다른 달을 보는 중이면 `date = 그 달 1일`(응답에서 `studiedDatesInMonth`만 사용, `sessions`는
  무시).
- 하단 요약·리스트는 `['stats', userId, selectedKey]` 쿼리를 바라본다 — 다른 달을 보는 동안에도
  react-query 캐시로 이전 데이터가 유지되므로 별도 처리 없이 상세가 지속 표시된다.
- 달력 도트는 "현재 보이는 달" 쿼리의 `studiedDatesInMonth`를 바라본다.
- 탭 포커스 재조회·캐시 설정은 BY-313이 만든 QueryClient 기본값을 그대로 따른다.

### 달력 도트 판정 기준 (2026-07-28 사용자 확정)

스트릭과 동일하게 **하루 순공 10분 이상**. FE는 서버가 주는 `studiedDatesInMonth`를 그대로
찍는다(로컬 재판정 금지). 서버 반영 전까지 값이 기대와 다를 수 있으나 서버 값을 신뢰한다.

### 계약 확인 필요 (구현 착수 전 Swagger/실호출 확인)

- 세션이 없는 날짜로 조회해도 `studiedDatesInMonth`가 그 달 기준으로 채워져 오는지 (월 이동 조회의
  전제). 확인 결과를 티켓에 근거로 기록한다.

## 오류·로딩·빈 상태

- 첫 로딩: 스켈레톤/셔머 — Figma 정의 없음 → 디자인 토큰 기반 최소 구현(BY-313과 동일 접근).
- 조회 실패: 캐시가 있으면 캐시 유지, 표시할 데이터가 아예 없을 때만 오류 문구+재시도 버튼
  (voice-tone 톤 준수).
- userId 미확보(익명 등록 실패): 오류 상태와 동일 처리, 재시도 시 등록부터 재시도(BY-313과 동일).
- 선택일에 기록 없음: 기존 `EmptyDayNotice` 유지(성공 응답의 빈 리스트는 오류가 아니다).

## 테스트

- 조회용 날짜 계산(선택일이 보이는 달에 있을 때/없을 때) 단위 테스트
- 조회 훅: 성공 매핑·실패·빈 세션 케이스
- 기존 `recordsFormat` 테스트는 건드리지 않는다

## 작업 흐름

1. 티켓 설명 완성 — BY-313 형식, 이 문서의 확정 사항 반영
2. 브랜치: `feature/BY-314-기록-일별-달력-연동` — **`feature/BY-313-홈-실데이터-연동`에서 스택 분기**
   (워크트리 `worktrees/fe-by-314`)
3. TDD 구현: 날짜 계산 유틸 → 조회 훅 → `records.tsx` mock 교체 → `lint`/`typecheck`/`test`
4. BY-313 dev 머지 후 리베이스 → PR `[feat] BY-314 기록(S5) 일별 기록·달력 연동` (base: dev).
   313 머지 전에 구현이 끝나면 PR은 미리 열되 머지는 대기
5. 머지 후 Jira BY-314 완료 전환, BY-315/316 선행 관계 갱신
