# SCR-S4 공부 결과

## Purpose

공부(세션) 1회가 끝난 직후, 방금 무엇을 했는지 한 화면으로 정산해 보여주는 화면이다. 순공시간을 가장 크게 두고 집중률·총 공부 시간·시각 범위를 헤더에 모으고, 그 아래에 **공부 타임라인**(집중·비집중·일시정지 구간의 시간축 분포)과 **비집중 유형별 통계**(자리 이탈·휴대폰 사용·기기 조작 + 일시정지)를 둔다. "왜 내 시간이 이렇게 기록됐지?"에 대한 답을 이 화면이 담당한다(`ai-wiki/product/policies.md` §3 측정 정책).

세션 상태 머신(S3-1~S3-8)의 종착점이다. S3-7 종료 확인에서 사용자가 직접 끝냈든, S3-8 자동 종료로 끝났든 결과는 이 화면 하나로 수렴하고, CTA "확인"으로 홈(S1)으로 빠져나간다.

## Source Of Truth

- Figma file: FocusON V1.0 Design
- Figma file URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=64-534
- Figma frame: `S4 · 공부 결과` (402×874, Light)
- Figma node: **`64:534`** — Screens — iOS (V1.0) 페이지(`14:4`) 하위, 캔버스 x=4518. `get_metadata`(`14-4`)로 프레임 목록을 직접 enumerate해 확정했다(2026-07-26).
- ai-wiki 근거 문서:
  - `ai-wiki/product/design.md` — "인터뷰 6차 확정(2026-07-26)"의 **S4 헤더**·**S4 타임라인 범례** 행, "확정 사항"의 S4 결과 범위 행, 백로그 7번①
  - `ai-wiki/product/mvp-scope.md` — 세션 상태 모델(집중/비집중/일시정지), 일시정지 벽시계 별도 집계, 일시정지 N분 자동 종료
  - `ai-wiki/product/policies.md` — §3 측정 정책(화면 꺼짐·백그라운드 = 일시정지)
  - `ai-wiki/product/voice-tone.md` — §2 표기 규칙, §4 "공부 결과 (S4)", "종료·자동 종료 (S3-7 · S3-8)"
  - `ai-wiki/project/glossary.md` — 순공시간·총 공부 시간·집중률·비집중·일시정지 노출 표기
  - `ai-wiki/product/user-flow.md` — 핵심 플로우 다이어그램(S3-7/S3-8 → S4 → 홈), 화면 목록 S4 행
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — 화면 꺼짐 재분류, 일시정지 집계 기준
- Ownership: `frontend/docs/screen-ownership.md` — 스터디룸 화면 표에 `S4 공부 결과` 등재, **`apps/web`이 실제 구현체**
- 담당 앱: **`apps/web`** (신규 `apps/web/src/routes/ResultPage.tsx`). 모바일은 WebView로 로드한다(ADR 0001).
- 화면 그룹: **WG5** (`.claude/skills/focuson-screens-orchestrator/references/screen-groups.md`)

Figma가 이 화면의 시각적 SSOT다. 구현 전 `get_design_context`로 `64:534`를 다시 읽되, **절대 좌표(top/left)를 그대로 베끼지 말고** flex 레이아웃으로 매핑한다 — 아래 "알려진 Figma 반영 지연"에 따라 카드 높이가 달라지므로 절대 배치는 반드시 깨진다.

## 알려진 Figma 반영 지연 — "화면 꺼짐" → "일시정지" (⚠️ 최우선)

**Figma 원본을 그대로 베끼면 안 된다.** `ai-wiki/product/design.md` 백로그 7번①에 이 괴리가 명시돼 있다:

> **Figma 통합 파일 잔여 작업**: ① S4 통계·타임라인의 '화면 꺼짐' 행 → **'일시정지' 합산 표기(회색 범례)로 수정** (6차 결정 미반영 — 2026-07-26 확인 시점 기준 화면 꺼짐 행 잔존)

2026-07-26 조사 시점에도 잔존을 직접 확인했다. 이는 Figma와 wiki의 **상충이 아니라 알려진 반영 지연**이므로, 병기하지 않고 **확정된 wiki 표기를 적용**한다.

