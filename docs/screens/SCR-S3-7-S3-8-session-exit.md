# SCR-S3-7 · S3-8 세션 종료 (종료 확인 · 자동 종료 안내)

## Purpose

세션을 끝내는 두 경로를 담당한다.

- **S3-7 종료 확인**: 사용자가 하단 컨트롤 바의 종료 버튼을 눌렀을 때 뜨는 확인 다이얼로그. 세션 화면 위에 딤 + 다크 다이얼로그로 겹쳐 뜨며, "지금까지 집중한 시간이 저장된다"는 사실을 먼저 말해 손실 불안을 없앤 뒤 종료를 확정한다(voice-tone.md §1 "이득/안심 우선 구성").
- **S3-8 자동 종료 안내**: **일시정지 상태가 N분 유지되어** 세션이 자동 종료됐을 때의 결과 안내 화면. 사용자가 아무것도 누르지 않은 사이에 세션이 끝났으므로, "이미 저장됐다"는 안심 → 왜 끝났는지 이유 → 순공·총 요약 → "결과 보기" 순으로 보여준다.

두 화면 모두 종료 후 **S4 공부 결과(WG5)**로 이동한다. 이 문서는 그 이동의 진입점까지만 정의하고, S4 자체는 `SCR-S4-study-result.md`가 정의한다.

## Source Of Truth

- Figma file: **FocusON V1.0 Design**
- Figma file key: `KmTbXL79g6ximY1RcnBZDz`
- S3-7
  - Figma frame: `S3-7 · 종료 확인`
  - Figma node: **`63:458`** (Screens — iOS 페이지 `14:4` 하위, `get_metadata`로 직접 확인)
  - URL: <https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=63-458>
  - 하위 핵심 노드: `Dialog / Confirm` 인스턴스 `63:468`(마스터 `40:104`) · `dim` `63:467` · 프로토타입 핫스팟 `hs/continue` `70:1207` / `hs/end` `70:1209`
- S3-8
  - Figma frame: `S3-8 · 자동 종료 안내`
  - Figma node: **`63:569`**
  - URL: <https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=63-569>
  - 하위 핵심 노드: `check-circle` `63:587`(`icon/check` `63:588`) · 타이틀 `63:590` · 본문 `63:591` · `summary-card` `63:592` · `Button / CTA` `63:600`(마스터 `40:94`)
- ai-wiki 근거 문서
  - `ai-wiki/product/design.md` — 화면 인벤토리 V1.0 / 6차 번호 재편(S3-7·S3-8) / "세션 종료: 종료 버튼 → 확인 다이얼로그(S3-7) 후 종료"
  - `ai-wiki/product/mvp-scope.md` — 세션 상태 모델(일시정지 통합), "일시정지 상태가 N분 유지되면 세션을 자동 종료", 미확정 항목
  - `ai-wiki/product/policies.md` — §3 측정 정책 "일시정지 자동 종료: 일시정지(수동·화면 꺼짐) N분 유지 시 세션 자동 종료 + 기록 저장 (N값 튜닝 파라미터)"
  - `ai-wiki/product/voice-tone.md` — §4 "종료·자동 종료 (S3-7 · S3-8)" 문구표, §2 표기 규칙(시간 길이·조사 자동 처리)
  - `ai-wiki/product/user-flow.md` — 핵심 플로우 다이어그램(`P --N분 유지--> AE(S3-8)`, `AE --> F(S4)`, `E --> F`)
  - `ai-wiki/project/glossary.md` — 일시정지 / 순공시간 / 총 공부 시간 노출 표기
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — "일시정지 장시간 방치: 수동 일시정지도 화면 꺼짐과 동일하게 N분 경과 시 세션 자동 종료 + 기록 저장 (N값 튜닝 파라미터 **공용**)"
- Ownership: `frontend/docs/screen-ownership.md` — S3-7·S3-8 모두 `apps/web` 구현, 모바일은 WebView로 로드
- 담당 앱: **`apps/web`** (그룹 WG4)

Figma가 시각적 SSOT, ai-wiki가 문구·정책·상태 모델의 SSOT다. 구현 전 위 두 노드를 `get_design_context`로 다시 읽되, 절대 좌표(`top-[356px]` 등)를 그대로 베끼지 말고 Flex/Grid 레이아웃으로 매핑한다.

## Ownership Boundary

- 이 화면들은 `apps/web`의 세션 상태 머신(`RoomPage.tsx` + `features/study-session/**`) 안에 산다. **8개의 별도 페이지가 아니라 하나의 룸 화면이 갖는 프레젠테이션 상태**다 — WG1~WG3와 같은 트리를 공유한다.
- **S4(공부 결과)를 이 작업에서 만들지 않는다.** WG5가 `ResultPage.tsx`로 만든다. WG4는 "종료 후 S4로 간다"는 이동 계약만 만들고, S4 라우트가 아직 없으면 이동 핸들러만 두고 실제 목적지는 TODO로 남긴다.
  - **라우트 전제**: S3-1~S3-8은 전부 기존 `/room/:id` **한 라우트 안의 프레젠테이션 상태**이며, WG4는 새 라우트를 만들지 않는다(종료 확인은 모달, 자동 종료 안내는 같은 라우트의 상태). 따라서 WG5가 기본안으로 잡은 **`/room/:id/result`**(`SCR-S4-study-result.md`)와 구조적으로 충돌하지 않는다. 최종 확정은 `RoomPage` 프레젠테이션을 소유한 WG1/리더 몫이다.
- 카메라 획득·Vision 추론·비집중 감지 로직을 여기서 구현하지 않는다(WG1이 상태 이벤트 인터페이스를 소유, 실제 Vision은 별도 과제).
- `apps/mobile`의 어떤 화면도 건드리지 않는다. 모바일은 이 화면을 WebView로 로드만 한다.
- 일시정지 **상태 자체**(진입/해제/프레젠테이션)는 WG2(`SCR-S3-3-S3-4-...`)가 소유한다. WG4는 그 상태를 **소비**해서 "N분 넘었나"를 감시하고 자동 종료를 발동하는 쪽이다 — 일시정지 UI를 중복 구현하지 않는다.

## Current Figma Structure

### S3-7 · 종료 확인 (`63:458`, 402×874)

