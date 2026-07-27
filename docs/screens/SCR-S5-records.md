# SCR-S5 기록

## Purpose

FocusOn 모바일 앱의 기록 탭이다. 사용자가 "내가 얼마나 꾸준히, 얼마나 집중해서 공부했는지"를 되돌아보는 화면으로, 위에서 아래로 **연속 공부 배너(주간 체크 도트) → 월 달력(기록 도트) → 선택한 날짜의 학습 요약 2×2 → 그 날짜의 공부 기록 리스트** 순서로 쌓인다.

달력에서 날짜를 선택하면 그 아래 요약과 리스트가 해당 날짜 기준으로 갱신되는 구조다. V1.0에서는 통계 고도화(히트맵·주간/월간 추이·정렬 토글)를 하지 않는다 — 그것들은 전부 M2+ 범위다(`.ai/product/user-flow.md` S5 행, `.ai/product/design.md` "S5 기록 구조").

## Source Of Truth

- Figma file: **FocusON V1.0 Design**
- Figma file URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=65-553
- Figma frame: `S5 · 기록 (스크롤 전체 펼침)` — 402×**1087**(뷰포트 874가 아니라 스크롤 전체를 펼쳐 그린 프레임이다)
- Figma node: **`65:553`** (Screens — iOS 페이지 `14:4` 하위, `get_metadata`로 직접 확인)
- 이 화면에서 쓰는 Figma 컴포넌트 노드:
  - `Record / Week Dot` = `46:101` (Done · Today)
  - `Record / Calendar Cell` = `46:122` (Default · Dotted · Selected · Today · Muted)
  - `Record / Summary Tile` = `46:131` (Accent · 기본)
  - `Record / Session Item` = `46:149`
  - `Chip / Event Tag` = `46:93`
  - `Navigation / Tab Bar` = `36:101` / `Navigation / Tab Item` = `35:46`
  - `iOS / Home Indicator` = `36:25`
  - `illust/flame` = `32:66`, `icon/chevron-left` = `32:39`, `icon/chevron-down` = `32:42`, `icon/chevron-right` = `32:36`, `icon/check-sm` = `32:33`
