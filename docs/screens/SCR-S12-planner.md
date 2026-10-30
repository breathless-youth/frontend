# SCR-S12 타임테이블(구 플래너)

## Purpose

하루를 한 장으로 본다. 왼쪽에 과목별 순공, 오른쪽에 타임테이블을 나란히 두는 조회 전용 2열이다. 사용자에게 보이는 이름은 타임테이블이고, 코드(`PlannerPage`·`usePlannerDay` 등)와 분석 이벤트(`planner_*`)는 예전 이름인 플래너를 쓴다. 기획 원본은 `.ai` `product/specs/BY-817-기록-탭-개선.md`와 `BY-949-홈-개편-과목-시작.md` §5, 조회 전용으로 바꾼 결정은 [BY-1057 설계](../superpowers/specs/2026-10-30-by-1057-handle-timetable-design.md)에 있다.

같은 내용을 홈의 `타임테이블` 탭(`features/home/HomeDayTimetable.tsx`)도 보인다. 홈 탭은 홈이 받은 그날 조회를 그대로 쓰고, 이 문서는 기록 탭에서 여는 전체 화면을 다룬다.

## 라우트와 진입

- `/planner?date=YYYY-MM-DD` — 탭 바 없는 전체 화면(`lib/nativeTabBar.ts`의 `FULL_SCREEN_PATHS`). `date`가 없거나 형식이 틀리거나(달력에 없는 날짜 포함) 미래면 오늘을 연다.
- 입구는 기록 탭 머리 오른쪽 원형 버튼 하나다(일간·주간 공통, `features/planner/PlannerPillButton.tsx`, 접근성 이름 `타임테이블`). 달력에서 고른 날을 열고(라우터 state `via: "records"`, 주소 `from=records`), 빠른 이중 탭에도 한 번만 이동한다(`useOpenPlanner`).
- 뒤로 가기는 SPA 스택이 있으면 한 칸 뒤로 간다. 스택이 비어 있으면(딥링크, 또는 셸이 웹뷰를 다시 띄워 복원한 문서) 늘 기록 탭으로 간다. 셸이 붙인 쿼리만 들고 가고 `date`·`from`은 뺀다.

## 하루와 오늘

- 하루는 **05:00 ~ 다음 날 05:00**이다(`features/planner/plannerDay.ts`의 `PLANNER_DAY_START_HOUR`). 열 때의 오늘도 홈과 같이 05시에 바뀐다(`plannerDateKeyOf(new Date())`). 새벽 0~5시의 공부는 전날에 이어진다.
- 이 기준은 홈, 이 화면, 세션 화면의 과목별 순공(`study-session/loadSessionSubjects.ts`)에 쓴다. 기록 탭과 서버 집계는 자정 기준 그대로라 새벽 공부가 있는 날은 두 화면의 순공이 다를 수 있다.
- 서버는 바꾸지 않았다. 일간 조회(`GET /api/stats?date=`)를 그 날짜와 다음 날짜 두 번 받아 앱이 조립한다(`usePlannerDay.ts` → `assemblePlannerDay`). 다음 날이 아직 오지 않았으면 그 조회는 생략한다. 05:00 경계에 걸친 세션·과목 구간은 창 안쪽 부분만 센다.
- 미래에는 보일 것이 없어 오늘까지만 넘긴다. 다음 날 꺾쇠는 오늘에서 비활성이고, 스와이프도 오늘에서 멈추며, 날짜 선택 시트는 오늘 뒤를 고를 수 없다.

## 화면 구성