```text
S3-7 · 종료 확인
  Session / Camera Preview BG (58:109)   — 카메라 피드 자리(목업 #1A2029 + 사선 밴드)
  iOS / Status Bar (Dark)                — OS 크롬, 앱이 그리지 않음
  Session / Status Pill (34:14, Focus)   — "집중 측정 중" · 상단 중앙 · glass blur 10
  타이머 "01:24:08"                       — 52px Bold, lh60, tracking -0.5, 중앙
  "총 01:45:12"                           — 15px Medium, white 42%
  "영상은 기기 안에서만 처리돼요"           — 12px Regular, white 55%
  Session / Control Bar (34:32)          — 244×80 캡슐, glass blur 14, 핸들 36×4
      btn/pause · btn/camera-flip (white 12%) · btn/exit (#FF6B77)
  iOS / Home Indicator                   — 다크 화면이라 바 fill white 40%
  dim (63:467)                           — 402×874 rgba(0,0,0,0.6) 전면 딤
  Dialog / Confirm (63:468 ← 40:104)     — 330w, 중앙(top 356), bg #191F28, r20,
                                            shadow 0 20 50 rgba(0,0,0,.45), padding 24, gap 18
      text (gap 8)
        "공부를 종료할까요?"                 — 18px Bold, lh21, #F9FAFB
        "지금까지 집중한 1시간 24분이 저장돼요" — 14px Regular, lh20, #B0B8C1
      actions (gap 10)
        Button/CTA Dark Secondary SM "계속하기"  — 136×48, r14, bg #333D4B, white 15px SemiBold
        Button/CTA Dark Primary SM  "공부 종료"  — 136×48, r14, bg state/focus #1B64DA, white
  hs/continue (70:1207) / hs/end (70:1209) — 프로토타입 핫스팟(구현 대상 아님, 인터랙션 근거)
```

바인딩된 Figma Variable(`get_variable_defs` `63:458`): `state/focus #1b64da` · `radius/full 999` · `text/inverse #ffffff` · `blur/glass-soft(10)` · `blur/glass-strong(14)`.

### S3-8 · 자동 종료 안내 (`63:569`, 402×874)

```text
S3-8 · 자동 종료 안내
  iOS / Status Bar (Light)               — 세션 화면과 달리 라이트 상태바 = 일반 앱 화면
  check-circle (63:587)                  — 66×66 원형, bg brand/subtle, 중앙
      icon/check (63:588) 28×28          — brand 색 체크 아이콘
  "여기까지 기록을 저장했어요"              — 20px Bold, lh24, text/primary, 중앙
  "화면이 꺼진 동안은 측정이 어려워서\n공부가 자동으로 종료됐어요"
                                          — 14px Regular, lh21, text/secondary, 2줄 중앙
  summary-card (63:592)                  — 362w, bg/layer-1, border/default 1px, r16, px16
      row: "순공시간"(14 Regular, text/secondary) ↔ "52분"(15 Bold, text/primary)
      divider 1px #EFF1F3
      row: "총 공부"(14 Regular)          ↔ "1시간 8분"(15 Medium)
  Button / CTA (63:600 ← 40:94, XL)      — 362×56, r16, bg brand/primary, "결과 보기" 17px Bold white
  iOS / Home Indicator
```

바인딩된 Figma Variable(`get_variable_defs` `63:569`): `bg/base` · `bg/layer-1` · `border/default` · `brand/primary` · `brand/subtle` · `text/primary` · `text/secondary`.

> **중요한 차이**: S3-7은 카메라 위에 뜨는 **항상-다크 오버레이**라 라이트/다크 테마를 따르지 않는다(값이 하드코딩된 다크 서피스). S3-8은 **일반 앱 화면**이라 시맨틱 토큰에 바인딩돼 라이트/다크를 모두 따라간다. 두 화면을 같은 테마 처리로 묶지 말 것.

## Content

문구는 `ai-wiki/product/voice-tone.md` §4 "종료·자동 종료 (S3-7 · S3-8)"에서 **그대로** 인용한다. 의역·재작성 금지.

### S3-7 종료 확인 다이얼로그

| 요소             | 문구                                    |
| ---------------- | --------------------------------------- |
| 타이틀           | `공부를 종료할까요?`                    |
| 본문             | `지금까지 집중한 {순공시간}은 저장돼요` |
| 버튼(좌, 비파괴) | `계속하기`                              |
| 버튼(우, 종료)   | `공부 종료`                             |

- `{순공시간}`은 **한글 시간 길이 표기**(voice-tone §2): 1시간 이상 → `N시간 M분`(M=0이면 `N시간`) · 1시간 미만 → `M분` · 1분 미만 → `S초`. 다이얼로그에는 `HH:MM:SS`를 쓰지 않는다(타이머 본문만 `HH:MM:SS`).
- **조사 자동 처리**(voice-tone §2): 값이 분·시간으로 끝나면 `은`, 초로 끝나면 `는`. → `지금까지 집중한 1시간 24분은 저장돼요` / `지금까지 집중한 40초는 저장돼요`.

> ⚠️ **Figma ↔ ai-wiki 문구 불일치 — 확인 필요.**
> Figma 노드 `40:98`은 `지금까지 집중한 1시간 24분**이** 저장돼요`(조사 `이`)로 그려져 있고, `voice-tone.md` §2·§4는 `지금까지 집중한 1시간 24분**은** 저장돼요`(조사 `은`)를 명시한다(§2에 동일 예문이 그대로 있음).
> 둘 다 병기해 남긴다. **잠정 구현값은 ai-wiki 쪽(`은`)** — voice-tone.md가 2026-07-26 6차 인터뷰로 재작성된 최신 문서이고 조사 규칙이 명문화돼 있기 때문이다. 다만 임의 확정이 아니므로 리더 확인 후 확정한다(Review Checklist 참조). Figma 쪽이 맞다면 조사 자동 처리 규칙 자체를 voice-tone에서 고쳐야 한다.

### S3-8 자동 종료 안내

| 요소                                 | 문구                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 타이틀                               | `여기까지 기록을 저장했어요`                                                                              |
| 본문 — **화면 꺼짐 트리거** (확정)   | `화면이 꺼진 동안은 측정이 어려워서 공부가 자동으로 종료됐어요` (Figma는 `측정이 어려워서` 뒤에서 줄바꿈) |
| 본문 — **수동 일시정지 방치 트리거** | ⚠️ **미정 — 리더/사용자 확인 필요**                                                                       |
| 요약 라벨                            | `순공시간` / `총 공부`                                                                                    |
| CTA                                  | `결과 보기`                                                                                               |