| 항목                  | Figma 현재 (구 모델)                         | **적용할 확정 표기 (2026-07-26)**                                                                         |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 통계 카드 4번째 행    | `화면 꺼짐` + 오렌지 도트(`64:642`~`64:646`) | **행 라벨을 `일시정지`로, 도트를 회색(`text/tertiary` #8B95A1)으로.** 비집중 3종 행과 시각적으로 구분된다 |
| 통계 카드 타이틀 합계 | `비집중 21분` (화면 꺼짐 3분 포함)           | **`비집중 18분`** — 일시정지는 비집중 합계에서 제외한다                                                   |
| 일시정지 행 노출 조건 | 항상 노출                                    | **일시정지가 1회 이상일 때만 노출** (`user-flow.md` S4 행: "일시정지 행(있을 때만)")                      |
| 타임라인 범례         | 2색(집중·비집중) — `64:572`                  | **3색: 집중(블루) · 비집중(오렌지) · 일시정지(회색, 있을 때만)** (`design.md` 6차 "S4 타임라인 범례")     |
| 타임라인 바 세그먼트  | 오렌지 세그먼트만 (`64:564`~`64:568`)        | **오렌지(비집중) + 회색(일시정지) 세그먼트 모두 렌더**                                                    |

`화면 꺼짐`이라는 라벨은 이 화면 어디에도 남기지 않는다 — `ai-wiki/project/glossary.md`에서 사용자 노출 표기가 **일시정지**로 통합됐고, 6차 인터뷰에서 "'화면 꺼짐' 라벨 제거"로 확정됐다. 수동 일시정지든 화면 꺼짐·백그라운드든 사용자에게는 동일하게 "일시정지"로 보인다.

## Ownership Boundary

- 이 화면은 **표시 전용(presentational)**이다. 세션 측정·상태 판정·서버 제출은 전부 WG1~WG4(세션 상태 머신, `apps/web/src/features/study-session/**`)의 책임이다. ResultPage는 이미 확정된 결과 값을 받아 그리기만 한다.
- **데이터를 보정하지 않는다.** 순공시간·총 공부 시간·집중률이 서로 안 맞아 보여도 이 화면에서 재계산하거나 클램프하지 않는다(값 계산의 SSOT는 세션 훅·백엔드).
- `apps/mobile`을 건드리지 않는다. 홈(S1)·기록(S5)은 모바일 소유다.
- 카메라·Vision·타이머 코드가 이 파일에 들어오면 경계 위반이다.
- **V1.0 범위 규율**: V1.0 화면 인벤토리에 멀티룸은 없다(S7~~S11은 V1.2~~V1.4). 이 화면은 싱글룸 결과다. `frontend/CLAUDE.md`·`apps/web/CLAUDE.md`·ADR 0001/0002가 LiveKit 멀티룸을 현재형으로 서술하더라도 그 문구를 이 화면에 끌어오지 않는다. 참고로 **S4에는 프라이버시 캡션이 없다**(Figma 확인) — 프라이버시 문구는 세션 화면(S3)·권한 화면(S2)·온보딩 G5에만 있다. 없는 캡션을 새로 만들어 넣지 않는다.

## Current Figma Structure

`get_metadata`(`14-4`) + `get_design_context`(`64-534`)로 확인한 실제 트리 (2026-07-26).

```text
S4 · 공부 결과  [64:534]  402×874, bg = bg/base
  iOS / Status Bar          [64:535]  ← OS 크롬. 웹은 그리지 않는다
  "공부 결과"                [64:552]  17px SemiBold, text/primary, 중앙 정렬, top 72
  btn-close                 [64:553]  36×36, r999, bg #f2f4f6(bg/layer-2), 우상단 (346,64)
    └ icon/close            [64:554]  13×13
  "순공시간"                 [64:556]  13px Medium, text/secondary, (20,122)
  "1시간 24분"               [64:557]  33px Bold, text/primary, letter-spacing -0.3, (20,141)
  badge                     [64:558]  bg brand/subtle, r999, padding 9/3, (199,152)
    └ "80% 집중"            [64:559]  12px SemiBold, brand/primary
  "총 공부 1시간 45분 · 21:03 – 22:48"  [64:560]  13px Regular, text/tertiary, (20,189)
  timeline-card             [64:561]  362×115, bg/layer-1 + border/default, r16, pad 16/16/14
    "공부 타임라인"           [64:562]  14px SemiBold, text/primary
    timeline-bar            [64:563]  330×12, r999, 바탕 = brand/primary(집중)
      └ Rectangle ×5        [64:564~568]  state/distract 세그먼트 (비집중)
                                          ⚠️ 회색(일시정지) 세그먼트 없음 — 반영 지연
    times                   [64:569]  "21:03" [64:570] / "22:48" [64:571], 11px Regular, text/tertiary
    legend                  [64:572]  gap 14
      leg [64:573] ● 집중    (6px dot + 11px Regular, text/secondary)
      leg [64:576] ● 비집중
                                          ⚠️ 일시정지(회색) 범례 없음 — 반영 지연
  distract-card             [64:622]  362×206, bg/layer-1 + border/default, r16, pad 16/16/6
    "비집중 21분"            [64:623]  14px SemiBold, text/primary
    row [64:624]  ● 자리 이탈   [64:627] / "2회 · 9분 40초" [64:628]
    divider [64:629]  330×1, #eff1f3
    row [64:630]  ● 휴대폰 사용 [64:633] / "2회 · 6분 12초" [64:634]
    divider [64:635]
    row [64:636]  ● 기기 조작   [64:639] / "1회 · 2분 8초"  [64:640]
    divider [64:641]
    row [64:642]  ● 화면 꺼짐   [64:645] / "1회 · 3분"      [64:646]
                                          ⚠️ 제거 대상 → 회색 도트 "일시정지" 행으로 교체
    (행 라벨 14px Regular text/primary · 값 13px Regular text/secondary · 도트 6px)
  Button / CTA "확인"        [64:647]  362×56, brand/primary, r16, 17px Bold white
                                        (컴포넌트 `Button / CTA` = 40:94, XL 362×56 = 결과 화면 사이즈)
  iOS / Home Indicator      [64:649]  ← OS 크롬. 웹은 그리지 않되 safe-area는 지킨다
```

Figma 프레임에는 **로딩·에러·빈 결과 상태가 존재하지 않는다** (Current Limitations 참고).

## Content

문구는 `ai-wiki/product/voice-tone.md`에서 그대로 인용한다 — 의역 금지.

| 위치                 | 문구                                                   | 출처                                                                                                                                |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 타이틀               | `공부 결과`                                            | voice-tone §4 공부 결과(S4)                                                                                                         |
| 헤더 라벨            | `순공시간`                                             | glossary 노출 표기                                                                                                                  |
| 헤더 값              | `{N}시간 {M}분` (시간 길이 규칙)                       | voice-tone §2                                                                                                                       |
| 집중률 필            | `{N}% 집중`                                            | voice-tone §2 집중률 — **필/헤더는 "N% 집중" 형식**("집중률 N%"는 지표 라벨 형식이라 여기 쓰지 않는다)                              |
| 헤더 메타            | `총 공부 {N}시간 {M}분 · {HH:MM} – {HH:MM}`            | design.md 6차 S4 헤더 · voice-tone §2 세션 시각 범위                                                                                |
| 타임라인 카드 타이틀 | `공부 타임라인`                                        | Figma(`64:562`) — voice-tone에 별도 규정 없음, Figma 표기 채택                                                                      |
| 타임라인 축 라벨     | 좌 `{HH:MM}` / 우 `{HH:MM}` (세션 시작·종료 벽시계)    | Figma(`64:570`/`64:571`)                                                                                                            |
| 타임라인 범례        | `집중` · `비집중` · `일시정지`(있을 때만)              | design.md 6차 S4 타임라인 범례                                                                                                      |
| 통계 카드 타이틀     | `비집중 {N}분` (비집중 3종 합계만)                     | voice-tone §4                                                                                                                       |
| 통계 행 라벨         | `자리 이탈` · `휴대폰 사용` · `기기 조작` · `일시정지` | glossary 노출 표기 — **통계 행은 축약형(`휴대폰 N회`)을 쓰지 않는다**(축약은 S5 기록 리스트 뱃지 전용, glossary "비집중 뱃지 축약") |
| 통계 행 값           | `{N}회 · {시간 길이}`                                  | design.md 6차 / voice-tone §4                                                                                                       |
| 비집중 0             | `비집중 없이 이어간 공부예요` (느낌표 없음)            | voice-tone §4                                                                                                                       |
| CTA                  | `확인`                                                 | voice-tone §4                                                                                                                       |

### 시간 길이 표기 규칙 (voice-tone §2 — 반드시 함수로 구현)

- 1시간 이상: `N시간 M분` (M=0이면 `N시간`)
- 1시간 미만: `M분` — 초가 중요한 상세 맥락(통계 행)은 `M분 S초`
- 1분 미만: `S초`

> `apps/mobile/lib/homeFormat.ts`의 `formatHoursMinutes`는 항상 `N시간 M분`을 반환해 위 규칙(M=0, 1시간 미만)을 만족하지 않는다. **그 함수를 참고 구현으로 삼지 말 것.** 또한 `apps/mobile`은 웹에서 import할 수 없으므로 `apps/web` 안에 순수 함수로 새로 만들고 단위 테스트를 붙인다.

### 시각 범위 표기

`HH:MM – HH:MM` (24시간제, 구분자는 en dash `–` 양옆 공백). 로컬 타임존(KST) 기준으로 `startedAt`/`endedAt`(UTC ISO-8601)을 변환한다.

## Data Contract

이 화면은 **기존 백엔드 계약으로 거의 전부 커버된다** — 상상 계약을 만들 필요가 없다. `frontend/packages/types/src/index.ts`의 `StudySessionResponse`가 세션 제출(`POST /api/study-sessions`)의 응답이며, 이 화면의 입력이다.

```ts
// packages/types/src/index.ts — 이미 존재. 새로 만들지 말고 그대로 import한다.
export type StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE";

export interface StatusEventPayload {
  status: StudyEventStatus;
  startedAt: string; // UTC ISO-8601
  endedAt: string; // UTC ISO-8601
}

export interface StudySessionResponse {
  id: number;
  userId: number;
  statDate: string; // 통계 귀속 날짜 (KST, YYYY-MM-DD)
  startedAt: string;
  endedAt: string;
  studySec: number; // 총 공부 시간
  focusSec: number; // 순공시간
  focusRate: number; // 집중률(%) = focusSec ÷ studySec × 100, 소수 1자리
  events: StatusEventPayload[];
}
```

### 화면 요소 ↔ 필드 매핑

| 화면 요소                     | 소스                                | 비고                                                                                       |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 순공시간 대형 값              | `focusSec`                          | 시간 길이 규칙으로 포맷                                                                    |
| `N% 집중` 필                  | `focusRate`                         | 서버가 소수 1자리로 준다 → **표시는 `Math.round`로 정수**. 화면에 소수점을 노출하지 않는다 |
| `총 공부 N시간 M분`           | `studySec`                          |                                                                                            |
| `HH:MM – HH:MM`               | `startedAt` / `endedAt`             | **벽시계**. 일시정지가 있으면 이 범위 > `studySec`                                         |
| 타임라인 바 축                | `startedAt` → `endedAt`             | 세그먼트 위치·너비를 이 벽시계 구간에 대한 비율로 계산                                     |
| 타임라인 오렌지 세그먼트      | `events` 중 `AWAY`/`PHONE`/`DEVICE` |                                                                                            |
| 타임라인 회색 세그먼트        | `events` 중 `PAUSE`                 | 있을 때만                                                                                  |
| 통계 `자리 이탈` 행           | `events` 중 `AWAY`                  | 횟수 = 이벤트 개수, 시간 = `endedAt−startedAt` 합                                          |
| 통계 `휴대폰 사용` 행         | `events` 중 `PHONE`                 |                                                                                            |
| 통계 `기기 조작` 행           | `events` 중 `DEVICE`                |                                                                                            |
| 통계 `일시정지` 행            | `events` 중 `PAUSE`                 | 0건이면 행 자체를 렌더하지 않는다                                                          |
| 통계 카드 타이틀 `비집중 N분` | `AWAY`+`PHONE`+`DEVICE` 시간 합     | **`PAUSE` 제외**                                                                           |

### 일시정지는 트리거를 구분하지 않는다 (WG4와 상호 확인, 2026-07-26)

수동 일시정지든 화면 꺼짐·백그라운드든 **전부 `StudyEventStatus`의 `"PAUSE"` 한 종류로 기록된다.** 계약에 `SCREEN_OFF` 같은 값은 없고, 만들지도 않는다.

WG4의 세션 화면에는 S3-8 문구 선택을 위한 클라이언트 내부 `PauseTrigger`(`apps/web/src/features/study-session/sessionState.ts`에 WG1이 이미 출하한 `"MANUAL" | "BACKGROUND"` — `"SCREEN_OFF"`는 존재하지 않는 값이니 인용하지 말 것)가 있지만 **제출 페이로드에 들어가지 않는다.** 따라서 S4는 `events[]`에서 `PAUSE`만 보면 되고, **결과 화면에서 두 트리거를 구분하는 것은 불가능하며 구분하려 시도하지도 않는다** — 사용자 노출 표기가 `일시정지` 하나로 통합됐으므로(`glossary.md`) 구분할 이유도 없다. 통계 행·타임라인 세그먼트·범례 모두 `PAUSE`를 단일 종류로 합산한다.

서버 검증 규칙상 이벤트는 **0초 불가 · 서로 겹침 불가 · 세션 구간 안**이 보장된다. 타임라인 세그먼트를 그릴 때 겹침 병합 로직을 방어적으로 넣을 필요가 없다(넣더라도 계약 위반을 화면에서 감추지 않도록 할 것).

**유형별 지속 시간은 서버가 따로 내려주지 않는다** — `events[].startedAt`/`endedAt` 차이를 클라이언트에서 합산해 만든다. (`StudySessionSummary.eventCounts`는 횟수만 있는 별도 타입이며 통계 조회 API `GET /api/stats`용이라 이 화면 입력이 아니다.) 이 집계는 화면 컴포넌트가 아니라 순수 함수(`apps/web/src/features/study-session/` 아래)로 분리하고 단위 테스트를 붙인다 — `apps/web/CLAUDE.md`의 "집중률 계산은 화면 컴포넌트에서 직접 구현하지 말고 순수 TS로 분리" 규칙.

### 백엔드 계약 미확인 — 상상 계약 금지

- **세션 단건 조회 API가 없다.** `packages/types`에도 `apps/web/src/features/study-session/`에도 `GET /api/study-sessions/{id}` 계약이 존재하지 않는다. 따라서 이 화면은 **세션 제출 응답을 전달받아서만** 그릴 수 있다. `GET` 엔드포인트를 상상해서 만들지 말 것.
- 결과적으로 데이터 전달 방식은 **react-router의 `location.state`**(또는 세션 컨텍스트)로 한다. `state`가 없으면 데이터를 지어내지 말고 홈으로 되돌린다(아래 Interaction Contract).
- **`location.state`는 같은 탭 새로고침에서 살아남는다.** react-router는 state를 `window.history.state.usr`에 실어 두고 브라우저가 이를 보존하므로, **새로고침만으로는 결과가 사라지지 않는다**(2026-07-26 QA 실측: `Page.reload` 후에도 `/room/:id/result`가 그대로 렌더됨). 데이터를 잃는 것은 **콜드 딥링크·새 탭·히스토리 유실** 경우에 한한다.
  - 따라서 **"새로고침 방어 UI"를 만들지 않는다** — 존재하지 않는 문제다.
  - 반대로 이 입구는 **우리가 넣지 않은 값이 들어올 수 있는 지점**이기도 하다(히스토리에 남은 옛 state, 조작된 state). `location.state`는 `unknown`으로 받아 **렌더에 실제로 쓰는 필드만 좁게 런타임 검증**하고, `as` 캐스팅으로 통과시키지 않는다. 검증 실패는 "데이터 없음"과 동일하게 처리한다.
- `studySec`이 일시정지를 제외한 값인지는 **서버 계약상 보장된다**(`StudySessionCreateRequest.studySec` 주석: `0 ≤ studySec ≤ (endedAt−startedAt) − PAUSE 시간 합`).
  - ✅ **제출 경로는 계약과 일치한다 — 활성 이슈 없음** (2026-07-26 확인, qa-WG5 F5로 재정정).
    - 호출부: WG1의 `computeSessionTotals`(`apps/web/src/features/study-session/sessionTimeline.ts`)가 PAUSE 구간을 제외한 `studySec`을 계산해 넘긴다.
    - 방어선: `buildSessionRequest`(`submitStudySession.ts:59-65`)의 클램프도 **PAUSE 인식으로 강화 완료**됐다(WG4 하드닝). 상한이 `floor((endedAt − startedAt − PAUSE 합) / 1000)`으로 계약과 동일해졌고, ms 단위에서 빼고 마지막에 한 번만 내림해 **이중 내림으로 1초가 깎이던 문제도 함께 해소**됐다(qa-WG4 F1).
    - 즉 호출부와 방어선이 모두 계약을 만족한다. **이 문단을 근거로 `submitStudySession.ts`를 다시 "고치지" 말 것.**
  - (아래는 정정 전 기록 — 감사 추적용 보존) ~~다만 현재 `apps/web/src/features/study-session/submitStudySession.ts`의 `buildSessionRequest`는 `studySec`을 벽시계 길이로만 클램프하고 PAUSE를 빼지 않는다. 이 이슈는 WG4가 자기 그룹의 상류 이슈로 인수했다(2026-07-26 상호 확인). 기본안은 호출부에서 `studySec` 계산 시 일시정지 시간을 제외하는 것에 더해 `buildSessionRequest`의 클램프 자체를 PAUSE 인식하도록 고치는 것이다. 같은 파일을 WG1도 만지므로 실제 수정 담당은 착수 전 조율 대상이다.~~
  - **S4는 이 값을 절대 보정하지 않는다.** 그대로 표시한다.
  - **QA 회부 규칙(회귀 관측 신호)**: 일시정지가 있었던 세션인데 헤더에서 `총 공부`가 `HH:MM – HH:MM` 범위와 같게 나오면 **S4 버그가 아니라 제출 경로가 깨졌다는 신호**다(제출 경로는 위와 같이 이미 계약을 만족하므로, 이 증상은 미수정이 아니라 회귀를 뜻한다 — 같은 문장이 `submitStudySession.ts`의 `buildSessionRequest` 주석에도 있다). `figma-qa-verifier`는 이 증상을 S4가 아니라 **WG4/WG1**으로 회부한다. (`SCR-S3-7-S3-8-session-exit.md`에도 동일 신호가 대칭으로 기재돼 있다 — 2026-07-26 WG4와 상호 확인.)

### 구현용 예시 데이터 (확정 모델로 재계산한 값)

Figma의 예시값은 **구 모델(화면 꺼짐 = 비집중)** 기준이라 그대로 쓰면 안 된다. 확정 모델로 옮기면 다음과 같다(화면 꺼짐 3분이 일시정지로 이동 → 총 공부에서 빠짐):

| 항목         | Figma 예시 (구 모델)  | **구현에 쓸 값 (확정 모델)**       |
| ------------ | --------------------- | ---------------------------------- |
| 순공시간     | 1시간 24분 (5040s)    | 1시간 24분 (5040s)                 |
| 총 공부 시간 | 1시간 45분 (6300s)    | **1시간 42분 (6120s)**             |
| 집중률       | 80%                   | **82%** (5040 ÷ 6120 = 82.35 → 82) |
| 시각 범위    | 21:03 – 22:48 (105분) | 21:03 – 22:48 (105분, 변화 없음)   |
| 비집중 합계  | 21분                  | **18분**                           |
| 자리 이탈    | 2회 · 9분 40초        | 2회 · 9분 40초                     |
| 휴대폰 사용  | 2회 · 6분 12초        | 2회 · 6분 12초                     |
| 기기 조작    | 1회 · 2분 8초         | 1회 · 2분 8초                      |
| 화면 꺼짐    | 1회 · 3분             | — (삭제)                           |
| 일시정지     | —                     | **1회 · 3분** (회색)               |

이 예시가 곧 **"벽시계 범위(105분) ≠ 총 공부 시간(102분)"의 실증**이다 — `design.md` 6차 S4 헤더 행의 "일시정지 제외로 시각 범위와 총 공부 시간은 다를 수 있다"가 화면에서 그대로 보이므로, 이 값 그대로 쓰면 표기 회귀를 QA가 잡아낼 수 있다. (재계산 값 자체는 디자이너 확인 대상 — Review Checklist 참고.)

## Interaction Contract

### 진입 경로 (WG4 → WG5)

| 출발                               | 트리거                                       | 동작                                                                                                                                 |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **S3-7 종료 확인** (`63:458`)      | 다이얼로그의 `공부 종료` 버튼                | 세션 종료 → `POST /api/study-sessions` 제출 → **`phase === "done"`에서만** S4로 이동. `StudySessionResponse[]`를 라우터 state로 전달 |
| **S3-8 자동 종료 안내** (`63:569`) | CTA `결과 보기` (voice-tone §종료·자동 종료) | 이미 저장된 결과를 들고 S4로 이동 — **여기서 새로 제출하지 않는다**                                                                  |

두 경로 모두 `user-flow.md` 핵심 플로우 다이어그램(`E → F`, `AE → F`)과 일치한다. 아래 전제는 `SCR-S3-7-S3-8-session-exit.md`(WG4)와 상호 확인해 확정한 계약이다(2026-07-26).

**S4가 절대 받지 않는 상태 — 이 화면에 방어 UI를 만들지 않는다:**

- **`phase === "submitting"` / `phase === "error"`** — 제출 중·제출 실패는 S3 쪽 상태다. S4는 제출 성공 이후에만 진입한다.
- **`phase === "unsaved"`** (URL에 `?userId=N`이 없어 서버에 저장되지 않은 세션) — **S4로 오지 않는다.** 저장되지 않은 세션을 "공부 결과"로 보여주면 사실과 다르기 때문이며, `useStudyRoomSession`에 실재하는 분기라 WG4 스펙에 명시돼 있다.
- **"저장 실패" 결과** — 자동 종료 경로에서 제출이 실패하면 S3-8 타이틀 `여기까지 기록을 저장했어요`가 거짓이 되므로, WG4가 `error` phase(재시도)로 빠지게 처리한다. S4는 어떤 경우에도 저장 실패 상태를 받지 않는다.

따라서 ResultPage에 "저장 실패" · "저장되지 않음" 배너나 재시도 버튼을 만들지 않는다 — **제출 실패의 사용자 대면 처리는 전적으로 S3 쪽(WG4 + WG1)의 책임**이며, WG4 스펙에 "실패를 삼켜서 S4로 넘기면 사용자에게 아무 안내도 남지 않으므로 재시도 경로를 S3에서 반드시 제공한다"로 대칭 기재돼 있다(2026-07-26 상호 확인).

### 이탈 경로

| 요소                       | 동작                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA `확인` (`64:647`)      | **홈(S1)으로 돌아간다** (`user-flow.md`: `F → A`). S4는 WebView 안에서 돌기 때문에 웹 라우터만으로는 모바일 홈 탭에 갈 수 없다 → 아래 "호스트 복귀" 참고                                          |
| 우상단 `X` 닫기 (`64:553`) | CTA `확인`과 **동일 동작**으로 구현한다. Figma에는 두 개가 다 있지만 `design.md` 6차 S4 헤더 행은 CTA "확인"만 규정한다 — 서로 다른 동작을 상상해 부여하지 않는다(⚠️ 확인 필요, Review Checklist) |

**호스트 복귀 처리** — 현재 `apps/mobile`에 WebView 브리지가 전혀 없다(`react-native-webview` 미설치, `postMessage` 규약 없음 — 2026-07-26 직접 확인). 따라서:

1. 복귀 동작을 `onConfirm` 같은 **단일 콜백/어댑터 한 곳**으로 모으고, 그 안에서 호스트 신호를 보낸다.
2. 브리지 규약이 정해지기 전까지 그 자리는 **TODO 주석 + 독립 브라우저 폴백**(`navigate("/")` → `HomePage`)으로 둔다.
3. 브리지 메시지 포맷을 임의로 확정해 모바일 쪽과 어긋나게 만들지 않는다 — **미정 — 리더/사용자 확인 필요**.

### 그 외

- 타임라인 바·범례·통계 행은 **탭 불가**(Figma에 인터랙션·chevron 없음). 상세 드릴다운을 만들지 않는다.
- **스크롤·CTA 고정**: Figma는 CTA를 `top 774`에 절대 배치했지만, 일시정지 행이 추가되면 통계 카드가 길어진다. 콘텐츠 영역은 스크롤, CTA는 하단 고정(sticky, safe-area 여백 포함)으로 구현한다.
- `location.state`가 비어 있거나 검증에 실패한 진입(**콜드 딥링크·새 탭·히스토리 유실** — 같은 탭 새로고침은 여기 해당하지 않는다, Data Contract 참고): 데이터를 지어내지 않는다. 홈(`/`)으로 리다이렉트하는 것을 기본으로 하되, **정확한 처리는 미정 — 리더/사용자 확인 필요**(디자인 없음).
- **다크 모드**: V1.0부터 라이트+다크 모두 지원, 시스템 설정을 따른다(`design.md` 확정 사항). 색은 전부 토큰으로 처리하고 하드코딩된 hex를 남기지 않는다.
- 세로 전용. S3-5/S3-6의 가로(거치) 모드는 세션 화면만 해당하고 **S4에는 가로 시안이 없다** — 가로 레이아웃을 상상해 만들지 않는다.

### 조건부 렌더 규칙 (Figma에 없는 상태 — 반드시 구현)

| 조건                         | 처리                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 일시정지 0회                 | 통계의 일시정지 행 숨김 + 타임라인 범례에서 `일시정지` 숨김 + 회색 세그먼트 없음                                     |
| 일시정지 1회 이상            | 통계 행 노출(회색 도트) + 범례 3색 + 회색 세그먼트                                                                   |
| 비집중 3종 모두 0            | 통계 카드 타이틀·행 대신 `비집중 없이 이어간 공부예요` (voice-tone §4). 타임라인은 전부 파랑, 범례는 `집중`만        |
| 비집중 0 + 일시정지 1회 이상 | 기본 구현: `비집중 없이 이어간 공부예요` 아래에 일시정지 행만 노출. **정확한 레이아웃 미정 — 리더/사용자 확인 필요** |
| 특정 비집중 유형만 0         | 해당 행만 숨긴다(0회 행을 "0회"로 남기지 않는다 — Figma에 0회 행 시안 없음)                                          |

## Design Tokens Used

`frontend/packages/design-tokens/src/index.ts`에 실제로 존재하는 키만 나열한다(2026-07-26 `design-tokens-sync` 반영본 확인).

| 용도                          | 토큰                                                                                     | Light / Dark                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 화면 배경                     | `colors.bg.base`                                                                         | `#ffffff` / `#101419`                          |
| 카드 배경                     | `colors.bg.layer1`                                                                       | `#f9fafb` / `#191f28`                          |
| 닫기 버튼 배경                | `colors.bg.layer2`                                                                       | `#f2f4f6` / `#333d4b`                          |
| 카드 테두리                   | `colors.border.default`                                                                  | `#e5e8eb` / `#333d4b`                          |
| 타이틀·값·행 라벨             | `colors.text.primary`                                                                    | `#191f28` / `#f9fafb`                          |
| `순공시간` 라벨·행 값·범례    | `colors.text.secondary`                                                                  | `#6b7684` / `#b0b8c1`                          |
| 헤더 메타·축 라벨             | `colors.text.tertiary`                                                                   | `#8b95a1` / `#8b95a1`                          |
| **일시정지 도트·세그먼트**    | `colors.text.tertiary` (= `sessionStateColors.PAUSE` = `eventStatusColors.PAUSE`)        | `#8b95a1` (6차 노트의 `#8B95A1`과 일치 확인됨) |
| 집중(타임라인 바탕·범례 도트) | `colors.brand.primary`                                                                   | `#1b64da` / `#3182f6`                          |
| 집중률 필 배경                | `colors.brand.subtle`                                                                    | `#e8f3ff` / `#1b2b4d`                          |
| 집중률 필 텍스트              | `colors.brand.primary`                                                                   |                                                |
| **비집중 도트·세그먼트**      | `colors.state.distract` (= `eventStatusColors.PHONE`/`DEVICE`/`AWAY`)                    | `#ff8a00` / `#ff9e1b`                          |
| CTA 배경 / 텍스트             | `colors.brand.primary` / `colors.text.onBrand`                                           |                                                |
| 카드 반경 · CTA 반경          | `radius.lg` (16)                                                                         |                                                |
| 필·도트·타임라인 바 반경      | `radius.full` (999)                                                                      |                                                |
| 카드 패딩·간격                | `spacing.lg`(16) · `spacing.md`(12) · `spacing.sm`(8) · `spacing.xl`(20, 화면 좌우 여백) |                                                |

**세션 오버레이 전용 값(집중 `#4593FC` · 비집중 `#FF9E1B` · 일시정지 `#8B95A1`)을 이 화면에 쓰지 말 것.** `design.md` 6차 "세션 오버레이 색" 행이 명시하듯 그 값들은 다크 오버레이(S3 세션 화면) 전용이고, S4는 일반 라이트/다크 화면이라 시맨틱 토큰(`state/focus`·`state/distract`)을 쓴다. Figma도 S4에서 `--state/distract` 변수를 참조한다(`64:564`).

### `apps/web`에 아직 없는 CSS 변수 (⚠️ 빌더 확인 필요)

`apps/web/src/index.css`의 `@theme inline`에는 현재 background/foreground/primary/muted/border만 있다. 이 화면에 필요한 다음 4종이 없다:

- `state/distract` (비집중 오렌지)
- `text/tertiary` (일시정지 회색 · 메타 텍스트)
- `bg/layer-2` (닫기 버튼 배경)
- `brand/subtle` (집중률 필 배경)

hex를 컴포넌트에 흩뿌리지 말고 `index.css`에 변수로 추가한다. `index.css`의 기존 관례(파일 상단 주석: "CSS는 TS를 import할 수 없어 값을 그대로 옮겨적는다")를 따라 `packages/design-tokens`의 값을 그대로 옮기고 출처 주석과 다크 오버라이드를 함께 넣는다. 값이 확실치 않으면 `design-tokens-sync`에 확인을 요청한다.

### 타이포 — 토큰 스케일 밖 실측값

Figma 실측값 중 `typography` 스케일에 없는 것이 많다. `SCR-S1-home.md`의 선례대로 **억지로 스케일에 맞추지 말고 실측값을 그대로 쓴다**.

| 요소               | 실측                         | 토큰 대응                                                         |
| ------------------ | ---------------------------- | ----------------------------------------------------------------- |
| 타이틀 `공부 결과` | 17px SemiBold                | `body.lg`가 17px이나 weight regular — 실측 사용                   |
| `순공시간` 라벨    | 13px Medium                  | 스케일 밖(`label.sm`=12 medium, `body.sm`=13 regular) — 실측 사용 |
| 순공 대형 값       | **33px Bold**, tracking -0.3 | 스케일 밖(`display.sm`=40, `heading.h1`=28) — 실측 사용           |
| 집중률 필          | 12px SemiBold                | `label.sm`=12 medium과 weight 차이 — 실측 사용                    |
| 헤더 메타          | 13px Regular                 | `body.sm` ✅                                                      |
| 카드 타이틀        | 14px SemiBold                | `label.md`=14 medium과 weight 차이 — 실측 사용                    |
| 통계 행 라벨       | 14px Regular                 | 스케일 밖 — 실측 사용                                             |
| 통계 행 값         | 13px Regular                 | `body.sm` ✅                                                      |
| 축 라벨·범례       | 11px Regular                 | 스케일 밖(`caption`=12) — 실측 사용                               |
| CTA                | 17px Bold                    | 실측 사용                                                         |

폰트는 Pretendard 미설치로 Figma가 Inter 임시 적용 중이다(`design.md`). 웹은 기존 `body` 폰트 스택을 유지하고 여기서 폰트를 교체하지 않는다.

### 토큰에 없는 값

- 카드 내부 구분선 `#eff1f3`(`64:629`/`64:635`/`64:641`)은 시맨틱 토큰에 없다(가장 가까운 `border/default`는 `#e5e8eb`). 다크모드 대응이 없는 하드코딩 hex이므로 **`border/default`로 대체**하고, 원본과의 미세한 차이는 QA에서 확인한다(Review Checklist).

## Components

`apps/web/src/components/ui/`에는 현재 `button.tsx`만 있다. 이번에 새로 만든다 — 단, **범용 컴포넌트로 미리 승격하지 않는다**(루트 CLAUDE.md "과도한 추상화 금지"). 우선 `apps/web/src/features/study-session/` 또는 `routes/` 옆에 co-locate 한다.

| 컴포넌트                                                              | 역할                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ResultPage`                                                          | 라우트 진입점 (`apps/web/src/routes/ResultPage.tsx`)                                              |
| `ResultHeader`                                                        | 타이틀 · 닫기 · 순공시간 · 집중률 필 · 메타 라인                                                  |
| `StudyTimelineCard`                                                   | 타임라인 바 + 축 라벨 + 3색 범례(조건부)                                                          |
| `DistractionStatsCard`                                                | 비집중 3종 행 + 일시정지 행(조건부) + 비집중 0 문구                                               |
| `formatDuration` / `formatClockRange` / `aggregateEvents` (순수 함수) | `features/study-session/` 아래. 시간 길이 규칙·시각 범위·이벤트 유형별 집계. **단위 테스트 필수** |

CTA는 기존 `src/components/ui/button.tsx` 패턴(`cva` variants, `cn` 헬퍼)을 확장해 쓴다. Figma 컴포넌트 `Button / CTA`(40:94)의 XL 사이즈(362×56)가 결과 화면 규격이다.

아이콘은 `icon/close`(`64:554`) 하나뿐이다. Figma에서 SVG로 내보내 쓰고, **PNG를 쓰지 않는다** — Figma의 PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 흰 네모로 보이는 문제가 S1 구현에서 실제로 발생했다(`SCR-S1-home.md` 구현 노트). 단색 아이콘이므로 `currentColor`로 틴팅한다.

## Implementation Notes For AI Agents

1. 이 문서 → `frontend/docs/screen-ownership.md` → `frontend/apps/web/CLAUDE.md` 순으로 먼저 읽는다.
2. `get_design_context`로 `64:534`를 다시 확인하되, **위 "알려진 Figma 반영 지연" 표를 항상 이 문서 기준으로 덮어쓴다.** Figma에 `화면 꺼짐` 행이 보여도 그대로 옮기지 않는다.
3. `apps/web/src/routes/ResultPage.tsx`를 새로 만들고 `App.tsx`에 라우트를 등록한다. 기본안은 형제 경로 **`/room/:id/result`**다.
   - **S4는 V1.0 세션 화면 중 유일하게 새 라우트를 만드는 화면이다.** S3-1~S3-8은 전부 기존 `/room/:id` 한 라우트 안의 프레젠테이션 상태이며(종료 확인은 모달, 자동 종료 안내는 같은 라우트의 상태), WG4가 새 라우트를 만들지 않는 것을 확인했다 — 구조적 충돌 없음(2026-07-26 상호 확인).
   - 다만 **최종 확정 권한은 `RoomPage` 프레젠테이션을 소유한 WG1/리더에게 있다.** 착수 전 확인하고, 확정되면 이 문서를 갱신한다.
4. `useStudyRoomSession`·`submitStudySession`을 **삭제하거나 다시 쓰지 않는다.** 이 화면은 그 결과(`StudySessionResponse`)를 소비만 한다.
5. `packages/types`에 새 타입을 추가하지 않는다. `StudySessionResponse`/`StatusEventPayload`/`StudyEventStatus`를 그대로 import한다.
6. 표시용 파생값(유형별 시간 합계·비집중 총합·타임라인 세그먼트 비율)은 컴포넌트 안에서 계산하지 말고 순수 함수로 분리 + 테스트한다.
7. 색은 전부 토큰 경유. `#ff8a00`·`#8b95a1` 같은 hex를 TSX에 직접 쓰지 않는다(`index.css` 변수로 올린 뒤 참조).
8. OS 크롬(`iOS / Status Bar` `64:535`, `iOS / Home Indicator` `64:649`)은 그리지 않는다. 대신 `env(safe-area-inset-top/bottom)`으로 여백을 확보한다 — WebView 안에서 실기기 상태바·홈 인디케이터와 겹치면 안 된다.
9. V1.0 범위 밖(로그인, 소셜, 랭킹, 공유, AI 리포트, 결과 저장/내보내기)을 추가하지 않는다. **결과 공유 버튼을 만들지 않는다** — 어느 문서에도 없다.
10. 미정 항목(호스트 복귀 브리지, state 없는 진입, 비집중 0 + 일시정지 조합 레이아웃)은 **인터페이스만 만들고 동작은 TODO 주석**으로 남긴다. 임의로 확정하지 않는다.
11. 스펙에 모호한 부분이 있으면 추측하지 말고 `wiki-figma-spec-writer`에 질문한다 — 즉시 답하고 이 문서를 갱신한다.

## Accessibility Requirements

- **색상 단독 전달 금지**(`design.md` 상태 컬러 보조 규칙 ①: "색상 단독 전달 금지(항상 점+텍스트)"). 타임라인 범례와 통계 행은 도트 + 텍스트 라벨을 항상 병기한다. 일시정지 회색도 예외 없다.
- **타임라인 바는 순수 시각 요소**다. `role="img"` + `aria-label`로 "집중 1시간 24분, 비집중 18분, 일시정지 3분" 같은 요약을 제공하거나, `aria-hidden`으로 감추고 아래 통계 카드가 정보를 전달하게 한다 — 둘 중 하나는 반드시 한다.
- **터치 타겟**: CTA `확인`은 56px로 충분하다. **닫기 버튼은 시각 크기 36px로 44px 미만**이므로, 시각 크기는 유지하되 히트 영역을 44×44 이상으로 확장한다(패딩 또는 `::before` 확장).
- **닫기 버튼의 접근 가능한 이름**: 아이콘만 있고 텍스트가 없으므로(`64:553`/`64:554`) `aria-label` 등으로 이름을 반드시 부여한다(WCAG 4.1.2). 다만 **`voice-tone.md`에 SR 전용 이름 규정이 없다** — 문구를 컴포넌트에 직접 쓰지 말고 문구 상수 모듈에 두고 "임의 적용, 확인 필요"로 표시한다(Review Checklist 항목). 선례: `RoomPage.tsx`의 `aria-label="심플 모드 전환"`.
- 숫자는 `font-variant-numeric: tabular-nums`로 정렬한다(voice-tone §2 타이머 표기 규칙의 tabular-nums 원칙 연장).
- **폰트 확대 대응**: 순공 대형 값(33px)과 집중률 필이 Figma에서 같은 줄에 절대 배치돼 있다. 확대 시 겹치지 않도록 flex + `flex-wrap`으로 두고, 필이 아래로 떨어져도 깨지지 않게 한다. 통계 행의 라벨/값도 좌우 양끝 정렬 시 긴 텍스트에서 겹치지 않게 `min-width: 0` + 줄바꿈 허용.
- 라이트/다크 양쪽에서 대비를 확인한다. 특히 라이트 모드의 소형 오렌지 텍스트는 `design.md` 보조 규칙 ②에 따라 `#B36100`(= `colors.state.distractText`)을 쓴다 — **다만 S4에서 오렌지는 도트에만 쓰이고 텍스트는 `text/primary`이므로 현재 시안에는 해당 사항이 없다.** 구현 중 오렌지 텍스트를 새로 만들면 이 규칙을 적용한다.
- 카드 타이틀(`공부 타임라인`, `비집중 N분`)은 시각적 제목이므로 적절한 heading 레벨을 부여한다(화면 타이틀 `공부 결과`가 `h1`).

## Current Limitations

- **Figma 원본이 6차 확정을 아직 반영하지 않았다** — 화면 꺼짐 행 잔존, 타임라인 범례 2색, 회색 세그먼트 없음. 이 문서가 우선한다(`design.md` 백로그 7번①, 액션 아이템 "선규 — Figma에 '화면 꺼짐→일시정지 합산' 시안 수정 반영" 미완료).
- **세션 단건 조회 API가 없다** — 라우터 state가 유일한 입력이다. 다만 `location.state`는 `history.state.usr`에 실려 **같은 탭 새로고침에서는 보존되므로 새로고침만으로 결과가 사라지지는 않는다**(2026-07-26 QA 실측). 복원 불가는 **콜드 딥링크·새 탭·히스토리 유실** 시에 한한다.
- **자정(KST) 분할 케이스가 미설계다.** `submitStudySession`은 `StudySessionResponse[]`(배열)를 반환하고, 자정을 넘긴 세션은 날짜별 2건으로 분할된다. 이때 S4가 무엇을 보여줄지(합산 1화면 / 2개 카드 / 첫 세션만) 어느 문서에도 없다 — **미정 — 리더/사용자 확인 필요**. 우선 배열의 전체를 합산하지 말고, 처리 방식이 정해질 때까지 단일 세션 렌더 + TODO로 둔다.
- **자동 종료(S3-8) 세션의 `endedAt` 기준이 미정이다.** WG4가 리더/BE에 에스컬레이션한 항목으로, 제출하는 `endedAt`을 **일시정지 시작 시각**으로 볼지 **자동 종료 판정 시각(일시정지 시작 + N분)**으로 볼지 확정되지 않았다. 어느 쪽이냐에 따라 **S4 헤더의 `HH:MM – HH:MM` 종료 시각이 N분만큼 달라지고**, 타임라인 축 길이와 마지막 회색 세그먼트의 표시 여부·길이도 함께 달라진다. **미정 — 리더/사용자 확인 필요.** S4는 받은 `endedAt`을 그대로 축으로 쓰고, 어느 기준인지 추측해 보정하지 않는다.
- **로딩·에러·빈 결과 상태 디자인이 없다.** 순공 0초/총 공부 0초 세션(즉시 종료)의 표시도 미설계 — `focusRate`가 0 나눗셈이 될 수 있으니 방어 코드는 넣되 문구를 상상하지 않는다.
- **WebView 브리지가 존재하지 않는다.** `apps/mobile`에 `react-native-webview`도, `postMessage` 규약도 없다(2026-07-26 확인). CTA `확인`의 실제 홈 복귀는 브리지 도입 후에나 동작한다.
- **S3-8의 자동 종료 문구가 일부 미정이다.** voice-tone §종료·자동 종료에 "자동 종료 안내 (수동 일시정지 방치) ⚠️ 미정"이 남아 있다. S4 자체 문구에는 영향이 없지만 진입 경로(S3-8) 담당(WG4)과 공유한다.
- **화면 꺼짐·백그라운드 복귀 시 재개 방식(자동 vs 수동)은 보류 상태다**(`design.md` 백로그 6번, `mvp-scope.md` 미확정 항목, 6차 노트 "보류"). S4는 이미 끝난 세션만 그리므로 직접 영향은 없으나, **이 항목을 임의로 확정하지 않는다** — WG2/WG4 스펙의 지시를 따른다.
- 예시 데이터로만 렌더된다(실제 세션 연동은 WG1~WG4 완료 후).

## Review Checklist

- [ ] **Figma 원본 수정 요청**: S4 통계 카드의 `화면 꺼짐` 행(`64:642`~`64:646`)을 회색 도트 `일시정지` 행으로 교체, 타임라인 범례(`64:572`)에 회색 `일시정지` 추가, 타임라인 바에 회색 세그먼트 추가. (`design.md` 백로그 7번① / 6차 액션 아이템 — 담당: 선규)
- [ ] 재계산한 예시값(총 공부 1시간 42분 · 82% 집중 · 비집중 18분 · 일시정지 1회 3분)이 디자이너 의도와 맞는지 확인 — Figma 예시값 갱신 시 함께 반영
- [ ] 우상단 `X` 닫기(`64:553`)와 CTA `확인`이 정말 같은 동작인지 확인 (현재 동일 동작으로 스펙)
- [ ] `확인` 후 홈 복귀를 위한 **WebView 호스트 브리지 규약** 확정 (메시지 포맷·모바일 수신부)
- [ ] `/room/:id/result` 라우트 경로 확정 — **WG1/리더 결정 대기**(WG4는 새 라우트를 만들지 않아 충돌 없음을 확인)
- [ ] **자정(KST) 분할 세션**에서 S4가 무엇을 보여줄지 확정 (WG4가 `StudySessionResponse[]` 배열을 그대로 라우터 state로 넘긴다)
- [ ] **자동 종료(S3-8) 제출의 `endedAt` 기준 확정** — 일시정지 시작 시각 vs 자동 종료 판정 시각. S4 헤더의 종료 시각·타임라인 축이 N분 달라진다 (WG4가 BE 협의로 에스컬레이션함)
- [ ] `location.state` 없는 진입(**콜드 딥링크·새 탭·히스토리 유실** — 같은 탭 새로고침은 state가 보존되어 해당 없음)의 처리 확정 — 리다이렉트 / 안내 화면 / 재조회 API 신설
- [ ] 우상단 닫기 버튼의 **접근성 이름 `닫기`** 확정 — `voice-tone.md`에 SR 전용 이름 규정이 없어 구현이 일반 표기를 임의 적용했다(`apps/web/src/features/study-session/resultCopy.ts`의 `RESULT_COPY.close`). 아이콘 전용 버튼이라 접근 가능한 이름 자체는 WCAG 4.1.2상 필수이므로 구현은 유지하되, 동작이 CTA `확인`과 동일하므로 `확인`·`나가기` 등 다른 이름이 더 맞는지 함께 확인
- [ ] **비집중 0 + 일시정지 1회 이상** 조합의 통계 카드 레이아웃 확정
- [ ] 집중률 표시를 `Math.round` 정수로 하는 것이 맞는지 확인 (서버는 소수 1자리)
- [ ] 카드 내부 구분선 `#eff1f3`를 `border/default`(`#e5e8eb`)로 대체한 것이 허용되는지 확인 (또는 토큰 신설)
- [x] `apps/web/src/index.css`에 `state/distract` · `text/tertiary` · `bg/layer-2` · `brand/subtle` 변수 추가 — **이미 반영돼 있음**(`design-tokens-sync`가 선행 작업에서 추가, 2026-07-26 WG5가 코드로 직접 확인). 빌드 산출 CSS에서 `bg-state-distract`·`text-text-tertiary`·`bg-bg-layer-2`·`bg-brand-subtle` 유틸이 실제로 생성되는 것까지 확인했다.
- [x] 상류 이슈 **종결**(2026-07-26): `buildSessionRequest`에 넘어가는 `studySec`은 WG1의 `computeSessionTotals`가 PAUSE를 제외해 계산하고, **클램프 자체도 WG4 하드닝으로 PAUSE 인식 완료**됐다(`submitStudySession.ts:59-65`, qa-WG4 F1 + qa-WG5 F5 재확인). 호출부·방어선 모두 계약 일치 — 활성 이슈 없음.
- [ ] **[리더 결정 대기]** 1초 미만 일시정지가 `computeSessionTotals`(집계에 포함)와 `toStatusEvents`(`MIN_EVENT_MS` 미만 구간 폐기)의 기준 차이로 **이벤트가 0건 전송**될 수 있다 — 이 경우 S4 일시정지 행(0건이면 미노출)·S5 칩(0이면 미노출)에서 흔적이 완전히 사라지는데 `studySec`은 이미 줄어 있어 "총 공부 &lt; 시각 범위"의 이유가 화면에 없다. 선택지(ⓐ 버림 유지 ⓑ 임계값 1초로 상향 ⓒ 입력단 디바운스)는 정책 판단이라 WG2가 `MIN_EVENT_MS`에 손대지 않고 대기 중이다.
- [ ] 로딩·에러·0초 세션 상태의 디자인·문구 확정

## 구현 노트 (2026-07-26, WG5 빌드 완료)

구현체: `apps/web/src/routes/ResultPage.tsx` + `features/study-session/{sessionResult.ts, resultCopy.ts, components/ResultHeader.tsx, components/StudyTimelineCard.tsx, components/DistractionStatsCard.tsx, components/ResultCardParts.tsx}`. 라우트는 `App.tsx`에 `/room/:id/result`로 등록했다.

미정 항목에 대해 **실제로 코드에 들어간 처리**는 다음과 같다. 전부 되돌리기 쉬운 한 곳에 모아 뒀고 TODO 주석으로 표시했다 — 정책이 확정되면 그 지점만 바꾼다.

| 미정 항목                      | 이번 구현이 택한 처리                                                                                                                                                                                           | 되돌릴 지점                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **자정(KST) 분할 세션**        | **배열의 첫 항목만 렌더**한다. 합산하면 서버가 나눈 귀속 날짜 기준을 화면이 임의로 뭉개고, 2개 카드는 시안 없는 UI를 새로 짓는 일이 되어 둘 다 택하지 않았다.                                                   | `ResultPage.tsx`의 `sessions[0]` 한 줄 |
| **`location.state` 없는 진입** | 스펙 기본안대로 **홈(`/`)으로 리다이렉트**(`<Navigate to="/" replace />`). 안내 화면을 새로 디자인하지 않았다. 검증은 렌더에 실제로 쓰는 필드만 좁게 확인한다(빈 배열·형태 불일치도 "데이터 없음"과 동일 처리). | `ResultPage.tsx`의 `readSessions` 분기 |
| **WebView 호스트 복귀 브리지** | CTA `확인`·우상단 `X`가 **같은 콜백 하나**(`handleConfirm`)를 부르고, 그 안에서 브라우저 폴백 `navigate("/", { replace: true })`만 한다. 메시지 포맷을 임의로 만들지 않았다.                                    | `ResultPage.tsx`의 `handleConfirm`     |
| **비집중 0 + 일시정지 ≥1**     | 확정 문구 `비집중 없이 이어간 공부예요` 아래에 **일시정지 행만** 노출.                                                                                                                                          | `DistractionStatsCard.tsx`             |
| **자동 종료 `endedAt` 기준**   | 받은 `endedAt`을 **그대로** 타임라인 축·헤더 시각으로 쓴다. 어느 기준인지 추측해 보정하지 않는다.                                                                                                               | (해당 없음 — 보정 코드 자체가 없다)    |
| **`MIN_EVENT_MS` 하향 편차**   | 서버 값을 그대로 렌더한다. 0건일 때 안내 문구를 덧붙이는 것도 보정으로 보고 **하지 않았다**.                                                                                                                    | (해당 없음)                            |

진입 배선(WG1/WG4 → WG5)은 `RoomPage.tsx`에서 다음과 같이 정리됐다 — 두 경로가 `goToResult` 한 함수로 수렴한다.

- S3-7 `공부 종료` → 제출 성공(`phase === "done"`) **그리고 자동 종료가 아닐 때만** 자동 이동. `submitting`·`error`·`unsaved`는 S3에 남는다(재시도 버튼 유지).
- S3-8 `결과 보기` → 이미 저장된 `phase.sessions`를 들고 이동(재제출 없음).
- 이동은 `navigate("result", { state: { sessions }, replace: true })` — 상대 경로라 `:id`를 다시 조립하지 않고, `replace`라 뒤로 가기로 종료된 룸에 되돌아가 새 세션이 시작되지 않는다.

추가로 확인된 사항:

- **`index.html`의 `viewport-fit=cover` — 해결됨.** 이 화면과 S3 세션 화면(WG1~WG4)이 모두 `env(safe-area-inset-*)`로 여백을 잡는데 이 메타가 없으면 iOS에서 인셋이 항상 0이 된다. WG5 착수 시점에는 없어 리더에 회부했고, **리더가 선반영 완료(2026-07-26)** — `apps/web/index.html`에 존재한다. WG5는 이를 전제하지 않았으며, safe-area 인셋이 0인 환경에서도 레이아웃이 깨지지 않음을 QA가 실측 확인했다(카드 상단 y=167, 인셋 59px 적용 시 226 = Figma 실측 일치).
- 타임라인 세그먼트에 **최소 폭을 주지 않았다.** 아주 짧은 구간은 1px 미만이 되어 보이지 않을 수 있지만, 최소 폭은 비율을 왜곡하는 표시 보정이라 넣지 않았다(정보는 통계 카드가 전달한다).