- **상단 바**(`ScreenBackHeader` `center`): 왼쪽 뒤로 가기, 가운데 날짜(`9월 18일 금`)와 전날·다음 날 꺾쇠. 날짜를 누르면 날짜 선택 시트(`DayPickerSheet`)가 열린다. 본문 좌우 스와이프로도 날짜를 넘긴다.
- **머리**(`PlannerHead.tsx`): 왼쪽에 D-Day(설정했을 때만, 일수는 고른 날 기준), 오른쪽에 그날 순공과 `총 N`.
- **왼쪽 — 과목별 순공**(`PlannerSubjects.tsx`): 과목마다 색·이름·그날 순공(공부하지 않은 과목은 흐린 `0분`). 할 일과 관리 조작은 없다. 과목 없이 공부한 순공은 맨 아래 `과목 없음` 행이다. 그날 칠한 칸이 있으면 아래에 `휴식`(과목 없는 순공이 있으면 `과목 없음`도) 범례를 둔다.
- **오른쪽 — 타임테이블**(`PlannerTimetable.tsx`): 5시부터 다음 날 4시까지 24줄, 한 줄에 10분 칸 6개. 칸은 높이 18px이고 표 너비는 232px, 좁은 화면에서는 184px까지만 준다. 칸 안에서 실제 구간만큼만 칠하고, 색은 휴식(`--chart-rest`) > 과목 색 > 과목 없는 순공(`--primary`) 순으로 정한다. 자정 이후(0~4시) 시각 라벨은 흐리게 쓴다. 누를 곳이 없다.
- **빈 상태**: 기록이 없는 날은 안내 없이 과목 목록(전부 0분)과 빈 타임테이블만 보인다.
- **오류**: 그날 조회가 실패하면 `타임테이블을 불러오지 못했어요`와 다시 시도.

## 과목 목록

홈 과목 목록·타임테이블 탭과 같은 목록이다(`features/home/daySubjects.ts`의 `daySubjectItems`).

- 지금 과목은 홈과 같은 `loadLiveSubjects`(오늘 일간 조회에 실린 과목, 없으면 `GET /api/subjects`)로 열 때마다 받는다.
- 오늘은 지금 과목을 모두 보인다. 지난 날은 날짜별 과목 조회(`subjectsOnDayQuery`)로 그날 있던 과목만 보이고, 뒤에 지운 과목도 그날 있었으면 기록이 없어도 0분 줄로 보인다. 그 뒤에 만든 과목은 뺀다.
- 날짜별 조회가 실패하면 지금 과목을 모두 보이고, 지금 과목 조회까지 실패하면 그날 기록이 있는 과목만 보인다.
- 캐시에 남은 목록은 예전에 열었을 때의 것이라, 이번 마운트에서 두 조회를 다시 받을 때까지(`isFetchedAfterMount`) 스켈레톤을 보인다.
- 과목·할 일 추가·이름 변경·삭제·순서 변경, 할 일 체크, 시간 직접 입력은 이 화면에 없다. 과목 관리와 할 일은 홈, 수동 기록 추가는 홈 과목 줄과 기록 탭, 수정·삭제는 기록 탭에서 한다.

## 웹뷰 복원

iOS는 콘텐츠 프로세스가 죽으면 웹뷰를 지금 주소 그대로 다시 읽어 router state와 SPA 스택이 사라진다. 그래서 진입 이벤트의 `via`는 주소의 `from`으로도 읽는다(`plannerEntryOf`). Android의 재마운트는 `report-screen`의 복원 쿼리(`date`·`from`)로 같은 값을 되살린다(`lib/nativeScreenReport.ts`). `from`은 분석 경로에 실리지 않는다(정제 허용 목록 밖).

## 분석 이벤트

- `planner_opened {via: records | home_tab | unknown, is_today}` — 이 화면을 열 때 한 번, 홈 `타임테이블` 탭을 고를 때마다 한 번(`home_tab`).
- `planner_date_changed {delta, method: button | swipe | picker}` — 날짜를 넘길 때. `delta`는 옮긴 날 수다.
- 수동 기록 이벤트의 `entry`는 추가(`manual_record_add`·`manual_record_overlap_blocked`)가 `records`·`home`, 수정·삭제가 `records`다. 예전 `planner_button`·`planner_cell` 입구는 없앴다.