> ⚠️ **수동 일시정지 방치 시의 본문 문구는 확정되지 않았다.** `voice-tone.md` §4에 `⚠️ 미정 — 위 문구는 화면 꺼짐 전제. 수동 일시정지 장시간 방치로 자동 종료될 때의 변형 문구는 작성 필요`라고 명시돼 있다.
> **빌더 지시**: 화면 꺼짐 문구를 수동 일시정지 케이스에 그대로 재사용하지 말 것 — 화면을 끄지 않은 사용자에게 "화면이 꺼진 동안"이라고 안내하면 사실과 다르다. `autoEndReason` 프롭으로 분기하는 슬롯만 만들고, `MANUAL_PAUSE`일 때는 **타이틀·요약·CTA만 렌더하고 본문은 비운 채 `// TODO(voice-tone 미정): 수동 일시정지 방치 자동 종료 본문 문구 확정 필요` 주석을 남긴다.** 임의 작문 금지.
> 요약값 표기는 voice-tone §2 한글 시간 길이 규칙을 따른다(`52분`, `1시간 8분`).

> **"화면 꺼짐"의 두 가지 쓰임을 혼동하지 말 것** (QA가 오탐하기 쉬운 지점).
>
> - S3-8 본문의 `화면이 꺼진 동안은…`은 **왜 종료됐는지 설명하는 문장**이다. voice-tone.md §4에 확정 문구로 등재돼 있으므로 **그대로 쓴다.**
> - 반면 **통계·타임라인 범례의 라벨로서의 `화면 꺼짐`은 2026-07-26에 삭제됐다** — `일시정지`로 통합됐다(6차 인터뷰, glossary.md). S4 프레임(`64:534`)에는 아직 오렌지 도트의 '화면 꺼짐' 행이 남아 있지만 이는 `design.md` 백로그 7번①의 **알려진 Figma 반영 지연**이며 WG5가 처리한다.
> - WG4 화면(S3-7·S3-8)에는 통계 라벨이 없으므로 이 반영 지연의 영향을 받지 않는다. **S3-8 본문 문장을 "반영 지연"으로 오인해 '일시정지'로 바꾸지 말 것.**

## Data Contract

### 재사용하는 기존 타입 (`frontend/packages/types/src/index.ts` — 백엔드 Swagger 기준, 그대로 쓴다)

- `StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE"` — 일시정지 구간은 **`"PAUSE"`** 이벤트로 기록한다. 주석에 이미 `PAUSE=일시정지(총공부 타이머까지 정지)`로 정의돼 있어 6차 인터뷰의 통합 정책과 일치한다. **수동 일시정지와 화면 꺼짐·백그라운드를 구분하는 별도 status는 계약에 없다 — 둘 다 `PAUSE`로 보낸다**(새 status 값을 상상해 만들지 말 것).
- `StatusEventPayload { status, startedAt, endedAt }` — UTC ISO-8601. 서버 규칙: **세션 구간 안 · 서로 겹침 불가 · 0초 불가.**
- `StudySessionCreateRequest { userId, startedAt, endedAt, studySec, focusSec, events }` — 서버 규칙: `0 ≤ studySec ≤ (endedAt − startedAt) − PAUSE 시간 합`, `0 ≤ focusSec ≤ studySec`.
- `StudySessionResponse { id, userId, statDate, startedAt, endedAt, studySec, focusSec, focusRate, events }` — **KST 자정을 넘는 세션은 날짜별로 분할돼 배열로 내려온다.**
- 제출 경로는 기존 `apps/web/src/features/study-session/submitStudySession.ts`를 그대로 쓴다(`POST /api/study-sessions`). 새로 만들지 않는다.

### S3-8 요약 카드의 표시값

`순공시간` = `focusSec`, `총 공부` = `studySec`. 제출 응답(`StudySessionResponse[]`)에서 파생하되, **자정 분할로 배열이 2건이 될 수 있으므로 표시용으로는 합산**한다(`sessions.reduce`). 서버 왕복 전에도 화면을 그려야 한다면 로컬 계산값을 쓰되, 제출 성공 후 서버 응답값으로 덮어쓴다.

### 계약이 없는 것 — 상상 계약 금지

- **백엔드 계약 미확인 — 상상 계약 금지: `autoEndAfterPauseMinutes`(일시정지 자동 종료 임계값 N분)** — `packages/types`에 대응 타입이 없고, 이 값을 내려주는 서버 설정/원격 구성 엔드포인트도 확인되지 않았다. 아래 "Interaction Contract"의 주입 방식(클라이언트 설정 상수 + 주입 가능 인터페이스)으로만 다루고, 서버 API 타입을 새로 만들지 않는다.
- **백엔드 계약 미확인 — 상상 계약 금지: `autoEndReason` / `endReason`(자동 종료 사유)** — 세션이 수동 종료됐는지 자동 종료됐는지, 자동이라면 화면 꺼짐인지 수동 일시정지 방치인지를 서버에 전달하는 필드가 계약에 없다. **클라이언트 내부 상태로만 쓰고 제출 페이로드에 넣지 않는다.**

> ⚠️ **스펙 정정(2026-07-26, WG1 QA에서 발견)**: `PauseTrigger`는 이미 `apps/web/src/features/study-session/sessionState.ts`에 WG1이 출하했다(`"MANUAL" | "BACKGROUND"` — `"SCREEN_OFF"`는 존재하지 않는 값이니 쓰지 않는다). WG4는 이 타입을 그대로 import해서 쓴다 — 새로 선언하지 않는다.

```ts
// apps/web/src/features/study-session/sessionState.ts (WG1 기 구현, import해서 재사용)
export type PauseTrigger = "MANUAL" | "BACKGROUND";

// 클라이언트 내부 타입 — packages/types로 export 하지 않는다(서버 계약이 아님).
// apps/web/src/features/study-session/ 안에 둔다.
type SessionEndReason =
  | { kind: "MANUAL" } // S3-7 "공부 종료"
  | { kind: "AUTO"; trigger: PauseTrigger }; // S3-8, 문구 선택 전용(위 PauseTrigger import)
```

## Interaction Contract

### 공통 — 자동 종료 임계값은 **하나의 공용 파라미터, 하나의 감시 로직**

> 이 절은 이번 작업의 핵심 요구사항이다. **감시 로직을 두 개 만들지 않는다.**

`mvp-scope.md`·`policies.md`·6차 인터뷰 노트가 모두 "수동 일시정지·화면 꺼짐 **동일 규칙**, N값 **공용** 튜닝 파라미터"로 확정했다. 따라서:

- 일시정지 상태는 **트리거(수동 버튼 / 화면 꺼짐·백그라운드)에 상관없이 하나의 상태**다(WG2가 이미 하나의 프레젠테이션으로 구현). 자동 종료 감시도 **그 하나의 상태 위에서 한 번만** 돈다.
- 감시 대상은 "일시정지가 시작된 벽시계 시각"이다. 트리거 종류는 **S3-8 문구 선택에만** 쓰고, 임계값 판정에는 절대 쓰지 않는다.