- .ai 근거 문서:
  - `.ai/product/design.md` — "V1.0 최종 확정"의 **S5 기록 구조** 행, "확정 사항(2026-07-24)"의 **기록 달력** 행, "인터뷰 6차 확정"의 **달력 상세** 행
  - `.ai/product/voice-tone.md` — §2 표기 규칙(시간 길이·시각 범위·날짜·집중률 2형식·연속 공부), §4 **기록 (S5)** 표준 문구
  - `.ai/project/glossary.md` — 순공시간·총 공부 시간·집중률·연속 공부·공부 횟수·공부(세션 단위)·비집중·일시정지 노출 표기
  - `.ai/product/mvp-scope.md` — 세션 상태 모델(일시정지 벽시계 별도 집계)
  - `.ai/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — 화면 꺼짐 → 일시정지 합산, 기록 정렬 최신순 고정, 뱃지 축약 표기
  - `.ai/product/user-flow.md` — S5 행(날짜 선택 → 해당 날짜 기록, M2+ 이관 항목)
- Ownership: `frontend/docs/screen-ownership.md` — **`apps/mobile` 소유**(앱 셸, 신규 탭)
- 담당 앱: `apps/mobile` → `app/(tabs)/records.tsx` (신규) + `app/(tabs)/_layout.tsx` 탭 등록

Figma가 이 화면의 시각적 SSOT다. 구현 전 `get_design_context`로 `65:553`을 반드시 다시 읽고, 절대 좌표(`absolute` + `top/left`)를 그대로 베끼지 말고 세로 스크롤 + Flexbox 구조로 매핑한다.

## Ownership Boundary

- 이 화면은 **읽기 전용 기록 조회**만 한다. 세션 시작·타이머·카메라·Vision·상태 감지 로직을 이 화면에 넣지 않는다(그 영역은 `apps/web`이 WebView로 제공 — ADR 0001).
- 세션 아이템을 눌렀을 때의 상세 화면은 `apps/web`의 S4(공부 결과)와 **다른 화면일 수도, 같은 화면일 수도 있다 — 현재 미정**(아래 Interaction Contract 참조). 이 화면에서 결과 화면을 새로 그리지 않는다.
- V1.0 범위 밖(히트맵·주간/월간 추이 차트·정렬 토글·랭킹·소셜)을 추가하지 않는다.

## Current Figma Structure

`get_metadata` + `get_design_context`로 실제 확인한 트리다(추측 없음). 좌표는 402폭 기준, 좌우 여백 20 → 콘텐츠 폭 362.

```text
S5 · 기록 (스크롤 전체 펼침)  (402×1087, bg/base)
  ※ 이 프레임에는 iOS / Status Bar 인스턴스가 없다 (스크롤 콘텐츠만 펼쳐 그림)
  "기록"                              (x20 y40, 24px Bold, text/primary)
  streak-banner                        (x20 y82, 362×142, bg/layer-1, border/default 1px, r20, p18, gap16)
    head (gap 12)
      illust/flame                     (38×44)
      text (gap 3)
        "12일 연속 공부 중"             (17px Bold, text/primary)
        "내일도 10분만 하면 이어져요"    (13px Regular, text/secondary)
    week (space-between, 7칸)
      day × 7 (gap 5)
        Record / Week Dot (28×28, r999)
          Done  = brand/primary 채움 + 화이트 icon/check-sm(13)
          Today = bg/base + brand/primary 2px 링 + 날짜 숫자(12px Bold, brand)
        요일 라벨 "일 월 화 수 목 금 토" (11px, text/tertiary / 오늘은 brand·Medium)
  calendar-card                        (x20 y248, 362×250, bg/layer-1, border/default 1px, r20)
    nav-prev  (32×32 r999, 배경 #eff1f4 — 변수 미바인딩) + icon/chevron-left
    nav-next  (32×32 r999, 배경 #eff1f4) + icon/chevron-left(180° 회전)
    "2026년 7월"                        (16px Bold, 가운데)
    요일 헤더 "일~토"                    (12px Medium, text/tertiary, 셀 폭 46)
    Record / Calendar Cell × N          (46×44, 셀 간격 x+47 / y+33)
      Default  = 날짜(15px Regular, text/primary) + 도트 자리(투명)
      Dotted   = 날짜 + brand 도트 4px         ← 기록이 있는 날
      Selected = brand/primary 채운 30px 원 + 흰 숫자(15px SemiBold)
      Today    = brand/primary 1.5px 링 + brand 숫자
      Muted    = 날짜(text/disabled) + 도트 없음  ← 미래 날짜
  "7월 24일 학습 요약"                  (x20 y522, 17px Bold, text/primary)
  Record / Summary Tile × 4            (176×66, r16, bg/layer-1, p 14/12, gap 4 — 2×2)
    [0,0] "순공시간"  / "4시간 18분"  (값 18px Bold, **brand/primary** = Accent 변형)
    [0,1] "총 공부 시간" / "5시간 40분" (값 18px Bold, text/primary)
    [1,0] "집중률"    / "76%"
    [1,1] "공부 횟수"  / "3회"
    (라벨은 전부 12px Medium, text/secondary)
  "공부 기록"                           (x20 y703, 17px Bold) + sort "최신순"(13px, text/secondary) + icon/chevron-down
  Record / Session Item × 3            (362 폭, py10, 사이에 1px hairline #eff1f3 — 변수 미바인딩)
    좌측 info (gap 4)
      순공시간 값        "1시간 38분"          (17px Bold, text/primary)
      메타              "08:55 – 11:02 · 총 2시간 7분" (13px Regular, text/secondary)
      tags (gap 6)      Chip / Event Tag × N  (state/distract-subtle 배경, state/distract-text 텍스트,
                                               도트 5px, 11px Medium, r7, px8 py3)
    우측 focus (gap 8)
      "집중률"(11px, text/tertiary) / "77%"(20px Bold, brand/primary)
      icon/chevron-right (7×12)
  Navigation / Tab Bar                 (y989, 402×77, 기록 활성)
  iOS / Home Indicator                 (y1066)
```

Figma 예시 데이터(그대로 쓰지 말 것 — 실데이터로 대체): 연속 12일째, 주간 도트 일~~금 Done·토(25일) Today, 2026년 7월, 24일 선택·25일 오늘·26~~31 미래 비활성, 요약 4시간 18분/5시간 40분/76%/3회, 세션 3건.

## Content

**모두 `.ai/product/voice-tone.md`에서 그대로 인용했다 — 의역 금지.**

| 위치                         | 문구                                                                      | 근거                                                        |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 화면 타이틀                  | `기록`                                                                    | Figma / 탭 라벨과 동일                                      |
| 연속 공부 배너 타이틀        | `{N}일 연속 공부 중`                                                      | voice-tone §2 "연속 공부" · §4 기록                         |
| 연속 공부 배너 서브          | `내일도 10분만 하면 이어져요`                                             | voice-tone §4 기록                                          |
| 요일 라벨                    | `일 월 화 수 목 금 토`                                                    | Figma                                                       |
| 달력 헤더                    | `{YYYY}년 {M}월`                                                          | Figma                                                       |
| 요약 타이틀                  | `{N}월 {N}일 학습 요약`                                                   | voice-tone §2 날짜 표기                                     |
| 요약 타일 라벨               | `순공시간` / `총 공부 시간` / `집중률` / `공부 횟수`                      | glossary 노출 표기                                          |
| 리스트 섹션 타이틀           | `공부 기록`                                                               | Figma                                                       |
| 정렬 라벨                    | `최신순` (V1.0 고정)                                                      | voice-tone §4 기록 · design.md 6차 확정                     |
| 세션 메타                    | `HH:MM – HH:MM · 총 {시간 길이}`                                          | voice-tone §2 세션 시각 범위(24시간제, 엔대시 `–`)          |
| 세션 우측 지표               | `집중률` + `{N}%`                                                         | glossary "집중률 노출 2형식" — 지표 라벨 형식은 `집중률 N%` |
| 이벤트 칩(축약형)            | `자리 이탈 {N}회` · `휴대폰 {N}회` · `기기 조작 {N}회` · `일시정지 {N}회` | voice-tone §4 기록 "기록 뱃지" · glossary 축약 규칙         |
| 선택한 날짜에 기록이 없을 때 | `이날은 기록이 없어요` + `기록이 있는 날에는 점이 표시돼요`               | voice-tone §4 기록 "빈 날"                                  |

**시간 길이 표기 규칙**(voice-tone §2, 전 화면 공통): 1시간 이상 → `N시간 M분`(M=0이면 `N시간`) · 1시간 미만 → `M분` · 1분 미만 → `S초`. 진행 중 타이머의 `HH:MM:SS` 규칙은 **이 화면에 적용하지 않는다**(기록은 전부 한글 길이 표기다 — Figma도 동일).

**금지 표현**: `화면 꺼짐`(2026-07-26 삭제된 라벨 — `일시정지`로 통합), `딴짓`·`감시`·`적발`, `순집중`·`찐공부`.

## Data Contract

`frontend/packages/types/src/index.ts`에 이미 있는 타입을 재사용한다. 새 타입을 상상해서 만들지 않는다.

```ts
import type {
  StudySessionSummary, // 세션 1건
  StudySessionListResponse, // GET /api/stats 응답
  StudySessionEventCounts, // Record<"PHONE"|"DEVICE"|"AWAY"|"PAUSE", number>
} from "@focuson/types";
```

### 화면 요소 ↔ 필드 매핑 (확인된 것)

| 화면 요소                  | 필드                                                     | 비고                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 달력 기록 도트(Dotted 셀)  | `StudySessionListResponse.studiedDatesInMonth: string[]` | `YYYY-MM-DD` 배열. 이 배열에 있는 날 = Dotted                                                                                                                                                                                                   |
| 요약 타일 `순공시간`       | `StudySessionListResponse.totalFocusSec`                 | 초 → 한글 길이 표기                                                                                                                                                                                                                             |
| 요약 타일 `총 공부 시간`   | `StudySessionListResponse.totalStudySec`                 |                                                                                                                                                                                                                                                 |
| 요약 타일 `집중률`         | `StudySessionListResponse.focusRate`                     | 소수 1자리로 내려온다(`StudySessionResponse.focusRate` 주석)                                                                                                                                                                                    |
| 요약 타일 `공부 횟수`      | `StudySessionListResponse.sessionCount`                  | 값 표기 `N회`                                                                                                                                                                                                                                   |
| 리스트 아이템 순공 값      | `StudySessionSummary.focusSec`                           |                                                                                                                                                                                                                                                 |
| 리스트 아이템 시각 범위    | `StudySessionSummary.startedAt` / `endedAt`              | **UTC ISO-8601** → KST 변환 후 `HH:MM`                                                                                                                                                                                                          |
| 리스트 아이템 `총`         | `StudySessionSummary.studySec`                           |                                                                                                                                                                                                                                                 |
| 리스트 아이템 집중률       | `StudySessionSummary.focusRate`                          |                                                                                                                                                                                                                                                 |
| 이벤트 칩                  | `StudySessionSummary.eventCounts`                        | `AWAY`→`자리 이탈`, `PHONE`→`휴대폰`, `DEVICE`→`기기 조작`, `PAUSE`→`일시정지`. **0인 상태는 칩을 그리지 않는다**(키는 항상 내려온다 — 값 0으로). ⚠️ 이 값의 신뢰도에 상류 이슈가 있다 — 아래 "이벤트 카운트가 실제 횟수보다 작을 수 있다" 참조 |
| 리스트 정렬/그룹 기준 날짜 | `StudySessionSummary.statDate`                           | KST 기준 `YYYY-MM-DD`                                                                                                                                                                                                                           |

`longestFocusSec`도 응답에 있으나 **S5 화면에는 노출 요소가 없다**(홈 S1의 "최장 집중"용). 이 화면에서 쓰지 않는다.

### 백엔드 계약 미확인 — 상상 계약 금지

아래 항목은 `packages/types`에 대응 필드가 없다. **타입을 만들어 `packages/types`에 export하지 말고**, 화면 컴포넌트가 props로 받게 두고 임시값으로 렌더한 뒤 TODO 주석을 남긴다.

- **백엔드 계약 미확인 — 상상 계약 금지: `streakDays`** (연속 공부 배너의 `N일 연속 공부 중`). S1 홈 스펙(`SCR-S1-home.md`)에서도 동일하게 미확인으로 남아 있다 — 두 화면이 같은 필드를 쓰므로 계약 확정 시 함께 연결한다.
- **백엔드 계약 미확인 — 상상 계약 금지: 주간 체크 도트의 일자별 공부 여부**(일~토 7일). `studiedDatesInMonth`로 부분 대체할 수는 있으나, **주가 두 달에 걸치면(예: 7/27~8/2) 한 달치 응답만으로는 채울 수 없다**. 월 경계 주의 처리 방식은 미확정.
- **백엔드 계약 미확인 — 상상 계약 금지: `GET /api/stats`의 요청 파라미터**. 응답에 `sessions`(일 단위로 보임)와 `studiedDatesInMonth`(월 단위)가 함께 들어 있어, 날짜/월 중 무엇으로 스코프를 지정하는지 Swagger 확인이 먼저다. 달력 월 이동·날짜 선택이 각각 어떤 요청을 트리거하는지가 여기에 달려 있다.
- **백엔드 계약 미확인 — 상상 계약 금지: 주간 체크 도트 `Done` 판정 기준**. 연속 공부(스트릭) 인정 기준은 `design.md`에 **하루 순공시간 10분 이상**으로 확정돼 있으나, `studiedDatesInMonth`가 "기록이 1건이라도 있는 날"인지 "10분 이상인 날"인지는 명시돼 있지 않다. **달력 도트와 주간 체크 도트가 서로 다른 기준일 수 있다** — 확인 전까지 같은 배열로 둘 다 채우지 않는다.

### 알아둘 데이터 특성

- 자정(KST)을 넘긴 세션은 서버가 **날짜별로 분할해 저장**한다(`StudySessionResponse` 주석). 따라서 한 번의 공부가 두 날짜의 리스트에 나뉘어 보일 수 있다 — 앱이 다시 합치지 않는다.
- `studySec`에는 일시정지 시간이 포함되지 않는다(`StudySessionCreateRequest.studySec` 주석: `0 ≤ studySec ≤ (endedAt−startedAt) − PAUSE 합`). 그래서 **`endedAt − startedAt` 과 `총 공부 시간`이 다를 수 있다** — 리스트 아이템에서 시각 범위와 총 시간이 안 맞아 보여도 버그가 아니다(`mvp-scope.md` 일시정지 벽시계 별도 집계).

### ⚠️ 이벤트 카운트가 실제 횟수보다 작을 수 있다 (ⓐ버림 유지로 확정 — 2026-07-26 리더 확정)

**출처**: `spec-WG2` 제보(2026-07-26), `qa-WG1` 실측 재현. 이 스펙 작성자가 `apps/web/src/features/study-session/sessionTimeline.ts`에서 직접 확인했다.

세션 훅의 두 함수가 1초 미만 구간을 다르게 처리한다.

- `computeSessionTotals`(133행) — 모든 구간을 집계에 넣는다. 1초 미만 일시정지도 `pauseSec`에 들어가고, 그만큼 `studySec`에서 빠진다.
- `toStatusEvents`(178행) — `MIN_EVENT_MS` 미만 구간을 **버린다**(서버 계약이 0초 이벤트를 금지하기 때문. 함수 주석에 "1초 미만 구간은 버린다"고 명시돼 있다).

실측(900ms 일시정지 3회 / 20초 세션): 클라이언트 `pauseSec = 2`인데 전송된 PAUSE 이벤트는 **0건**. 결과적으로 **`eventCounts.PAUSE`가 실제 일시정지 횟수보다 작게(0까지) 내려올 수 있다.**

S5 화면에 미치는 영향:

1. 위 칩 규칙("0인 상태는 칩을 그리지 않는다")은 규칙 자체로는 맞지만, 이 상황에서 **"짧아서 기록되지 않은 것"과 "정말 일시정지가 없었던 것"이 화면에서 구분되지 않는다.**
2. 같은 아이템의 `studySec`은 이미 줄어 있으므로, 바로 위 항목이 설명하는 "시각 범위와 총 시간 불일치"가 **일시정지 칩 없이** 나타난다 — 사용자에게 설명 근거가 사라진다.
3. `toStatusEvents`는 상태 종류를 가리지 않고 버리므로 **`AWAY`·`PHONE`·`DEVICE` 칩에도 같은 하향 편차가 존재한다.** 이건 드문 일이 아니라 **특정 조작 패턴에서 확정적으로 재현된다**(`spec-WG2` 실행 검증, 2026-07-26):
   - **비집중 진입 직후 일시정지** — `transition`(82행)이 진행 중인 비집중 구간을 그 시점에 끊는다. 300ms 만에 끊기면 PHONE 이벤트가 소멸하고 PAUSE만 남는다.
   - **비집중 유형 전환**(예: `AWAY`→`PHONE`) — 서로 다른 상태라 구간이 쪼개지는데(`isSameSessionState`), 뒤 구간이 1초 미만이면 그 유형의 이벤트만 사라진다. **S5에서 가장 중요한 경로다.**
   - **세션 종료 직전 비집중 진입** — `closeSessionTimeline`(106행)이 마지막 구간을 종료 시각에 자른다. 500ms 남기고 진입하면 이벤트가 0건이 된다.

   앞서 "감지 판정 유지시간이 0.5~~1.5초라 발생 확률이 낮다"고 본 것은 **정상 진입/해제 경로에 한해서만 맞다**(해제 판정이 1.5~~2초라 자연스러운 비집중 구간은 그보다 짧아지기 어렵다). 위 세 경로는 유지시간을 우회하므로 그 추정이 적용되지 않는다.

4. 위 두 번째 경로에서 **칩 횟수는 줄어드는데 비집중에 쓰인 시간은 그대로 남는다**(`computeSessionTotals`가 `distractionMs`에 계속 더하므로). S5에는 유형별 분 단위 표시가 없으니 **`집중률`이 100% 미만인데(=순공 < 총 공부) 그 이유를 설명할 칩이 없거나 실제보다 적은 조합**으로 나타난다. **QA에서 이걸 렌더링 버그로 오인해 되돌리지 말 것** — 상류 데이터 특성이다.

**빌더 지시**: 이건 정책 결정이라 리더 보고로 올라가 있다(선택지 ⓐ버림 유지 + 서버 값만 신뢰 ⓑ1초 올림 ⓒ입력단 디바운스). **결정 전까지 어느 쪽으로도 구현을 확정하지 말 것.** S5는 서버가 준 `eventCounts`를 그대로 렌더하고(=현재 규칙 유지), 이 화면에서 값을 보정하거나 "일시정지 있었을 수도 있음" 같은 문구를 임의로 추가하지 않는다. 결정이 내려지면 이 절과 위 칩 규칙을 함께 갱신한다.

## Interaction Contract

| 사용자 행동                             | 결과                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 달력 날짜 탭(기록 유무 무관, 미래 제외) | 선택일 갱신 → `{N}월 {N}일 학습 요약`과 `공부 기록` 리스트가 그 날짜 기준으로 갱신                                                                                                                                                                                                                     |
| 달력 미래 날짜 탭                       | **비활성** — 아무 동작 없음(`design.md` 달력 상세: "미래=비활성")                                                                                                                                                                                                                                      |
| 달력 `‹` / `›` 탭                       | 이전/다음 달로 이동. 월 이동 시 선택일·요약·리스트 처리 방식은 **미정 — 리더/사용자 확인 필요**(선택 해제 vs 그 달 1일 선택 vs 마지막 기록일 선택)                                                                                                                                                     |
| 세션 아이템 탭                          | **미정 — 리더/사용자 확인 필요.** Figma에 `icon/chevron-right`가 있어 이동을 암시하지만, `design.md`의 V1.0 화면 인벤토리에 "기록 상세" 화면이 없다. S4(공부 결과)를 재사용하는지, 별도 화면인지 확정 전까지 **핸들러 자리만 만들고 아무 데도 이동하지 않는다**(존재하지 않는 라우트로 이동 시도 금지) |
| 정렬 `최신순 ⌄` 탭                      | **동작 없음.** V1.0은 최신순 고정이고 토글은 M2+다(`design.md` 6차 확정, `voice-tone.md` §4). 아래 Current Limitations의 Figma-wiki 괴리 항목 참조                                                                                                                                                     |
| 연속 공부 배너 탭                       | 정의 없음 — **비인터랙티브**로 구현한다(Figma에 셰브런·핫스팟 없음)                                                                                                                                                                                                                                    |
| 하단 탭 `홈`/`설정`                     | `홈`은 실제 라우트로 이동. `설정`(S6)은 아직 없으므로 라우트가 생기기 전까지 비활성(현재 `TabBar.tsx`가 이미 그렇게 방어하고 있다 — S5 추가 시 `record` 탭만 활성화 대상에 추가)                                                                                                                       |
| 화면 진입 시 기본 선택일                | **미정 — 리더/사용자 확인 필요.** Figma 예시는 오늘(25일)이 아닌 24일이 선택돼 있다. 자연스러운 기본값은 "오늘"이지만 문서에 규칙이 없다 — 임의 확정하지 말고 확인 후 반영(구현은 오늘로 두되 TODO 주석 명시)                                                                                          |

### 빈 상태

- **선택한 날짜에 기록이 없을 때**: 리스트 자리에 `이날은 기록이 없어요` + `기록이 있는 날에는 점이 표시돼요`를 표시한다(voice-tone §4 확정 문구). **다만 이 빈 상태의 시각 레이아웃(일러스트 유무·정렬·여백)은 Figma에 프레임이 없다** — 문구만 확정이므로 기존 리스트 영역에 중앙 정렬 텍스트 2줄로 최소 구현하고, 요약 타일은 0값(`0분`/`0%`/`0회`)으로 둘지 숨길지는 **미정 — 리더/사용자 확인 필요**.
- **기록이 아예 없을 때(설치 직후 첫 사용)**: **빈 상태 미정 — 확인 필요.** Figma에도 `.ai`에도 정의가 없다(Figma 컴포넌트 검색 결과 empty-state 컴포넌트 없음). 특히 **연속 공부 0일일 때의 배너 문구가 없다** — S1 홈의 0일 문구(`오늘 10분 집중하면 연속 공부가 시작돼요`)는 홈 스탯 카드용으로 확정된 것이라 이 배너에 그대로 복사하지 않는다.
- **로딩·에러 상태**: 디자인 없음 — **미정**. 구현은 인터페이스(스켈레톤/에러 자리)만 두고 동작은 TODO.

## Design Tokens Used

`get_variable_defs`(`65:553`)로 실제 바인딩이 확인된 토큰만 나열한다. 괄호 안은 `packages/design-tokens` 키 / NativeWind 클래스.

| Figma 변수              | design-tokens                 | NativeWind                                                              |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `bg/base`               | `colors.bg.base`              | `bg-bg-base` / `dark:bg-bg-base-dark`                                   |
| `bg/layer-1`            | `colors.bg.layer1`            | `bg-bg-layer1` / `dark:bg-bg-layer1-dark`                               |
| `border/default`        | `colors.border.default`       | `border-border-default` / `dark:border-border-default-dark`             |
| `brand/primary`         | `colors.brand.primary`        | `bg-brand-primary` · `text-brand-primary` / `dark:*-brand-primary-dark` |
| `text/primary`          | `colors.text.primary`         | `text-text-primary` / `dark:text-text-primary-dark`                     |
| `text/secondary`        | `colors.text.secondary`       | `text-text-secondary` / `dark:text-text-secondary-dark`                 |
| `text/tertiary`         | `colors.text.tertiary`        | `text-text-tertiary` (Light/Dark 동일 값)                               |
| `text/disabled`         | `colors.text.disabled`        | `text-text-disabled` / `dark:text-text-disabled-dark`                   |
| `state/distract`        | `colors.state.distract`       | 칩 도트                                                                 |
| `state/distract-subtle` | `colors.state.distractSubtle` | 칩 배경                                                                 |
| `state/distract-text`   | `colors.state.distractText`   | 칩 텍스트(라이트 `#b36100` — 색각 안전 규칙)                            |

- 반경: `radius.xl`(20 — 배너·달력 카드), `radius.lg`(16 — 요약 타일), `radius.full`(999 — 주간 도트·달력 선택 원·월 이동 버튼). **칩의 `r7`은 표준 스케일 밖** — 실측값 7px 그대로 사용(S1 선례와 동일 방침).
- 간격: `spacing.lg`(16 — 배너 내부 gap), `spacing.md`(12 — head gap), `spacing.xl`(20 — 좌우 화면 여백), `spacing.sm`(8), `spacing.xs`(4). 카드 패딩 18px·타일 패딩 14/12px은 스케일 밖 실측값.
- 타이포: Figma 실측값이 `packages/design-tokens`의 표준 스케일과 정확히 일치하지 않는다(24/17/16/15/13/12/11/20/18px, line-height도 상이). **S1과 동일하게 표준 스케일에 억지로 맞추지 말고 실측값을 그대로 쓴다.**

### 토큰 바인딩이 빠진 하드코딩 색 2개 (다크모드 위험)

Figma에서 **변수 바인딩 없이 하드코딩된** 값이 두 군데 있다(직접 확인):

1. 달력 월 이동 버튼 배경 `#eff1f4` — `bg/layer-2` 라이트값(`#f2f4f6`)과 근접하지만 **일치하지 않는다**.
2. 세션 아이템 사이 hairline `#eff1f3` — `border/default` 라이트값(`#e5e8eb`)과 **다르다**.

둘 다 다크모드에서 그대로 두면 밝은 회색이 어두운 배경 위에 남는다(S1의 두들 일러스트에서 실제로 발생한 것과 같은 종류의 문제 — `SCR-S1-home.md` Current Limitations 참조). **권장**: 월 이동 버튼 = `colors.bg.layer2`, hairline = `colors.border.default`로 토큰화. 단 값이 정확히 일치하지 않으므로 **임의 확정이 아니라 Review Checklist 항목으로 올린다** — 구현은 토큰으로 하되 이 문서의 근거를 주석으로 남긴다.

### 일시정지 칩 색 — 토큰 미확정

Figma 예시 데이터에는 **비집중(오렌지) 칩만 있고 `일시정지` 칩 인스턴스가 없다.** 그런데 `eventCounts.PAUSE`는 실제로 내려오고, `design.md` 6차 확정은 일시정지를 **회색 `#8B95A1`**(= `colors.text.tertiary`, `sessionStateColors.PAUSE`)으로 규정한다. 칩의 **배경**에 해당하는 "회색 subtle" 토큰은 `packages/design-tokens`에 없다(`state.distractSubtle`만 있음).

→ **미정 — 확인 필요**: 일시정지 칩 배경. 임시로 `colors.bg.layer2`를 쓰되 TODO 주석을 남기고, `design-tokens-sync`/디자이너에게 회색 subtle 토큰 추가 여부를 확인한다. 텍스트·도트 색은 `colors.text.tertiary`로 확정 적용 가능(`eventStatusColors.PAUSE`가 이미 그렇게 정의돼 있다).

## Components

`apps/mobile/components/`에 이미 있는 것:

- `TabBar` — 그대로 재사용. `active="record"`로 넘기고, **`record` 탭을 실제 라우트로 활성화**하도록 `disabled={id !== "home"}` 조건을 함께 수정한다(현재 홈만 활성).
- `IllustFlame` — 배너 불꽃 일러스트. Figma 실측은 38×44인데 현재 컴포넌트 기본값은 19×22이므로 **props로 크기를 넘긴다**(에셋을 새로 만들지 않는다).
- `IconChevronRight` — 세션 아이템 우측.

이번에 새로 추출/추가해야 하는 것:

- `IconChevronLeft`(`32:39`), `IconChevronDown`(`32:42`), `IconCheckSm`(`32:33`) → `components/icons.tsx`에 추가.
- `StreakBanner`, `MonthCalendar`(+ `CalendarCell` 5상태), `SummaryTile`(accent 변형), `SessionListItem`, `EventChip`.

**아이콘 규율(S1에서 확정된 것 — 반드시 따른다)**: Figma `download_assets`로 내보낸 **SVG의 path 데이터만** 옮긴다. PNG를 쓰지 않는다(캔버스 배경 `<rect>`가 합성돼 흰 네모로 보이는 문제가 2026-07-26에 실제 발생). 단색 아이콘은 `color` prop으로 런타임 틴팅하고 상태별 에셋 파일을 만들지 않는다.

## Implementation Notes For AI Agents

1. 이 문서 → `frontend/docs/screen-ownership.md` → `apps/mobile/CLAUDE.md` 순으로 먼저 읽는다.
2. Figma 노드 **`65:553`**을 `get_design_context`로 다시 확인한다(`figma:figma-design-to-code` 스킬 선행 호출 필수).
3. `apps/mobile/app/(tabs)/records.tsx`를 새로 만들고 `app/(tabs)/_layout.tsx`에 `<Tabs.Screen name="records" options={{ title: "기록" }} />`을 등록한다. **`app/(tabs)/index.tsx`(S1 홈)의 레이아웃을 건드리지 않는다** — 단, `TabBar`의 `record` 탭 활성화는 이 작업 범위다.
4. Figma 프레임이 1087px 세로로 펼쳐진 스크롤 프레임이므로 `ScrollView`(또는 리스트) + 고정 하단 `TabBar` 구조로 만든다. **절대 좌표를 그대로 옮기지 않는다.**
5. 이 프레임에는 iOS 상태바가 없다. `SafeAreaView`를 쓰고, 헤더 `기록` 타이틀의 상단 여백은 **이미 구현돼 있는 S1 홈(`insets.top + 15`, `app/(tabs)/index.tsx:195`)을 기준으로 맞춘다** — 같은 탭 그룹을 오갈 때 헤더가 튀지 않아야 한다. Figma의 y=40은 상태바가 빠진 스크롤 캔버스 좌표라 그대로 쓰면 어긋난다. (Figma상으로는 S6 설정 `67:722`가 상태바 아래 17px이라 스펙 초안은 `+17`을 지시했으나, **S6는 아직 구현체가 없어 기준으로 삼을 수 없다** — 최종 통일 값은 Review Checklist 확인 대상이다.)
6. **데이터는 정적 예시로 렌더한다.** `packages/types`에 없는 값(`streakDays`, 주간 도트)을 위해 새 타입을 만들어 export하지 않는다. 컴포넌트는 전부 props로 값을 받게 설계해 API 연동 시 데이터만 갈아끼우면 되게 한다.
7. **"화면 꺼짐" 라벨을 쓰지 않는다.** 2026-07-26에 `일시정지`로 통합됐다. 참고로 **Figma S4 프레임(`64:642`)에는 아직 "화면 꺼짐" 행이 남아 있다** — 알려진 Figma 반영 지연이고(`design.md` 백로그 7번) S5 스펙에는 영향 없지만, 컴포넌트를 공유하게 되면 이 라벨을 복사하지 않도록 주의한다.
8. 정렬 컨트롤은 **표시만 하고 누를 수 없게** 만든다(`Pressable`로 감싸지 말 것 — 눌리는 것처럼 보이면 안 된다).
9. 시간 포맷 함수(초 → `N시간 M분`)와 시각 포맷(UTC ISO → KST `HH:MM`)은 이 화면 전용 유틸로 `records.tsx` 옆에 co-locate 한다. 다른 화면(S1·S4)이 같은 규칙을 쓰게 되면 그때 `lib/`로 승격한다(미리 패키지로 빼지 않는다 — 과도한 추상화 금지).
10. 집중률 표시의 반올림 규칙이 확정되지 않았다(`focusRate`는 소수 1자리로 내려온다, Figma는 `76%`·`77%`로 정수). **정수 반올림으로 구현하고 TODO 주석을 남긴다.**
11. **S5 칩에 시간을 붙이지 않는다 — 횟수만 쓴다.** S5 뱃지는 축약형 `자리 이탈 N회`이고, `N회 · 시간` 형식(예: `2회 · 9분 40초`)은 **S4 공부 결과의 유형별 통계 행 표기**다(`voice-tone.md` §4가 기록/공부 결과를 나눠 규정, `glossary.md` "기록 리스트 뱃지는 축약형 허용, 통계 행 등 본 표기는 전체 라벨"). Figma `Record / Session Item`(`66:651`)에도 시간 표시가 없다. 이 혼동은 가정이 아니라 **실제로 발생한 사례가 있다**(2026-07-26, 다른 스펙 작성자가 S4 표기를 S5에 옮겨 적었다가 정정) — S4를 같이 보게 되면 특히 주의한다. 같은 이유로 **유형별 라벨도 S5에서는 축약형**(`휴대폰 N회`)이고 S4의 전체 라벨(`휴대폰 사용`)이 아니다.

## Accessibility Requirements

- 달력 셀의 **터치 타겟은 최소 44×44를 보장**한다. ⚠️ **Figma를 그대로 재현하면 이 요구를 만족할 수 없다**: 셀 프레임은 46×44인데 **행 간격이 33px**(y=76/109/142/175/208 — `65:641` 하위 실측)라 인접 행이 **11px씩 겹쳐** 있다. RN에서 겹침을 재현하면 뒤에 렌더된 행의 `Pressable`이 앞 행 하단 11px의 터치를 뺏는다. → **행을 44px로 쌓아 겹침을 없앤다**(가로는 열 간격 47px > 폭 46px라 문제없음). 그 결과 **달력 카드 높이가 Figma 250 → 약 352px로 커지는데, 이건 의도된 편차다**(Review Checklist에 디자이너 확인 항목으로 올려둠). 월 이동 버튼(32×32)은 **시각 크기는 유지하고 히트슬롭으로 44×44를 확보**한다.
- 세션 아이템(높이 약 85px)과 하단 탭(현재 `min-h-11` 적용됨)은 이미 44px 이상이다.
- **색상 단독 전달 금지**(`design.md` 상태 컬러 보조 규칙 ①): 이벤트 칩은 도트 색만이 아니라 **항상 텍스트 라벨과 함께** 표시한다(Figma도 그렇게 돼 있다 — 구현 시 도트만 남기지 말 것). 달력의 기록 도트도 도트만으로 의미를 전달하므로, 셀에 `accessibilityLabel`로 `{N}일, 기록 있음/없음`을 제공한다.
- 라이트 모드의 소형 오렌지 텍스트는 반드시 `state/distract-text`(`#b36100`)를 쓴다(`design.md` 보조 규칙 ②) — `state/distract`(`#ff8a00`)를 텍스트에 쓰지 않는다.
- 선택된 날짜·오늘 날짜는 원/링이라는 시각 표현 외에 `accessibilityState={{ selected }}`로 전달한다.
- 요약 타일·세션 아이템의 한글 라벨이 시스템 폰트 확대 시 잘리지 않도록 고정 높이(66/85px)를 하드코딩하지 말고 최소 높이 + 내용에 따른 확장으로 둔다.
- 주간 체크 도트의 체크 아이콘은 장식이 아니라 정보다 — 요일 라벨과 묶어 `accessibilityLabel`(예: `수요일, 공부함`)을 제공한다.
- ⚠️ **`text/tertiary`(#8b95a1)를 옅은 회색 배경 위 소형 텍스트로 쓰면 대비가 미달한다**(직접 계산·`qa-MG3` 교차 확인): `bg/layer-2`(#f2f4f6) 위 **2.76:1**, `bg/layer-1`(#f9fafb) 위 **약 2.94:1** — WCAG AA 소형 텍스트 4.5:1은 물론 3:1에도 못 미친다. 이 조합이 이미 두 군데 있다: ① 달력 요일 헤더(12px) ② Design Tokens 절에서 **임시로 제안한 일시정지 칩**(`text/tertiary` on `bg/layer-2`, 11px). **따라서 그 임시 조합은 최종안이 아니다** — 회색 subtle 토큰을 신설할 때 배경만 정하지 말고 **대비를 만족하는 텍스트 색을 함께 정해야 한다**(오렌지 칩이 `#b36100`을 쓰는 것과 같은 이유). 화면 횡단 이슈라 `design-tokens-sync`와 디자이너 결정이 필요하다 — 빌더가 이 값을 확정으로 취급하지 않는다.

## Current Limitations

- 실제 API 연동 없음 — 정적 예시 데이터로 렌더한다(Data Contract의 "백엔드 계약 미확인" 4건).
- **빈 상태**: 선택일 빈 상태는 문구만 확정(레이아웃 없음), 전체 빈 상태(첫 사용)와 연속 공부 0일 배너는 **정의 자체가 없다**.
- **로딩/에러 상태 디자인 없음.**
- **페이지네이션 없음**: Figma에도 "더보기"/무한 스크롤 UI가 없고, `StudySessionListResponse`에도 커서·페이지 필드가 없다. → **선택한 날짜의 세션 전체를 한 번에 렌더**하는 것이 현재 계약이다. 하루 세션 수가 아주 많을 때의 처리는 미정.
- **기간 필터 없음**: 기간을 바꾸는 수단은 **달력의 월 이동 화살표와 날짜 선택뿐**이다. 주간/월간 추이·히트맵·정렬 토글은 전부 M2+(`user-flow.md` S5 행, `design.md` 기록 달력 행).
- **Figma ↔ wiki 괴리(확인 필요, 임의 선택하지 않음)** — 정렬 관련 2건:
  1. **컨트롤 형태**: Figma에는 `최신순` + `chevron-down`(드롭다운처럼 보임)으로 그려져 있으나 `.ai`(design.md 6차 확정 · voice-tone §4)는 **V1.0 최신순 고정, 토글은 M2+**로 확정했다. → **wiki를 따라 비인터랙티브로 구현**하고(2026-07-26 기준 wiki가 최신), 셰브런을 시각적으로 남길지 제거할지는 디자이너 확인 대상.
  2. **리스트 정렬 방향 — Figma 원본 내부 모순**: 라벨은 `최신순`인데 예시 세션 3건은 08:55 → 13:10 → 16:20 **오름차순**으로 그려져 있다(`65:553` 하위 y=726/812/898 실측). Figma가 자기 자신과 어긋난 것이라 어느 쪽을 베낄지의 문제가 아니다. → **wiki와 라벨을 따라 내림차순(최신 세션이 위)으로 구현한다.** 그 결과 **스크린샷과 렌더 결과의 리스트 순서가 눈에 띄게 달라지는데 이건 정상**이다 — QA에서 버그로 오인하지 말 것.
- 하드코딩 색 2개(`#eff1f4`, `#eff1f3`)와 일시정지 칩 배경 토큰 부재 — 위 Design Tokens Used 참조.
- Figma 폰트는 Pretendard 미설치로 **Inter 임시 적용** 중이다(`design.md`). 코드에서 폰트를 임의로 교체하지 않는다.

## Review Checklist

- [ ] `GET /api/stats`의 요청 파라미터(날짜 스코프 vs 월 스코프) Swagger 확인 — 달력 월 이동·날짜 선택이 각각 어떤 요청을 트리거하는지 확정
- [ ] `streakDays`(연속 공부 일수) 계약 확정 — S1 홈과 공유
- [ ] 주간 체크 도트용 일자별 공부 여부 계약 확정, **월 경계 주(두 달에 걸친 주)** 처리 방식 확정
- [ ] `studiedDatesInMonth`의 정의 확인 — "기록 1건 이상"인지 "순공 10분 이상(스트릭 인정 기준)"인지. 달력 도트와 주간 체크 도트가 같은 기준인지도 함께
- [ ] **세션 아이템 탭 시 이동 대상 확정** — 기록 상세 화면이 V1.0 인벤토리에 없다. S4 재사용 여부 결정(결정 시 `design.md` 먼저 갱신)
- [ ] **전체 빈 상태(첫 사용) 디자인·문구 확정**, 연속 공부 **0일 배너 문구** 확정
- [ ] 선택일 빈 상태에서 요약 타일을 0값으로 둘지 숨길지 확정
- [ ] 화면 진입 시 **기본 선택일** 규칙 확정(오늘 vs 마지막 기록일) — Figma 예시는 오늘(25일)이 아닌 24일 선택
- [ ] **월 이동 시 선택일 처리** 확정(선택 해제 / 1일 / 마지막 기록일)
- [ ] **일시정지 칩의 회색 토큰 확정 — 배경만이 아니라 텍스트 색까지 함께**. `state/distractSubtle`의 회색 대응물이 없어 임시로 제안한 `text/tertiary` on `bg/layer-2` 조합은 **대비 2.76:1로 미달**이라 최종안이 될 수 없다. 같은 조합이 **달력 요일 헤더**(`text/tertiary` on `bg/layer-1`, 약 2.94:1)에도 있어 **화면 횡단 이슈**다 — `design-tokens-sync`와 함께 결정 필요(대비 계산: 이 스펙 작성자 / 교차 확인 `qa-MG3`)
- [ ] **Figma 달력 셀 행 간격 33px → 44px 정정 여부 디자이너 확인** — 현재 Figma는 44px 셀을 33px 간격으로 배치해 인접 행이 11px 겹친다(터치 타겟 44px와 양립 불가). 코드는 이미 44px로 구현해 **카드 높이가 원본 250 → 약 352px**다. Figma 원본을 고치지 않으면 다음 익스포트에서 같은 문제가 반복된다(하드코딩 색 2건과 동일 성격)
- [ ] **Figma 예시 세션 리스트를 최신순(내림차순)으로 뒤집어 라벨과 일치시킬지 디자이너 확인** — 현재 라벨 `최신순`과 예시 데이터 순서(오름차순)가 서로 어긋나 있다
- [x] **`eventCounts` 하향 편차 — ⓐ버림 유지로 확정**(2026-07-26 리더 확정). `toStatusEvents`/`computeSessionTotals`의 1초 미만 구간 처리 불일치가 `StudyEventStatus` 4종 전체에 남는다는 것을 알고 내린 결정 — 서버 값을 그대로 렌더하고 화면에서 보정하지 않는다. 코드 변경 없음.
- [ ] **Figma의 하드코딩 색 2건에 변수 바인딩 추가** — 월 이동 버튼 `#eff1f4`, hairline `#eff1f3`. 코드는 토큰으로 구현하더라도 Figma 원본을 고치지 않으면 다음 익스포트에서 같은 문제가 반복된다(S1 두들 일러스트와 동일 패턴)
- [ ] **정렬 컨트롤의 셰브런 처리** — V1.0에서 토글이 없으므로 셰브런을 남길지 제거할지 디자이너 확정
- [ ] **헤더 상단 여백을 S1과 통일할지 확인** — 이 스펙은 원래 S6(설정, `67:722` = 상태바 아래 17px)를 기준으로 삼았으나 **S6는 아직 구현체가 없고, 실재하는 S1 홈은 `insets.top + 15`**(`app/(tabs)/index.tsx:195`)다. 현재 S5 구현은 스펙대로 `+17`이라(`app/(tabs)/records.tsx:237`) **같은 탭 그룹을 오갈 때 헤더가 2px 튄다.** 비교 기준을 실재하는 S1으로 옮길지, Figma대로 화면별 값을 유지할지 확정 필요(지적 `qa-MG3`)
- [ ] 집중률 표시 반올림 규칙 확정(서버는 소수 1자리, 화면은 정수)