```ts
/** 세션 튜닝 파라미터 — 하드코딩 금지, 주입 가능하게 둔다.
 *  근거: mvp-scope.md "감지 파라미터는 하드코딩하지 말고 설정 파라미터로 구현" +
 *        policies.md "N값 튜닝 파라미터". */
export interface SessionTuningConfig {
  /** 일시정지(수동·화면 꺼짐 공용)가 이 시간 이상 지속되면 세션을 자동 종료한다.
   *  ⚠️ 실제 분 값 미정 — 아래 "Current Limitations" 참조. */
  autoEndAfterPauseMs: number;
}

/** 단 하나의 감시자. pausedSince가 null이면 감시하지 않는다. */
function usePauseAutoEnd(args: {
  pausedSince: number | null; // 일시정지 시작 시각(Date.now() 기준 ms). 트리거 무관.
  config: SessionTuningConfig;
  onAutoEnd: (trigger: PauseTrigger) => void;
}): void;
```

- **`setTimeout` 하나만 걸어두고 끝내지 말 것.** 화면 꺼짐·백그라운드에서는 WebView/브라우저가 타이머를 스로틀링하거나 아예 멈춘다 — 정해진 시각에 콜백이 오지 않는다. **일시정지 시작 벽시계 시각을 저장해두고, 복귀(`visibilitychange` → visible) 시점에 경과를 다시 계산해 임계값 초과 여부를 판정**해야 한다. 포그라운드 감시(수동 일시정지 케이스)는 인터벌로, 복귀 판정은 경과 재계산으로 — 두 경로가 같은 `autoEndAfterPauseMs`와 같은 `pausedSince`를 본다.

### S3-7 종료 확인

| 사용자 행동                                     | 결과                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 컨트롤 바 종료 버튼(`btn/exit`, 빨강) 탭        | 딤 + 확인 다이얼로그 표시. **세션은 종료되지 않는다.**                                                                                            |
| `계속하기` 탭                                   | 다이얼로그 닫힘 → **직전 세션 상태 그대로 복귀**(집중 / 비집중 / 일시정지 어느 상태에서 열었든 그 상태로).                                        |
| `공부 종료` 탭                                  | 세션 종료 → 열려 있던 PAUSE/비집중 구간을 종료 시각으로 닫고 → `submitStudySession` 제출 → **제출 성공 시에만 S4로 이동**(아래 참조).             |
| 다이얼로그 뒤 딤 탭 / 하드웨어 뒤로가기 / `Esc` | ⚠️ **디자인 미정.** 비파괴 기본값(= `계속하기`와 동일: 닫고 세션 유지)으로 구현하고 Review Checklist에 남긴다. 종료를 이 경로로 확정시키지 말 것. |

- 다이얼로그는 **프리뷰(S3-1)·비집중(S3-2)·일시정지(S3-3)·심플 모드(S3-4)·가로(S3-5/S3-6) 모든 상태 위에서 동일하게** 뜬다. S3-3·S3-4 프레임의 컨트롤 바에도 종료 버튼이 있음을 Figma에서 확인했다(`70:1198`, `70:1203`).
- **가로 모드(S3-5/S3-6)용 종료 확인 프레임은 Figma에 없다.** 세로와 같은 330w 다이얼로그를 가로 캔버스 중앙에 띄우는 것으로 구현하고 Review Checklist에 남긴다(임의로 가로 전용 레이아웃을 새로 디자인하지 말 것).
- **다이얼로그가 떠 있는 동안 세션은 계속 진행된다** — Figma에서 딤 뒤 상태 필이 `집중 측정 중`(Focus)이고 타이머가 살아 있음을 확인했다. 다만 ai-wiki에 명시 서술이 없는 **Figma 근거 추론**이므로 Review Checklist에 남긴다.
- **⚠️ 미정 — 리더/사용자 확인 필요**: 일시정지 중에 종료 다이얼로그를 열어둔 채 자동 종료 임계값을 넘겼을 때의 동작. 제안 기본값은 "감시는 계속 돌고, 임계값 도달 시 다이얼로그를 닫고 S3-8로 전환"이지만 확정 사항이 아니다 — 인터페이스만 만들고 동작은 TODO로 표시한다.
- **제출 실패/로딩 상태의 디자인이 없다.** 기존 훅의 `phase`(`submitting` / `error` / `unsaved`)를 버리지 말고 그대로 유지해 임시 처리한다(WG1이 훅을 확장하는 범위와 충돌하지 않게 조율). 오프라인 로컬 큐(정책상 "로컬 저장 후 재전송")는 이번 범위 밖 — 구현하지 않고 남겨둔다.
- **제출 실패의 사용자 대면 처리는 전적으로 S3 쪽(이 그룹 + WG1) 책임이다.** WG5는 S4에 `저장 실패`·`저장되지 않음` 배너나 재시도 버튼을 **만들지 않기로** 스펙했다(2026-07-26 상호 확인). 즉 실패를 삼켜서 S4로 넘기면 사용자에게 아무 안내도 남지 않는다 — 재시도 경로를 S3에서 반드시 제공한다.
- **S4로의 이동은 `phase === "done"`에서만 일어난다**(WG5 `SCR-S4-study-result.md`와 합의된 계약, 2026-07-26). `submitting`(로딩)·`error`(재시도)는 **S3 쪽 상태**이지 S4의 상태가 아니다 — S4를 로딩/에러 화면으로 겸용하지 않는다. 이동 시 `StudySessionResponse[]`를 라우터 state로 넘겨 S4가 재조회 없이 그릴 수 있게 한다.
- **`phase === "unsaved"`(userId 없음)에서는 S4로 이동하지 않는다.** 현재 훅은 쿼리에 `?userId=N`이 없으면 서버 저장 없이 `unsaved`로 빠지는데, 이 경로의 화면은 디자인된 적이 없다(검증용 잔재). 기존 표시를 유지하고 S4로 넘기지 않는다 — 저장되지 않은 세션을 "공부 결과"로 보여주면 사실과 다르다.

### S3-8 자동 종료 안내

| 사용자 행동 / 시스템 이벤트                     | 결과                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 일시정지 상태가 `autoEndAfterPauseMs` 이상 유지 | 세션 자동 종료 → 열린 PAUSE 구간을 닫고 제출 → S3-8 표시. **사용자 확인을 기다리지 않고 저장한다**(policies.md "N분 유지 시 세션 자동 종료 + 기록 저장"). |
| 화면 꺼짐·백그라운드로 자동 종료된 경우         | 사용자는 그 순간 화면을 보고 있지 않다 — **앱/웹뷰로 복귀한 시점에 S3-8을 노출**한다.                                                                     |
| `결과 보기` 탭                                  | **S4 공부 결과로 이동**(WG5). S4 라우트가 아직 없으면 핸들러만 두고 목적지는 TODO.                                                                        |
| 뒤로가기                                        | ⚠️ **디자인 미정.** S3-8에는 닫기 버튼이 없고 유일한 출구가 `결과 보기`다 — 세션 화면으로 되돌아가지 못하게 막는다(이미 종료된 세션이다).                 |

- S3-8은 **종료 확인을 거치지 않는다** — 이미 끝난 일에 대한 사후 안내다. 취소/재개 액션을 넣지 말 것.
- `결과 보기`는 **이미 저장된 결과를 들고** S4로 간다(S3-7처럼 여기서 새로 제출하지 않는다). 즉 제출은 자동 종료 판정 시점에 이미 끝나 있어야 한다 — WG5 `SCR-S4-study-result.md`와 합의된 계약이다.
- **⚠️ 미정 — 리더/사용자 확인 필요**: 자동 종료 경로에서 **제출이 실패했을 때** S3-8을 그대로 노출하면 타이틀 `여기까지 기록을 저장했어요`가 사실과 달라진다(아직 서버에 저장되지 않았는데 저장됐다고 안내함). 오프라인 로컬 큐가 이번 범위 밖이라 더욱 그렇다. 디자인이 없으므로 임의 문구를 만들지 말고, 제출 실패 시에는 S3-7과 같은 `error` phase 처리(재시도)로 빠지게 하고 TODO로 남긴다.
- **⚠️ 미정 — 리더/BE 확인 필요**: 자동 종료 시 제출할 `endedAt`을 (a) 일시정지 시작 시각으로 할지, (b) 자동 종료 판정 시각(= 일시정지 시작 + N분)으로 할지 확정되지 않았다. 서버 검증(`studySec ≤ (endedAt − startedAt) − PAUSE 합`)과 결과 화면의 시각 범위 표기에 직접 영향을 준다. 인터페이스만 만들고 계산은 한 곳(`buildSessionRequest` 호출부)에 모아 TODO로 표시한다.

## Design Tokens Used

`packages/design-tokens/src/index.ts`에 **실제로 존재하는 것만** 나열한다(2026-07-26 `design-tokens-sync` 동기화 완료본 기준).

### S3-8 (테마 반응형 — 라이트/다크 모두 따라감)

- `colors.bg.base` — 화면 배경
- `colors.bg.layer1` — 요약 카드 배경
- `colors.border.default` — 요약 카드 테두리 **및 카드 안 구분선**(`63:596`). 구분선은 Figma에서 `#EFF1F3`으로 **하드코딩**돼 있고(변수 바인딩 없음 — `get_variable_defs` `63:569`에 해당 색이 없음) 시맨틱 토큰 어디에도 없는 값이며 **다크 대응값이 존재하지 않는다.** S3-8은 테마 반응형 화면이므로 라이트 전용 hex를 박으면 다크 모드에서 `bg/layer-1`(#191F28) 카드 위에 거의 흰 헤어라인이 남는다 — 그래서 **토큰을 쓴다.** 라이트에서 3계조 차이(#EFF1F3 → #E5E8EB)가 생기지만 1px 헤어라인이라 실질 차이가 없고, 다크 파손을 피하는 편이 명백히 낫다(2026-07-26 QA 판정으로 정정, 아래 Review Checklist).
- `colors.brand.subtle` — 체크 원형 배경
- `colors.brand.primary` — 체크 아이콘 색 · CTA 배경
- `colors.text.primary` — 타이틀, 요약 값
- `colors.text.secondary` — 본문, 요약 라벨
- `colors.text.onBrand` — CTA 라벨(흰색)
- `radius.lg`(16) — 요약 카드, CTA 버튼
- `radius.full`(999) — 체크 원형

### S3-7 (항상-다크 오버레이 — 테마 전환 없음, 다크 값 고정)

- `colors.bg.dim.dark`(`#00000099` = 60%) — 딤. Figma 실측 `rgba(0,0,0,0.6)`과 정확히 일치한다(라이트 값 40%가 아니라 **다크 값**을 쓴다 — 세션은 항상 다크 서피스이기 때문).
- `colors.bg.layer1.dark`(`#191F28`) — 다이얼로그 서피스
- `colors.bg.layer2.dark`(`#333D4B`) — `계속하기` 버튼 배경
- `colors.text.primary.dark`(`#F9FAFB`) — 다이얼로그 타이틀
- `colors.text.secondary.dark`(`#B0B8C1`) — 다이얼로그 본문
- `colors.state.focus.light`(`#1B64DA`) — `공부 종료` 버튼 배경. Figma가 `state/focus` 변수에 바인딩했고 값은 blue/500이다.
- `colors.text.inverse.light` / 흰색 — 버튼 라벨
- `colors.feedback.error.dark`(`#FF6B77`) — 컨트롤 바 종료 버튼(WG1/WG2가 이미 구현했을 컨트롤 바 소유. 여기선 색만 명시)
- `radius.xl`(20) — 다이얼로그
- `radius.full`(999) — 상태 필, 컨트롤 바

### 토큰 스케일 밖 실측값

> **적용 규칙 (2026-07-26 QA 지적으로 명문화 — 이 규칙이 없어서 스펙에 자기모순이 있었다)**
>
> - **S3-7(항상-다크 오버레이)에서는 실측 raw 값을 그대로 써도 된다.** 이 화면은 테마를 따라가지 않으므로 다크 전용 값 하나로 충분하다.
> - **S3-8(테마 반응형)에서는 라이트 전용 raw hex를 절대 쓰지 않는다.** 다크 대응값이 없는 색을 박으면 다크 모드가 깨진다 — 반드시 시맨틱 토큰으로 대체하고, 대체하며 생긴 미세한 색 차이는 Review Checklist에 남긴다.
> - 색이 아닌 값(반경·그림자·타이포)은 테마 무관이므로 두 화면 모두 실측값 사용이 안전하다.

- 버튼 반경 **14px**(S3-7) — `radius` 스케일에 없다(12 또는 16으로 반올림하지 말 것).
- 다이얼로그 그림자 `0 20px 50px rgba(0,0,0,0.45)`(S3-7) — 그림자 토큰이 아직 없다.
- ~~요약 카드 구분선 `#EFF1F3`~~ — **삭제(2026-07-26 정정).** 위 규칙에 따라 `colors.border.default`를 쓴다. 근거는 `§Design Tokens Used > S3-8` 참조.
- 타이포: S3-7 타이틀 18/21 Bold(스케일 h3는 18/26 — **lh만 실측 21 사용**) · 본문 14/20 Regular(스케일 label.md는 14 Medium) · 버튼 15/18 SemiBold · S3-8 타이틀 **20**/24 Bold(h2 22와 h3 18 사이, 스케일 밖) · 본문 14/21 · 요약 14/17·15/18 · CTA 17/20 Bold(body.lg는 17 Regular). 폰트는 Pretendard 미설치로 **Inter 임시 적용** 상태를 유지한다(교체하지 않는다).

> 토큰 키가 실제로 존재하는지 의심되면 `design-tokens-sync`에게 확인 요청할 것. 위 목록은 파일을 직접 읽어 확인했다.

## Components

- **재사용(WG1~WG3가 이미 만들었을 것)**: `SessionStatusPill`, `SessionControlBar`, `SessionCameraPreview`, 타이머 표시부. **다시 만들지 말고 import 한다** — 없으면 WG1/WG2 빌더와 조율하고, 그래도 없으면 최소한 같은 파일 위치에 만들어 다른 그룹이 재사용할 수 있게 한다.
- **이번에 새로 추출**
  - `ConfirmDialog` — Figma `Dialog / Confirm`(`40:104`) 대응. 다크 서피스 전용 모달. props: `title`, `description`, `cancelLabel`, `confirmLabel`, `onCancel`, `onConfirm`. S3-7 외에도 다크 오버레이 확인 다이얼로그가 필요하면 재사용.
  - `DarkSmButton` — `Button / CTA` 의 `Dark Primary SM` / `Dark Secondary SM` variant(136×48, r14). 기존 `apps/web/src/components/ui/button.tsx`의 `cva` variants 관례를 따라 variant로 추가하는 쪽을 우선 검토한다(새 파일을 만들기 전에 기존 컴포넌트 확장 가능성부터 볼 것).
  - `AutoEndNotice` — S3-8 전체 화면. props: `autoEndReason: PauseTrigger`, `focusSec`, `studySec`, `onSeeResult`.
  - `SummaryRowCard` — S3-8 요약 카드(라벨↔값 2행 + 구분선). S4에서도 비슷한 형태가 나오지만 **선점해서 공용화하지 말 것**(WG5가 실제로 필요할 때 승격).
  - `usePauseAutoEnd` — 위 인터랙션 계약의 단일 감시자. `features/study-session/` 하위.
- **아이콘**: `icon/check`(`63:588`)는 Figma에서 export한 SVG의 path를 그대로 옮긴다. **직접 그리지 말고 PNG로 내보내지 말 것** — PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 아이콘이 흰 네모로 보인다(MG1에서 실제로 발생).

## Implementation Notes For AI Agents

1. 이 문서 → `frontend/docs/screen-ownership.md` → `apps/web/CLAUDE.md` → 루트 `frontend/CLAUDE.md` 순으로 먼저 읽는다.
2. Figma 노드 `63:458`, `63:569`를 `get_design_context`로 재확인한다(호출 전 `figma:figma-design-to-code` 스킬 필수).
3. **`apps/web`에서만** 구현한다. `apps/mobile`, `packages/*`를 건드리지 않는다(단, 새 서버 계약 타입은 어차피 만들지 않는다 — 위 Data Contract 참조).
4. **기존 `useStudyRoomSession` 훅의 로직을 버리지 않는다.** 입장 시각 고정(`startedAtMsRef`), 종료 시각 멱등 고정(`endedAtMsRef ??= Date.now()`), `phase` 상태 머신, `submitStudySession` 제출 경로는 그대로 두고 확장한다. 특히 `endedAtMsRef`의 멱등 고정은 제출 재시도 시 같은 세션으로 저장되게 하는 장치다 — 자동 종료 경로에서도 같은 ref를 통과시켜야 한다.
5. **제출값 계산 주의 — 이 그룹이 처리해야 할 상류 이슈다.** 현재 `buildSessionRequest`의 클램프는 `studySec ≤ (endedAt − startedAt)`까지만 보장하고 **PAUSE 시간을 빼지 않는다**(`apps/web/src/features/study-session/submitStudySession.ts`). 서버 규칙은 `studySec ≤ (endedAt − startedAt) − PAUSE 합`이므로, **일시정지가 실제로 존재하는 이번 구현부터는 호출부가 `studySec`에서 일시정지 시간을 반드시 제외**해야 400을 피한다. 나아가 **클램프 자체를 PAUSE 인식하도록 고치는 쪽을 기본안으로 삼는다**(계약 검증 로직이 계약과 어긋난 채 남으면 다음 그룹이 같은 함정을 밟는다) — 다만 같은 파일을 WG1도 만지므로 착수 전 조율한다.
   - **WG5 의존성**: 이 계산이 틀리면 `총 공부 = 벽시계 범위`가 되어, S4 헤더가 표현해야 할 "일시정지 제외로 시각 범위와 총 공부 시간은 다를 수 있음"(`design.md` 6차 S4 헤더 행)이 화면에 영영 나타나지 않는다. WG5는 S4에서 보정하지 않고 받은 값을 그대로 표시하기로 스펙했으므로(`SCR-S4-study-result.md`), **정확도의 책임은 전적으로 제출 경로를 만지는 이 그룹에 있다.**
   - **ms → 초 변환 규율 (2026-07-26 QA F1 지적으로 추가 — 원래 스펙에 빠져 있었다)**: 상한을 **독립적으로 반올림한 항들로 조립하지 않는다.** `floor(S) − ceil(P)`처럼 각 항을 따로 정규화하면 상한이 계약보다 최대 1초 **더 엄격**해지고, 경계 타임스탬프가 전부 `Date.now()` 밀리초라 소수부가 0인 경우가 오히려 드물어 **정상 경로에서 상시로 1초가 깎인다**(그리고 `focusSec ≤ studySec` 체인을 타고 순공까지 함께 깎인다). 반올림은 **마지막에 한 번만** 한다 — 즉 `Math.floor((sessionMs − pauseMs) / 1000)` 형태로 계산한다(기존 `computeSessionTotals`가 이미 이 기준을 쓴다).
   - **클램프는 방어선이지 계산기가 아니다.** 호출부가 계약을 지킨 값을 넘겼는데 클램프가 그 값을 바꾸면 그건 방어가 아니라 데이터 손실이다. 클램프 통과 전후로 값이 달라지는 경우는 "호출부가 계약을 어겼을 때"뿐이어야 한다.
   - **테스트 요구사항**: 이 경계는 **정수 초 타임스탬프로는 절대 드러나지 않는다.** `...T01:10:00.000Z` 같은 값만 쓰는 테스트는 소수부가 0이라 통과할 뿐이므로, 세션 길이와 일시정지 길이 **양쪽에 서로 다른 소수부(ms)를 갖는 케이스**를 반드시 포함한다.
   - **회귀 관측 신호 — QA 회부 규칙(2026-07-26 WG5와 상호 확인)**: 일시정지가 있었던 세션인데 **S4 헤더에서 `총 공부`가 `HH:MM – HH:MM` 벽시계 범위와 같게 나오면**, 그건 S4의 버그가 아니라 **이 제출 경로가 아직 안 고쳐졌다는 신호**다. `figma-qa-verifier`는 그 증상을 S4가 아니라 **WG4/WG1(제출 경로)으로 회부한다.** 동일 신호와 동일 회부 방향이 `frontend/docs/screens/SCR-S4-study-result.md`의 Data Contract에도 대칭으로 기재돼 있다 — QA가 어느 쪽 스펙을 기대값으로 읽든 같은 결론에 도달한다.
6. `events` 배열에 **PAUSE 구간을 빠짐없이 넣는다.** 서버 규칙상 **0초 이벤트 불가·구간 겹침 불가**이므로, 1초 미만 일시정지는 이벤트로 만들지 말고(또는 최소 1초로 만들지 말고 버리고) 시간 집계에서만 반영할지 WG1/WG2와 규칙을 통일한다.
7. 자동 종료 임계값은 **어떤 경우에도 매직 넘버로 코드에 박지 않는다.** `SessionTuningConfig.autoEndAfterPauseMs` 하나만 두고, 기본값은 한 곳에 상수로 정의한 뒤 주입 가능하게 만든다(환경변수/설정 객체). 값 자체는 미정이므로 상수 옆에 `// TODO(미정): ai-wiki mvp-scope.md 미확정 항목 — 실제 N분 값 확인 필요` 주석을 반드시 남긴다.
8. **일시정지 트리거를 감시 로직 분기에 쓰지 않는다.** `PauseTrigger`는 S3-8 문구 선택 용도 전용이다.
9. 화면 꺼짐·백그라운드 복귀 시 **자동 재개 vs 수동 재개는 `design.md` 백로그의 "구현 시 결정, 임의 확정 금지" 항목**이다. WG2 소유지만 WG4의 복귀 처리와 맞물린다 — 복귀 훅에서 재개 동작을 확정하지 말고 인터페이스만 두고 TODO로 남긴다.
10. V1.0 범위 밖 요소를 추가하지 않는다(로그인, 소셜/멀티룸, 목표 시간, 뽀모도로, 알림·소리·진동). 특히 **자동 종료 시 푸시/사운드 알림을 붙이지 말 것** — 알림 정책은 미정이고, 세션 중 알림·소리·진동 미사용이 확정 정책이다.
11. **싱글룸 프라이버시 문구만 쓴다**: `영상은 기기 안에서만 처리돼요`. `frontend/CLAUDE.md`·`apps/web/CLAUDE.md`·ADR 0002가 LiveKit 멀티룸을 현재형으로 서술하지만 **V1.0 화면 인벤토리에 멀티룸은 없다** — "AI 분석용 원본 프레임이 서버로 전송되지 않는다" 계열 문구를 이 화면에 끌어오지 않는다.

## Accessibility Requirements

- **S3-7 다이얼로그**
  - `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`(타이틀) + `aria-describedby`(본문).
  - **포커스 트랩**과 열림 시 초기 포커스는 **비파괴 버튼(`계속하기`)**에 둔다. 닫힐 때 포커스를 종료 버튼으로 되돌린다.
  - 배경 세션 화면은 열려 있는 동안 `aria-hidden`/`inert` 처리.
  - 버튼 터치 타겟 136×48 — 44px 최소 기준 충족(축소하지 말 것).
  - 파괴적 액션(`공부 종료`)이 파란 primary로 그려져 있어 **색만으로는 파괴성이 구분되지 않는다** — 라벨 문구(`공부 종료`)로 구분되므로 라벨을 임의로 짧게 줄이지 말 것(`종료` 등으로 축약 금지).
- **S3-8**
  - 화면 진입 시 스크린리더가 타이틀부터 읽도록 헤딩 마크업(`<h1>` 또는 `role="heading"`)을 준다. 자동 종료는 사용자가 유발하지 않은 상태 변화이므로 라이브 리전(`aria-live="polite"`)으로도 알린다.
  - 체크 아이콘은 장식이다 — `aria-hidden`. "저장됐다"는 의미는 타이틀 텍스트가 전달한다(**아이콘 단독 전달 금지**).
  - 요약 카드는 라벨↔값 쌍이 읽기 순서대로 연결되게 마크업한다(`<dl>` 권장).
  - CTA 362×56 — 충족.
- **공통**
  - 시간 값은 항상 텍스트로 병기한다(색·그래픽 단독 전달 금지 — `design.md` 상태 컬러 보조 규칙 ①).
  - 폰트 확대(iOS Dynamic Type / 브라우저 확대) 시 다이얼로그 본문 2줄, S3-8 본문 2줄이 잘리지 않도록 고정 높이를 주지 말고 내용 기반 높이로 만든다.
  - `prefers-reduced-motion` 존중 — 다이얼로그 등장/딤 페이드에 모션을 넣는다면 이 설정에서 끈다.

## Current Limitations

- **자동 종료 임계값 N분의 실제 값이 미정이다.** `mvp-scope.md` "미확정 항목"에 `일시정지 자동 종료 대기 시간 N분의 값 (수동 일시정지·화면 꺼짐 공용)`으로, `policies.md` §3에 `N값 튜닝 파라미터`로 남아 있다. `design.md`에도 확정값이 없다. → 빌더는 기본값을 **한 곳의 상수 + 주입 가능한 설정**으로 두고, 실제 분 값은 확인 필요로 남긴다. 이 미정 때문에 화면 구현 자체가 막히지는 않는다.
- **수동 일시정지 방치 자동 종료의 본문 문구가 미정이다**(voice-tone.md §4에 ⚠️ 명시). 화면 꺼짐 문구 재사용 금지.
- **자동 종료 시 제출 `endedAt` 기준이 미정**(일시정지 시작 시각 vs 자동 종료 판정 시각).
- **화면 꺼짐·백그라운드 복귀 시 재개 방식(자동/수동)이 미정**(`design.md` 백로그 6번 — "구현 시 결정, 임의 확정 금지").
- **로딩·에러·오프라인 상태가 디자인되지 않았다.** 제출 실패 시 화면은 기존 훅 `phase`로 임시 처리하고, 오프라인 로컬 큐는 구현하지 않는다.
- **가로 모드(S3-5/S3-6)의 종료 확인 프레임이 Figma에 없다.** 세로 다이얼로그를 재사용한다.
- **다이얼로그 딤 탭 / 뒤로가기 / Esc 닫힘 동작이 디자인되지 않았다.** 비파괴 기본값으로 구현한다.
- Figma의 예시 데이터(`01:24:08`, `총 01:45:12`, `1시간 24분`, `52분`, `1시간 8분`)는 **예시일 뿐**이다. 컴포넌트는 값을 props로 받게 만들고 예시값을 하드코딩하지 않는다.
- 폰트는 Pretendard 미설치로 Figma에서 **Inter 임시 적용** 중이다(`design.md`). 웹 구현도 현행 시스템 폰트 스택을 유지하고 임의로 폰트를 바꾸지 않는다.

## Review Checklist

- [ ] **[에스컬레이션] 일시정지 자동 종료 임계값 N분의 실제 값 확정** — 수동 일시정지·화면 꺼짐 공용 파라미터. 값이 없어도 구현은 진행 가능하나, 출시 전 반드시 확정 필요.
- [ ] **[에스컬레이션] 수동 일시정지 방치로 자동 종료될 때의 S3-8 본문 문구 작성** — voice-tone.md §4의 ⚠️ 미정 항목. 확정 전까지 해당 케이스는 본문 미노출로 구현됨.
- [ ] **[에스컬레이션] Figma ↔ voice-tone 조사 불일치** — `1시간 24분**이** 저장돼요`(Figma `40:98`) vs `1시간 24분**은** 저장돼요`(voice-tone §2·§4). 어느 쪽이 확정인지 판정 후 진 쪽 문서를 고칠 것.
- [ ] 자동 종료 시 서버 제출 `endedAt` 기준 확정(일시정지 시작 시각 vs 자동 종료 판정 시각) — BE 협의 필요.
- [ ] 일시정지 중 종료 다이얼로그를 열어둔 채 자동 종료 임계값 도달 시의 동작 확정.
- [ ] 종료 확인 다이얼로그의 딤 탭 / 뒤로가기 / Esc 닫힘 동작 확정(현재 비파괴 기본값 가정).
- [ ] 다이얼로그가 떠 있는 동안 세션이 계속 측정된다는 가정 확인(Figma 근거 추론 — 상태 필이 `집중 측정 중` 유지).
- [ ] 가로 모드(S3-5/S3-6)에서의 종료 확인 다이얼로그 레이아웃 확인 — Figma 프레임 부재, 세로 다이얼로그 재사용으로 구현 예정.
- [ ] `공부 종료`(파괴적 액션)를 파란 primary로 두는 것이 최종 의도인지 확인 — `design.md` 상태 컬러 보조 규칙 ③("상태 컬러는 상태 표시 전용, 액션은 brand 토큰만")과 Figma 컴포넌트 설명("Dark SM primary는 다크 위 시인성용 blue/500=state/focus")이 형식상 어긋난다. 값은 `#1B64DA`로 동일해 시각 결과는 같지만, 토큰 의미상 `brand/primary`로 바인딩을 바꿔야 하는지 디자인 확인 필요.
- [ ] **[디자인 확인] S3-8 요약 카드 구분선 색** — Figma `63:596`이 `#EFF1F3` 하드코딩(변수 바인딩 없음, 다크 대응값 없음)이라 `colors.border.default`로 대체했다. 라이트에서 3계조 차이가 난다. 두 가지 중 하나로 확정 필요: 1. **`border/default`로 확정**(현재 구현, 권장) → 디자이너가 **Figma `63:596`에 `border/default` 변수 바인딩을 추가**해야 한다. 지금은 하드코딩이라 다음 익스포트 때 같은 문제가 반복되고, **Figma 자체 다크모드에서도 이 헤어라인이 깨져 보인다.** 참고: `SCR-S1-home.md`의 두들 일러스트(`32:94`)에서 이미 같은 유형이 발생해 같은 방식으로 처리했다. 2. 라이트에서 더 옅은 헤어라인이 정말 의도된 것이라면 → `design-tokens-sync`에 `border/subtle`(라이트 `#EFF1F3` + **디자이너가 정한** 다크값) 토큰 신설을 요청하고 스펙을 그 토큰으로 교체한다. **다크값을 개발이 지어내지 않는다** — 원본이 Figma 변수조차 아니므로 임의 생성은 디자인 시스템 날조가 된다.
- [ ] 자동 종료 경로에서 제출 실패 시의 처리 확정 — 현재 S3-8 타이틀이 "저장했어요"로 단언하므로 그대로 노출할 수 없다.
- [ ] 1초 미만 PAUSE 구간의 이벤트 처리 규칙을 WG1/WG2와 통일(서버가 0초 이벤트를 거부함).
- [ ] **[BE 확인] 서버가 `studySec` 상한을 계산할 때의 정밀도** — 계약 주석은 `0 ≤ studySec ≤ (endedAt − startedAt) − PAUSE 합`인데, `startedAt`/`endedAt`은 **밀리초 정밀도 ISO 문자열**로 전송된다. 서버가 이 상한을 ms 그대로 쓰는지 초 단위로 내림하는지 확인되지 않았다. 클라이언트는 `floor((S − P)/1000)`(계약보다 느슨해지지 않는 쪽)로 계산하지만, 서버가 더 엄격하면 경계 세션에서 400이 날 수 있다.
- [ ] `buildSessionRequest` 클램프를 PAUSE 인식하도록 고치는 작업의 담당 확정 — WG1과 공동 수정 파일. WG5(S4 헤더의 "총 공부 ≠ 시각 범위" 표현)가 이 수정에 의존한다.
- [ ] S4 라우트 경로 확정(`/room/:id/result` 기본안, WG5 스펙) — WG4는 새 라우트를 만들지 않으므로 충돌은 없지만, 이동 핸들러의 목적지가 이 확정에 달려 있다.

## 관련 스펙

- `frontend/docs/screens/SCR-S4-study-result.md`(WG5) — 두 화면의 이동 목적지. 진입 계약(제출 성공 시에만 이동, `StudySessionResponse[]`를 라우터 state로 전달)은 2026-07-26 WG5와 상호 확인함.
- `frontend/docs/screens/SCR-S3-3-S3-4-session-paused-simple.md`(WG2) — 일시정지 상태의 소유자. 이 문서의 자동 종료 감시는 그 상태를 소비한다.
- `frontend/docs/screens/SCR-S3-1-S3-2-session-preview-unfocused.md`(WG1) — 세션 상태 머신·훅 확장의 소유자. `submitStudySession.ts` 공동 수정 대상.
