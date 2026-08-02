# SCR-S3-1 · S3-2 세션 프리뷰 / 비집중(자동 감지)

## Purpose

공부 세션이 실제로 돌아가는 화면이다. 전면 카메라 프리뷰를 풀스크린으로 깔고 그 위에 **상단 상태 필**(지금 집중으로 인정되고 있는지)과 **순공 타이머(총 공부 시간 병기)**, **하단 컨트롤 바**(일시정지·카메라 전환·종료)를 얹는다. 사용자가 세션 중에 계속 보게 되는 유일한 화면이므로, "지금 내 시간이 쌓이고 있는가"를 한눈에 알 수 있어야 한다.

S3-1(집중)과 S3-2(비집중)는 **별개의 화면이 아니라 같은 화면의 두 상태**다. 자리 이탈·휴대폰 사용·기기 조작이 감지되면 사용자의 입력 없이 S3-2로 바뀌고, 감지가 해제되면 문구 없이 S3-1로 돌아온다. 비집중 상태에서는 순공 타이머만 멈추고 총 공부 시간은 계속 흐른다 — 이 차이가 화면에서 읽혀야 한다(타이머 회색 처리 + 오렌지 상태 필 + 추정형 문구).

## Source Of Truth

- Figma file: **FocusON V1.0 Design** (파일 키 `KmTbXL79g6ximY1RcnBZDz`)
- Figma page: `📱 3. Screens — iOS (V1.0)` — node `14:4`
- S3-1
  - Figma frame: `S3-1 · 집중 측정 중`
  - Figma node: **`58:323`** (2026-07-26 `get_metadata`로 직접 확인)
  - URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=58-323
- S3-2
  - Figma frame: `S3-2 · 비집중 감지 (자동)`
  - Figma node: **`59:311`** (동일 확인)
  - URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=59-311
- 두 화면이 공유하는 컴포넌트 노드(`2. Components` 페이지, node `14:3`)
  | 컴포넌트                      | 노드                                                       | Figma 설명(원문)                                                                                                                                                                                             |
  | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `Session / Camera Preview BG` | `58:109`                                                   | "세션 카메라 프리뷰 목업 배경 402×874. base #1A2029 + 사선 라이트 밴드 2.8% + 프리뷰 라벨. **실제 앱에서는 카메라 피드 영역.**"                                                                              |
  | `Session / Status Pill`       | `34:14` (Focus 인스턴스 `34:5` · Distract 인스턴스 `34:9`) | "세션 상단 중앙 상태 필. 글래스(blur 10) 다크 캡슐. Focus=블루 도트·화이트 12% 보더 / Distract=오렌지 도트·오렌지 35% 보더 / Paused=그레이 도트·화이트 14% 보더. 항상 다크 배경(카메라/미니멀) 위에서 사용." |
  | `Session / Control Bar`       | `34:32`                                                    | "세션 하단 디스코드형 컨트롤 바. 244×80, 글래스(blur 14) 캡슐, 핸들 36×4 상단 중앙. 버튼 50 원형: 일시정지·카메라 전환(white 12%), 종료(#FF6B77). 세로/가로 공통."                                           |
  | `iOS / Status Bar`            | `48:131`                                                   | OS 크롬 목업 — **앱이 그리지 않는다**                                                                                                                                                                        |
  | `iOS / Home Indicator`        | `36:25`                                                    | OS 크롬 목업 — **앱이 그리지 않는다**                                                                                                                                                                        |
- ai-wiki 근거 문서
  - `ai-wiki/product/design.md` — "V1.0 최종 확정"의 `S3 세션 공통`·`자동 비집중` 행, "인터뷰 6차 확정"의 세션 화면 번호 재편·세션 오버레이 색
  - `ai-wiki/product/mvp-scope.md` — 세션 상태 모델 / 집중 감지 로직 / 감지 파라미터 / 세션 UX 정책
  - `ai-wiki/product/policies.md` — 측정 대원칙, 카메라·데이터 프라이버시
  - `ai-wiki/product/voice-tone.md` — §3 상태 문구, §4 세션(S3-1~S3-6), §4 토스트
  - `ai-wiki/project/glossary.md` — 순공시간·총 공부 시간·비집중·일시정지·자리 이탈·휴대폰 사용·기기 조작
  - `ai-wiki/product/user-flow.md` — 핵심 플로우, 화면 목록
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — 번호 재편, 화면 꺼짐→일시정지 합산
- Ownership: `frontend/docs/screen-ownership.md` — **`apps/web` 소유**(모바일은 WebView로 로드, ADR 0001)
- 담당 앱: **`apps/web`** / 담당 빌더: `web-screen-builder` / 그룹: WG1

> Figma가 이 화면의 시각적 SSOT다. 구현 착수 시 `figma:figma-design-to-code` 스킬을 먼저 호출한 뒤 위 두 노드를 `get_design_context`로 다시 읽는다. 절대 좌표(`top-[633px]` 등)를 그대로 베끼지 말고 flex 레이아웃으로 매핑한다 — 이 화면은 402×874 고정이 아니라 임의 크기의 WebView/브라우저 뷰포트에서 동작해야 한다.

## Ownership Boundary

**이 화면이 하는 일**

- `apps/web`의 세션 화면 프레젠테이션(S3-1 프리뷰 상태 · S3-2 비집중 상태)
- `useStudyRoomSession` 훅 확장 — 순공/총 두 타이머 분리, 세션 상태 머신, 상태 이벤트(`StatusEventPayload[]`) 누적

**이 화면이 하지 않는 일 (넘지 말 것)**

- **실제 카메라·Vision·RTC 구현 금지.** `getUserMedia`, MediaPipe, TensorFlow.js, LiveKit, EfficientDet 등 **어떤 SDK도 설치하지 않는다.** 카메라 피드와 감지 신호는 **인터페이스 + mock**으로만 만든다(근거: `frontend/CLAUDE.md` "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것", 실기기 스파이크 전 조기 전환 금지). Figma의 사선 스트라이프 배경은 **목업**이며, 구현에서는 "카메라 피드가 들어올 자리"를 나타내는 mock 서피스로 만든다.
- **다른 WG의 프레젠테이션을 만들지 않는다** — S3-3 일시정지 화면·S3-4 심플 모드(WG2), S3-5/S3-6 가로(WG3), S3-7 종료 확인·S3-8 자동 종료(WG4), S4 결과(WG5). 단, **상태 전이와 콜백 자리는 WG1이 만든다**(아래 Interaction Contract).
- **`apps/mobile`을 건드리지 않는다.** 모바일의 WebView 진입 라우트(`apps/mobile/app/room/[id]`)는 이 태스크 범위 밖이다.
- **V1.2+ 범위 금지** — 멀티룸/소셜 UI(참가자 그리드, 방 목록, 로그인)를 추가하지 않는다. V1.0 화면 인벤토리에 멀티룸 화면은 존재하지 않는다.

## Current Figma Structure

`get_metadata` + `get_design_context`로 확인한 실제 트리(추측 없음).

```text
S3-1 · 집중 측정 중  (frame 58:323, 402×874)
  Session / Camera Preview BG   (58:324 → 컴포넌트 58:109)  절대 배치 0,0 402×874
    base #1A2029 + 사선 stripe(white 3%) 12개 + 라벨 "[  전 면  카 메 라  프 리 뷰  ]"
    ※ 프레임 최상위에서 이 레이어가 탭 타깃(cursor-pointer) — 심플 모드 전환 영역
  iOS / Status Bar              (58:338)  0,0 402×59      ← OS 크롬, 앱이 그리지 않음
  Session / Status Pill [Focus] (58:355)  141,72 120×36
    · 도트 8×8 (state/focus 바인딩) + "집중 측정 중" 14px/18 Medium white
    · bg rgba(16,20,25,0.65) · border 1px rgba(255,255,255,0.12) · r999 · px16 py9 · gap8 · backdrop-blur
  text "01:24:08"               (58:358)  0,633 402×60    52px/60 Bold, white, tracking -0.5, 가운데 정렬
  text "총 01:45:12"            (58:359)  0,700 402×18    15px/18 Medium, rgba(255,255,255,0.42)
  text "영상은 기기 안에서만 처리돼요" (58:360) 0,726 402×14  12px/14 Regular, rgba(255,255,255,0.55)
  Session / Control Bar         (58:361)  79,756 244×80   ← 컴포넌트 34:32
    bg rgba(22,27,34,0.55) · border 1px rgba(255,255,255,0.1) · r999 · pt16 pb12 px24 · gap22 · backdrop-blur
    handle 36×4 r999 rgba(255,255,255,0.22)  상단 중앙 top 5
    btn/pause       50×50 원형 bg rgba(255,255,255,0.12) · icon/pause 16×18 (구현 일치)
    btn/camera-flip 50×50 원형 bg rgba(255,255,255,0.12) · icon/camera-flip 20×20
    btn/exit        50×50 원형 bg #FF6B77                 · icon/exit 19×19
  iOS / Home Indicator          (58:377)  0,853 402×21    ← OS 크롬, 앱이 그리지 않음
  hs/pause (70:1191) · hs/exit (70:1193)  ← 프로토타입 핫스팟 전용, 구현 대상 아님

S3-2 · 비집중 감지 (자동)  (frame 59:311, 402×874)
  Session / Camera Preview BG   (59:312)  S3-1과 동일
  iOS / Status Bar              (59:313)
  Session / Status Pill [Distract] (59:314) 85,72 218×36
    · 도트 8×8 (state/distract 바인딩) + "휴대폰을 사용 중인 것 같아요" 14px/18 Medium white
    · bg rgba(16,20,25,0.68) · border 1px rgba(255,158,27,0.35) · r999 (Focus와 배경 알파·보더만 다름)
  text "내려놓으면 자동으로 다시 측정돼요" (59:353) 0,116 402×14  12px/14 Regular rgba(255,255,255,0.6)
    ※ 필 **안**이 아니라 필 **아래 별도 텍스트**다 (필 하단 y=108, 서브 문구 y=116 — 8px 간격)
  text "01:24:08"               (59:315)  0,633  52px/60 Bold  **#8B95A1** (S3-1은 white)
  text "총 01:45:12"            (59:316)  0,700  S3-1과 동일 — **색이 바뀌지 않는다**(총 공부는 계속 흐름)
  text "영상은 기기 안에서만 처리돼요" (59:317) 0,726  S3-1과 동일
  Session / Control Bar         (59:318)  79,756  S3-1과 동일 (일시정지 버튼 그대로 — 재개 버튼 아님)
  iOS / Home Indicator          (59:319)
```

**두 프레임의 차이는 정확히 4가지뿐이다**: ① 상태 필 variant(도트 색·보더·배경 알파·문구) ② 필 아래 서브 문구 유무 ③ 순공 타이머 색(white → `#8B95A1`) ④ 그 외 전부 동일. 컨트롤 바·총 공부 시간·프라이버시 캡션·레이아웃은 완전히 같다 — **두 개의 페이지가 아니라 하나의 컴포넌트에 state prop을 주는 구조**로 구현한다.

## Content

모든 문구는 `ai-wiki/product/voice-tone.md`에서 **그대로** 가져온다. 의역·재작성 금지.

### 상태 필 (S3-1 / S3-2)

| 상태                 | 메인 문구(필 안)               | 서브 문구(필 아래)                     |
| -------------------- | ------------------------------ | -------------------------------------- |
| 집중 (S3-1)          | `집중 측정 중`                 | 없음                                   |
| 비집중 — 자리 이탈   | `자리를 비운 것 같아요`        | `돌아오면 자동으로 다시 측정돼요`      |
| 비집중 — 휴대폰 사용 | `휴대폰을 사용 중인 것 같아요` | `내려놓으면 자동으로 다시 측정돼요`    |
| 비집중 — 기기 조작   | `기기를 조작 중인 것 같아요`   | `제자리에 두면 자동으로 다시 측정돼요` |

- **Figma에는 비집중 3종 중 "휴대폰 사용" 인스턴스 하나만 그려져 있다.** 나머지 두 문구는 위 표(voice-tone.md §3)대로 구현한다 — Figma에 없다고 빠뜨리지 않는다.
- **비집중 해제 시 문구를 띄우지 않는다.** 색만 복귀한다("재개를 굳이 알리지 않는다 — 공부 방해 최소화", voice-tone.md §3).
- 추정형 어미(`~것 같아요`)를 단정형으로 바꾸지 않는다. 감지 오탐 가능성을 문구가 흡수하는 구조다(voice-tone.md §1).
- `일시정지` 상태 문구(`측정을 일시정지했어요` / `다시 시작하면 이어서 측정돼요`)는 **WG2 범위**다. 상태 필 컴포넌트에는 `paused` variant 자리만 만들고 문구 배선은 WG2가 채운다.

### 타이머·캡션

| 항목            | 문구 / 형식                                  | 근거                                                         |
| --------------- | -------------------------------------------- | ------------------------------------------------------------ |
| 순공 타이머     | `HH:MM:SS` (00:00:00부터, **항상 2자리 시**) | voice-tone.md §2 — "1시간 미만 MM:SS" 규칙은 2026-07-26 폐기 |
| 총 공부 병기    | `총 HH:MM:SS` (예: `총 01:45:12`)            | voice-tone.md §4 세션                                        |
| 프라이버시 캡션 | `영상은 기기 안에서만 처리돼요`              | voice-tone.md §4 세션 "기본 캡션"                            |

- 프라이버시 캡션은 **싱글룸 문구**다. V1.0에는 멀티룸 화면이 없으므로 "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다" 같은 멀티룸 문구를 이 화면에 절대 쓰지 않는다. `frontend/CLAUDE.md`·`apps/web/CLAUDE.md`·ADR 0002가 LiveKit 멀티룸을 현재형으로 서술하지만 그건 향후 아키텍처 방침 설명이다 — 여기서 문구를 끌어오지 않는다.
- 타이머 예시값 `01:24:08` / `01:45:12`는 **Figma 목업 데이터**다. 구현은 실제 경과 시간으로 렌더한다.

### 토스트 (카메라 전환 버튼)

| 상황             | 문구                     |
| ---------------- | ------------------------ |
| 전환 성공        | `카메라를 전환했어요`    |
| 전환 실패        | `전환할 카메라가 없어요` |
| 카메라 꺼짐 상태 | `카메라가 꺼져 있어요`   |

토스트는 2026-07-26 6차 인터뷰에서 확정된 **신규 컴포넌트**다. Figma의 `Screens — iOS` 페이지 S3-1/S3-2 프레임에는 토스트가 그려져 있지 않다 — 시각 스펙(위치·배경·지속시간)이 없으므로 아래 Current Limitations 참고.

## Data Contract

### 이미 존재하는 타입 — `frontend/packages/types/src/index.ts` (백엔드 Swagger 기준, 그대로 재사용)

```ts
export type StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE";

export interface StatusEventPayload {
  status: StudyEventStatus;
  startedAt: string; // UTC ISO-8601
  endedAt: string; // UTC ISO-8601
}

export interface StudySessionCreateRequest {
  userId: number;
  startedAt: string;
  endedAt: string;
  studySec: number; // 0 ≤ studySec ≤ (endedAt−startedAt) − PAUSE 시간 합
  focusSec: number; // 0 ≤ focusSec ≤ studySec
  events: StatusEventPayload[];
}
```

- 제출 응답 타입 `StudySessionResponse`(`statDate`·`focusRate` 포함)도 이미 존재한다. 이 화면은 제출 후 S4로 넘길 때만 쓴다(S4 화면 자체는 WG5).
- `StatusEventPayload` 서버 검증 규칙(타입 주석 기준): **세션 구간 안 · 서로 겹침 불가 · 0초 불가**. 아래 "동시 감지" 항목이 여기 걸린다.

### 화면 상태 ↔ `StudyEventStatus` 매핑 (이 화면의 핵심 계약)

| 감지 트리거 (mvp-scope.md 감지 로직) | 감지 수단                              | 상태 필 문구                   | 순공     | 총 공부  | 서버 이벤트 `status`       |
| ------------------------------------ | -------------------------------------- | ------------------------------ | -------- | -------- | -------------------------- |
| 자리 이탈 (Absence)                  | 전면 카메라 — 사람(person) 미검출      | `자리를 비운 것 같아요`        | **정지** | 진행     | `AWAY`                     |
| 휴대폰 사용 (Phone Usage)            | 전면 카메라 — 촬영 기기 외 휴대폰 검출 | `휴대폰을 사용 중인 것 같아요` | **정지** | 진행     | `PHONE`                    |
| 기기 조작 (Device Handling)          | 가속도 센서 — 촬영 중인 기기 조작      | `기기를 조작 중인 것 같아요`   | **정지** | 진행     | `DEVICE`                   |
| 수동 일시정지 / 화면 꺼짐·백그라운드 | 사용자 입력 / 앱 라이프사이클          | (WG2)                          | **정지** | **정지** | `PAUSE`                    |
| 집중 (기본 상태)                     | —                                      | `집중 측정 중`                 | 진행     | 진행     | **이벤트로 기록하지 않음** |

- `PAUSE`는 수동/화면꺼짐 **구분 없이 하나**로 보낸다. 2026-07-26 6차 확정으로 '화면 꺼짐' 라벨은 삭제되고 일시정지에 합산된다 — 별도 status 코드를 만들지 않는다.
- **⚠️ `DEVICE` 정의 상충 — 확인 필요.** `packages/types`의 주석은 `DEVICE=다른 기기`라고 쓰여 있는데, `ai-wiki/project/glossary.md`는 `디바이스 조작(Device Handling) = 가속도 센서로 **촬영 중인 기기**가 조작되고 있다고 감지한 상태`로 정의한다. "다른 기기"는 `PHONE`("촬영 기기 외의 휴대폰")과 의미가 겹친다. **ai-wiki 정의를 기준으로 구현하되**(2026-07-26 기준으로 더 최신), 백엔드 담당자에게 주석 정정을 확인한다. 임의로 타입 주석을 고치지 말 것.
- **⚠️ 저조도 등 감지 신뢰도 저하 — 전용 코드·문구 없음.** `mvp-scope.md`는 "카메라는 켜져 있으나 모델이 사람을 잡을 수 없는 상태 = 비집중과 동일 처리"라고 정한다. 이 조건은 자리 이탈(Absence) 감지기가 발화하는 조건과 같으므로 자연히 `AWAY` + `자리를 비운 것 같아요`로 흡수된다. **별도 status 코드나 별도 문구를 만들지 않는다**(voice-tone에 해당 문구가 없다 — 새로 지어내지 말 것).
- **⚠️ 동시 다중 감지 시 이벤트 type 선택 규칙 — 미정, 리더/사용자 확인 필요.** `mvp-scope.md`는 "하나라도 비집중을 감지하면 순공 타이머를 정지"라고만 정해 화면 표시(비집중 상태)는 문제없지만, 서버 이벤트는 `status` 하나만 갖고 **구간이 서로 겹칠 수 없다**. 예: 자리 이탈 중에 기기 조작이 겹치면 이벤트를 어떻게 쪼갤지가 계약에 없다. 구현은 (a) 상태 머신이 "현재 대표 트리거" 하나만 유지하고 (b) 대표 트리거가 바뀌면 이벤트를 끊고 새로 시작하는 구조로 **인터페이스만** 만들고, 우선순위 규칙은 `TODO(리더 확인)`로 남긴다. 상상으로 우선순위를 확정하지 말 것.

### 이 화면에 필요한데 계약이 없는 것 — 백엔드 계약 미확인, 상상 계약 금지

- **일시정지 구간의 "벽시계 기준 별도 집계"**: `mvp-scope.md`는 "일시정지 N회 · 시간"을 결과·기록에 표기하라고 정했지만, `StudySessionSummary`/`StudySessionListResponse`에는 `eventCounts: Record<StudyEventStatus, number>`(횟수)만 있고 **상태별 누적 시간 필드가 없다**. 클라이언트가 `events`의 `startedAt`/`endedAt` 차이로 계산해야 하는지, 서버가 별도 필드를 줄 것인지 미확인. → **백엔드 계약 미확인 — 상상 계약 금지: 상태별 누적 시간(pauseSec/distractionSec 등)**
- **세션 진행 중 서버 동기화**: 훅 주석("서버는 세션을 실시간 추적하지 않고, 앱이 잰 studySec/focusSec을 그대로 저장한다")대로 **세션 중에는 어떤 API도 호출하지 않는다.** 진행 중 heartbeat/스트리밍 API를 만들지 말 것.
- **일시정지 자동 종료 임계값 N분**: `mvp-scope.md` 미확정 항목. WG1은 값을 정하지 않는다(감시 로직 자체는 WG4가 공용 파라미터 하나로 구현).

### 세션 상태 머신 (WG1이 만드는 것 — 제안 형태, 빌더가 구조는 조정 가능)

```ts
// apps/web/src/features/study-session/ — 순수 로직, DOM/SDK 의존 금지
export type DistractionTrigger = "AWAY" | "PHONE" | "DEVICE"; // StudyEventStatus의 부분집합
export type PauseTrigger = "MANUAL" | "BACKGROUND"; // 서버에는 둘 다 "PAUSE"로 전송

export type SessionState =
  | { kind: "FOCUS" }
  | { kind: "DISTRACTION"; trigger: DistractionTrigger; sinceMs: number }
  | { kind: "PAUSE"; trigger: PauseTrigger; sinceMs: number }; // 프레젠테이션은 WG2
```

- 심플 모드(S3-4)는 **상태가 아니라 프레젠테이션 토글**이다 — `SessionState`에 넣지 말고 별도 boolean으로 둔다(WG2가 뷰를 채운다).
- 감지 파라미터는 **하드코딩 금지**, 설정 객체로 주입한다(`mvp-scope.md` "감지 파라미터" — M1 테스트로 튜닝 예정):

  | 감지기      | 비집중 진입(유지) | 자동 재개(유지) |
  | ----------- | ----------------- | --------------- |
  | 자리 이탈   | 1.5초             | 2초             |
  | 휴대폰 사용 | 0.5초             | 1.5초           |
  | 기기 조작   | 0.5초             | 2초             |

## Interaction Contract

### 자동 (사용자 입력 없음)

- **비집중 진입**: 감지기 신호가 위 유지시간을 넘기면 `FOCUS → DISTRACTION`. 화면의 상태 표시만 바뀐다 — **알림·소리·진동을 쓰지 않는다**(mvp-scope.md 세션 UX 정책, 공부 방해 최소화). 순공 타이머 정지, 총 공부 타이머는 계속.
- **비집중 해제**: 해제 유지시간을 넘기면 `DISTRACTION → FOCUS` **자동 재개**(사용자 확인 불필요). 문구를 띄우지 않고 색만 복귀한다.
- **상태 전환 모션**: `design.md`는 심플 모드의 "엣지 글로우 1~2초 잔향"만 정하고 있고, 프리뷰 모드의 전환 모션 값은 `6. Spec — Motion & Handoff` 페이지에 있을 수 있다 — WG1은 과한 애니메이션을 지어내지 말고 **색·문구의 짧은 페이드(200~300ms 수준)** 정도로 두고, 정확한 값이 필요하면 리더에게 확인한다.

### 사용자 입력

| 대상                              | 동작                                                                                                              | WG1 범위                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 화면 탭 (**컨트롤 바 영역 제외**) | 심플 모드(S3-4) 전환. 한 번 더 탭하면 대칭 복귀                                                                   | **탭 영역 경계와 토글 상태까지 WG1**. 심플 프레젠테이션은 WG2 |
| 일시정지 버튼                     | `→ PAUSE(MANUAL)`. 순공·총 모두 정지, 버튼은 파란 재개 버튼으로 교체, 캡션 `일시정지 중에는 시간이 흐르지 않아요` | **상태 전이까지 WG1**. 일시정지 프레젠테이션은 WG2            |
| 카메라 전환 버튼                  | 전/후면 전환 → 토스트. **mock 어댑터가 성공/실패를 반환**하고 그 결과에 맞는 문구를 띄운다                        | WG1 (mock)                                                    |
| 종료 버튼                         | 종료 확인 다이얼로그(S3-7)를 연다 — **즉시 종료하지 않는다**                                                      | **콜백 자리만 WG1**. 다이얼로그는 WG4                         |
| 화면 꺼짐 / 백그라운드 전환       | `→ PAUSE(BACKGROUND)` (2026-07-26: 비집중 아님, 일시정지에 합산)                                                  | 이벤트 훅 자리만. 동작은 WG2                                  |

### 미정 — 리더/사용자 확인 필요 (임의 확정 금지)

- **화면 꺼짐·백그라운드 복귀 시 재개 방식 — 자동 재개 vs 일시정지 화면에서 수동 재개.** `design.md` 백로그 6번 / `mvp-scope.md` 미확정 항목 / 6차 인터뷰 "보류"에 명시적으로 "구현 시 결정, **임의 확정 금지**"로 남아 있다. → 인터페이스(`onReturnFromBackground` 훅)만 만들고 동작은 `TODO(미정: 자동/수동 재개 — 리더 확인)` 주석으로 남긴다.
- **첫 세션 힌트 1회 노출.** `ai-wiki/product/user-flow.md` S3-1 행에 "화면 탭(바 제외)으로 심플 모드 전환, **첫 세션 힌트 1회**"라고 적혀 있으나, **Figma S3-1 프레임(`58:323`)에는 힌트 UI가 존재하지 않는다**(레이어 목록 확인 완료). 문구도 voice-tone.md에 없다. → **WG1은 구현하지 않는다.** 온보딩 가이드 G3(`탭 한 번이면, 타이머만 크게`)가 같은 역할을 하므로 중복일 가능성이 있다 — 리더 확인 항목.
- **동시 다중 감지 시 대표 트리거 우선순위** (위 Data Contract 참고).

## Design Tokens Used

`frontend/packages/design-tokens/src/index.ts`에 **실제로 존재함을 직접 확인한** 키만 나열한다(2026-07-26 Figma Foundations 동기화 완료 상태).

| 용도                  | 토큰                                                                                            | 이 화면에서 쓰는 값                       |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 집중 상태 도트        | `colors.state.focus`                                                                            | **dark 값 `#4593FC`** (아래 주의)         |
| 비집중 상태 도트·보더 | `colors.state.distract`                                                                         | **dark 값 `#FF9E1B`** (보더는 35% 알파)   |
| 비집중 타이머 색      | `colors.text.tertiary` (`#8B95A1`, light/dark 동일)                                             | `#8B95A1` — Figma 실측과 일치             |
| 종료 버튼             | `colors.feedback.error`                                                                         | dark 값 `#FF6B77` — Figma 실측과 일치     |
| 상태 3색 참조         | `sessionStateColors.FOCUS / DISTRACTION / PAUSE`                                                | 상태 필·타이머 색 매핑                    |
| 이벤트 색 매핑        | `eventStatusColors` (`PHONE`/`DEVICE`/`AWAY`/`PAUSE`)                                           | 비집중 3종은 전부 같은 오렌지             |
| 반경                  | `radius.full` (999)                                                                             | 상태 필·컨트롤 바·원형 버튼               |
| 캡션 타이포           | `typography.caption` (12/16 Regular)                                                            | 프라이버시 캡션·비집중 서브 문구          |
| 상태 필 텍스트        | `typography.label.md` (14/20 Medium)                                                            | Figma 실측 line-height는 18 — 18로 맞춘다 |
| 간격                  | `spacing.sm`(8) · `spacing.md`(12) · `spacing.lg`(16) · `spacing.xl`(20) · `spacing["2xl"]`(24) | 필 gap 8 / 바 pt16 pb12 px24              |

**⚠️ 세션 오버레이는 시스템 테마와 무관하게 항상 다크다.** `get_variable_defs`로 두 프레임을 조회하면 `state/focus: #1b64da`, `state/distract: #ff8a00`(= **Light 모드 해석값**)이 돌아온다. 하지만 6차 인터뷰가 "세션 오버레이 색: 다크 오버레이 전용 값 — 집중 `#4593FC` · 비집중 `#FF9E1B` · 일시정지 `#8B95A1`"로 확정했고, Figma의 S3-2 상태 필 보더도 실제로 `rgba(255,158,27,0.35)`(=`#FF9E1B`)를 쓴다. → **다크 값을 쓴다.** 시스템 라이트 모드에서 이 화면이 밝아지면 안 된다.

### 토큰 스케일 밖 실측값 (세션 오버레이 전용 — 토큰화되어 있지 않다)

```text
카메라 영역 base         #1A2029                      (실제 앱에서는 카메라 피드)
상태 필 배경             rgba(16,20,25,0.65)  Focus  /  rgba(16,20,25,0.68)  Distract
상태 필 보더             rgba(255,255,255,0.12) Focus / rgba(255,158,27,0.35) Distract
컨트롤 바 배경/보더      rgba(22,27,34,0.55) / rgba(255,255,255,0.1)
컨트롤 버튼 배경         rgba(255,255,255,0.12)   (일시정지·카메라 전환)
컨트롤 바 핸들           36×4 r999 rgba(255,255,255,0.22)
순공 타이머              52px / line-height 60 / Bold / letter-spacing -0.5px
총 공부 병기             15px / 18 / Medium / rgba(255,255,255,0.42)
프라이버시 캡션          12px / 14 / Regular / rgba(255,255,255,0.55)
비집중 서브 문구         12px / 14 / Regular / rgba(255,255,255,0.6)
```

- 타이머 **52px는 표준 타이포 스케일 밖**이다(`display.lg` 56 / `display.sm` 40). S1 홈과 같은 방침으로 **실측값을 그대로 쓰고** 억지로 스케일에 맞추지 않는다.
- **글래스 블러**: Figma Effect 변수는 `blur/glass-soft` radius **10**(상태 필), `blur/glass-strong` radius **14**(컨트롤 바)다. `get_design_context`가 생성한 CSS는 `backdrop-blur-[5px]` / `[7px]`로 내려온다 — Figma의 background-blur radius를 CSS `backdrop-filter: blur()`로 변환하며 절반이 된 값이다. **CSS 구현에는 5px / 7px을 쓴다**(시각적으로 Figma와 일치). 상충이 아니라 단위 변환이다.
- 이 실측값들을 `packages/design-tokens`에 새 토큰으로 밀어 넣지 말 것 — 세션 오버레이 전용 값이라 시맨틱 토큰 체계와 층이 다르다. `apps/web` 내부의 세션 스타일 상수로 둔다.

**apps/web 테마 갭**: `apps/web/src/index.css`의 `@theme inline`에는 현재 `background`·`foreground`·`primary`·`muted`·`border`·`radius`만 정의돼 있고 **`state/focus`·`state/distract`·`text/tertiary`가 없다.** 빌더는 세션 상태색을 (a) `@focusmakers/design-tokens`에서 직접 import 하거나 (b) `index.css`에 세션 전용 CSS 변수를 추가해야 한다 — 어느 쪽이든 값의 출처는 `packages/design-tokens`여야 하고 하드코딩 hex를 흩뿌리지 않는다.

## Components

### 기존 자산 — 반드시 재사용/확장 (버리지 말 것)

| 파일                                                                       | 상태                                                                                 | WG1이 할 일                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/web/src/routes/RoomPage.tsx`                                         | 임시 검증용 뷰. 파일 상단에 "**디자인 확정 시 이 파일만 새 화면으로 교체한다**" 주석 | 프레젠테이션 **전면 교체**. 로직은 훅에 있으므로 여기엔 표시만 남긴다 |
| `apps/web/src/features/study-session/useStudyRoomSession.ts`               | 입장 시각·경과 타이머·종료 제출·phase 전이 보유                                      | **확장**(아래 갭 목록) — 삭제·재작성 금지                             |
| `apps/web/src/features/study-session/submitStudySession.ts`                | `buildSessionRequest` 클램프 체인(0 ≤ focusSec ≤ studySec ≤ 세션 길이) + POST        | 그대로 사용. `events`는 이미 파라미터로 받게 돼 있다                  |
| `apps/web/src/features/study-session/__tests__/submitStudySession.test.ts` | 기존 테스트                                                                          | 깨뜨리지 말 것                                                        |
| `apps/web/src/routes/__tests__/RoomPage.test.tsx`                          | 기존 테스트                                                                          | 새 프레젠테이션에 맞게 갱신                                           |
| `apps/web/src/components/ui/button.tsx`, `src/lib/utils.ts`(`cn`)          | shadcn 프리미티브 관례                                                               | 새 컴포넌트도 이 관례(`cva` variants, `cn`)를 따른다                  |

### `useStudyRoomSession`의 실제 갭 (직접 확인 — 이걸 메우는 게 WG1의 로직 작업이다)

1. **타이머가 하나뿐이다.** `elapsedSec` 단일 값이고 `startedAtMsRef` 기준 벽시계 경과만 잰다. → **순공(focusSec)·총 공부(studySec) 두 축**으로 분리해야 한다. 비집중은 순공만, 일시정지는 둘 다 정지.
2. **상태 이벤트 추적이 전혀 없다.** 제출 시 `events: []` 하드코딩이고 `studySec = focusSec = 세션 길이`다(훅 주석이 "Vision 도입 시 이 값들만 실제 측정값으로 교체한다"고 명시). → `StatusEventPayload[]` 누적 로직을 추가한다.
3. **`formatElapsed`가 확정 표기 규칙을 위반한다.** 현재 `` `${h}:${MM}:${SS}` ``로 **시(hour)에 zero-pad가 없어** `1:24:08`이 나온다. voice-tone.md §2 확정 규칙은 **항상 `HH:MM:SS`** (`01:24:08`). → `h`에도 `padStart(2, "0")`을 적용하고 기존 테스트를 함께 갱신한다.
4. **일시정지·비집중 개념 자체가 없다.** `StudyRoomPhase`는 `studying`/`submitting`/`done`/`error`/`unsaved`(= 제출 라이프사이클)이고, 세션 내부 상태(FOCUS/DISTRACTION/PAUSE)와는 **다른 축**이다. 두 축을 하나로 합치지 말고 별도 상태로 둔다.
5. **`tabular-nums`가 적용돼 있지 않다** — 타이머 숫자가 초마다 흔들린다.

### 새로 만들 컴포넌트 (`apps/web/src/features/study-session/` 또는 `src/components/`)

- `SessionStatusPill` — props: `state: "focus" | "distract" | "paused"`, `label`, `subLabel?`. 서브 문구는 **필 바깥 아래**에 렌더(Figma 구조 그대로). `paused` variant는 자리만.
- `SessionTimer` — 순공 `HH:MM:SS` + `총 HH:MM:SS` 병기. `dimmed` prop으로 비집중 회색 처리.
- `SessionControlBar` — 핸들 + 일시정지/재개 · 카메라 전환 · 종료. **탭-투-심플 영역에서 제외**되는 hit area 경계를 이 컴포넌트가 책임진다.
- `CameraPreviewSurface` — **mock**. 카메라 어댑터 인터페이스를 통해서만 접근하고 UI가 SDK를 직접 호출하지 않는다(`frontend/CLAUDE.md` 아키텍처 경계). 예:

  ```ts
  export interface CameraAdapter {
    start(): Promise<void>;
    stop(): void;
    flip(): Promise<{ ok: boolean }>; // 실패 시 "전환할 카메라가 없어요"
    readonly facing: "front" | "back";
  }
  export interface FocusDetector {
    // Vision + 가속도 센서 추상화
    subscribe(cb: (s: { trigger: DistractionTrigger; active: boolean }) => void): () => void;
  }
  ```

  기본 구현은 **mock 하나뿐**이다. 실제 구현체는 실기기 스파이크 이후에 붙인다.

- `Toast` — 하단 토스트(6차 신규 컴포넌트). 시각 스펙 미확정(Current Limitations 참고).
- 아이콘 `icon/pause` · `icon/camera-flip` · `icon/exit` — **Figma에서 SVG로 내보내 커밋한다.** 손으로 `<path>`를 그리지 않는다. **PNG를 쓰지 말 것** — S1 작업에서 Figma PNG 익스포트에 캔버스 배경 `<rect>`가 합성돼 아이콘이 흰 네모로 보이는 문제가 실제로 발생했다(SCR-S1-home.md 참고). SVG에서 해당 `<rect>`만 제외하면 된다.

## Implementation Notes For AI Agents

1. `frontend/CLAUDE.md` → `apps/web/CLAUDE.md` → `frontend/docs/screen-ownership.md` → 이 문서 순으로 읽는다.
2. Figma MCP를 부르기 전 **반드시** `figma:figma-design-to-code` 스킬을 먼저 호출한다. 그 뒤 `58:323` / `59:311`을 `get_design_context`로 다시 읽는다.
3. **기존 훅을 확장한다. 새로 쓰지 않는다.** `useStudyRoomSession`의 멱등 제출 설계(`endedAtMsRef ??= Date.now()` — 재시도해도 같은 세션)와 `buildSessionRequest`의 클램프 체인은 서버 400을 막는 장치다. 유지한다.
4. **카메라·Vision·RTC는 인터페이스 + mock.** 어떤 SDK도 `package.json`에 추가하지 않는다. mock은 개발 중 상태 전환을 눈으로 확인할 수 있게 (개발 전용) 수동 트리거를 노출해도 되지만, 프로덕션 UI에 감지 상태를 바꾸는 버튼을 만들지 않는다.
5. **감지 파라미터·자동 종료 N분을 하드코딩하지 않는다.** 설정 객체로 주입한다.
6. **절대 좌표 금지.** Figma 값은 402×874 기준이다. 실제로는 임의 크기 WebView/브라우저에서 렌더되며 iOS 상태바·홈 인디케이터는 **OS가 그린다**(Figma의 `iOS / Status Bar`·`iOS / Home Indicator`는 목업이므로 구현하지 않는다). 대신 `env(safe-area-inset-*)`로 상·하단 여백을 확보한다.
7. **세션 화면은 항상 다크.** `prefers-color-scheme: light`에서도 배경/오버레이가 밝아지면 안 된다. 상태색은 다크 값 사용.
8. **싱글룸 문구만 쓴다.** 참가자 그리드·"다른 사람과 함께" 같은 멀티룸 UI를 만들지 않는다.
9. **라우트**: 기존 `/room/:id?userId=N`(`App.tsx`)을 그대로 유지한다. 단, 새 프레젠테이션에는 **방 번호를 표시하지 않는다**(현재 임시 UI의 `스터디룸 #{id}`는 삭제) — V1.0 싱글룸에는 사용자에게 보여줄 "방" 개념이 없다. `userId` 부재 시 기존 `unsaved` 처리 경로를 유지한다.
10. **세션 중 서버 호출 없음.** 오프라인에서 세션이 완전히 동작해야 한다(`mvp-scope.md`). 제출은 종료 시 1회.
11. 공부 상태·집중률 계산 로직을 화면 컴포넌트 안에 직접 쓰지 않는다 — 순수 TS 모듈로 분리한다(`apps/web/CLAUDE.md` 컨벤션, 과거 `@focusmakers/study-core` 패턴).
12. **`backdrop-filter`는 비싸다.** 상태 필·컨트롤 바 두 곳에만 쓰고, 미지원 브라우저에서 배경 알파만으로도 텍스트가 읽히는지 확인한다.

## Accessibility Requirements

- **컨트롤 버튼 터치 타깃**: Figma 실측 50×50 원형 — 44×44 최소 기준 충족. 축소하지 말 것. 버튼 사이 간격 22px 유지(오조작 방지).
- **색 단독 전달 금지**: 상태는 **항상 점 + 텍스트**로 전달한다(`design.md` 상태 컬러 A안 보조 규칙 ①). 상태 필에서 문구를 빼고 도트만 남기는 변형을 만들지 말 것.
- **상태 변화 알림**: 상태 필에 `role="status"` + `aria-live="polite"`를 준다. 자동 감지로 바뀌는 상태를 스크린리더 사용자가 알 수 있어야 한다. (mvp-scope의 "알림·소리·진동 없음"은 **시스템 푸시/햅틱** 얘기이며 스크린리더 라이브 리전과 무관하다.)
- **타이머**: `font-variant-numeric: tabular-nums`. 초마다 폭이 흔들리면 안 된다(voice-tone.md §2 명시). 타이머에는 `aria-label`로 "순공시간 N시간 M분" 같은 한글 표현을 병기하는 것을 권장한다 — `01:24:08`을 스크린리더가 읽으면 의미가 전달되지 않는다.
- **명암비 실측**(Figma 목업 배경 `#1A2029` 기준으로 계산):
  - 비집중 타이머 `#8B95A1` on `#1A2029` ≈ **5.4:1** — AA 통과.
  - 프라이버시 캡션 white 55% ≈ **5.9:1** — 통과.
  - **총 공부 병기 white 42%, 15px ≈ 4.0:1 — 일반 텍스트 AA(4.5:1) 미달.** 아래 Review Checklist 항목.
  - 위 값은 **목업 배경 기준**이다. 실제 카메라 피드(밝은 방·창가)에서는 대비가 보장되지 않는다 — 텍스트 뒤 스크림(그라디언트) 필요 여부는 디자이너 확인 항목이며, **WG1은 Figma대로 스크림 없이 구현**하고 임의로 추가하지 않는다.
- 폰트 확대(브라우저 200% 줌 / iOS 동적 타입)에서 상태 필 문구가 잘리지 않도록 필 폭을 고정하지 않는다 — Figma의 120px/218px은 콘텐츠에 따른 결과값이지 고정폭이 아니다.
- 화면 탭(심플 모드 전환) 영역은 시각적으로 보이지 않는 인터랙션이다 — 키보드 접근이 가능한 브라우저 환경에서는 컨트롤 바 버튼만으로도 모든 기능(일시정지·전환·종료)에 도달할 수 있어야 한다. 심플 모드 전환을 유일한 경로로 하는 기능을 만들지 말 것.

## Current Limitations

- **카메라·Vision은 mock이다.** 실제 감지가 없으므로 S3-2는 mock 신호로만 재현된다. `studySec`/`focusSec`은 mock 상태 머신이 계산한 값이며, 실제 측정 정확도는 실기기 스파이크 이후 검증한다.
- **S3-1/S3-2는 독립 라우트가 아니다.** `RoomPage.tsx` 하나의 세션 상태 머신이 갖는 두 프레젠테이션 상태다. `/s3-1` 같은 라우트를 만들지 않는다.
- **Figma 배경은 목업이다.** `#1A2029` + 사선 스트라이프 + `[ 전 면 카 메 라 프 리 뷰 ]` 라벨은 "여기가 카메라 피드 자리"라는 표시다. 구현에서 이 스트라이프를 프로덕션 배경으로 남기지 말고, 카메라 미가동 상태를 나타내는 중립 서피스로 만든다.
- **토스트의 시각 스펙이 없다.** 문구는 voice-tone.md에 확정돼 있으나 위치·배경·지속시간·애니메이션이 Figma S3 프레임에 그려져 있지 않다. `2. Components` 페이지나 `6. Spec — Motion & Handoff`(node `14:7`)에 있을 수 있다 — 빌더는 구현 전 확인하고, 없으면 하단 중앙·글래스 다크·3초 정도로 두되 **스펙 확정 시 교체 가능한 단일 컴포넌트**로 만든다.
- **에러/예외 상태 디자인이 없다**: 카메라 권한 거부(S2-3은 모바일 담당), 카메라가 다른 앱에 점유됨, 감지기 초기화 실패. voice-tone.md에는 토스트 `카메라가 꺼져 있어요`만 있다. 새 화면을 지어내지 말고 이 토스트로 처리하며, 그 이상이 필요하면 리더에게 확인한다.
- **첫 세션 힌트 미구현** (위 Interaction Contract 참고 — Figma에 없고 문구도 없음).
- **상태별 누적 시간의 서버 계약 미확인** (위 Data Contract 참고).

## Review Checklist

사람 리뷰가 필요한 미확정·상충 항목.

- [x] **화면 꺼짐·백그라운드 복귀 시 재개 방식 — 수동 재개로 확정**(2026-07-26 리더 확정). `onReturnFromBackground()`는 계속 no-op(자동 재개하지 않음, 사용자가 재개 버튼을 직접 눌러야 한다).
- [ ] **동시 다중 감지 시 서버 이벤트 대표 트리거 우선순위** — `StatusEventPayload`는 구간 겹침이 불가한데 규칙이 없다.
- [ ] **`StudyEventStatus.DEVICE` 정의 상충** — `packages/types` 주석 "다른 기기" vs `glossary.md` "촬영 중인 기기 조작(가속도 센서)". 백엔드에 주석 정정 확인 필요(구현은 ai-wiki 정의 기준).
- [ ] **상태별 누적 시간(일시정지 N회 · 시간) 계약** — 클라이언트가 `events`로 계산하는지 서버 필드가 생기는지. 백엔드 Swagger 확인.
- [ ] **총 공부 병기 텍스트 명암비 4.0:1** (white 42%, 15px, 목업 배경 기준) — AA 4.5:1 미달. 알파 상향 또는 실제 카메라 피드 위 스크림 도입 여부를 디자이너가 결정.
- [ ] **첫 세션 힌트 1회** — `user-flow.md`에는 있고 Figma S3-1에는 없다. 온보딩 G3와 중복인지 확인 후 삭제/추가 결정.
- [ ] **상태 도트의 Figma 변수 바인딩** — `state/focus`·`state/distract`가 Light 값(`#1b64da`/`#ff8a00`)으로 해석되는 채 항상-다크 오버레이 위에 놓여 있다. 6차 확정 세션 전용 값(`#4593FC`/`#FF9E1B`)이 정답이지만, Figma 원본도 다크 모드 값으로 맞춰두지 않으면 다음 익스포트에서 같은 혼선이 반복된다.
- [ ] **[디자인 확인] play 아이콘 프레임 1.5배 확대(BY-336, 2026-07-31)** — `play`와 `pause`는 둘 다 `16×18` 프레임이지만 프레임 안에서 잉크가 차지하는 비율이 크게 다르다(pause 72%×79% / **play 44%×54%**). 같은 프레임을 주면 화면에서 재생이 일시정지보다 한참 작아 보여서, 실기기 확인 후 **play만 24×27**(가로 21.1×23.8)로 키워 실제 글리프 높이를 맞췄다(pause 14.2 / play 14.6). **`pause`·flip·exit은 Figma 실측 그대로다.** 근본 해결은 play 아이콘을 잉크에 맞게 Figma에서 재익스포트하는 것 — 그러면 프레임을 16×18로 되돌리고 `SessionControlBar.tsx`의 `ICON_SIZE.play` 항목을 지울 수 있다.
- [ ] **토스트 컴포넌트 시각 스펙** — 위치·지속시간·모션.
- [ ] **프리뷰 모드 상태 전환 모션 값** — `6. Spec — Motion & Handoff`(node `14:7`) 확인 필요.
- [ ] **라우트 `/room/:id`의 `:id` 존치 여부** — V1.0 싱글룸에는 방 개념이 없다. 모바일 WebView 진입 URL 계약과 함께 정리 필요(WG1은 기존 경로 유지).

---

## 인접 그룹에 전달할 관찰 사항 (WG1 범위 밖, 기록만)

Figma를 읽으며 확인된, 다른 그룹이 알아야 할 사실:

- **S4 프레임(`64:534`)에 '화면 꺼짐' 행이 아직 남아 있다** — `distract-card` 하위 `64:642` 행 라벨이 `화면 꺼짐`, 값 `1회 · 3분`. `design.md` 백로그 7-①이 예고한 그대로의 미반영 상태다. WG5는 이를 베끼지 말고 확정된 **'일시정지'(회색 범례)** 표기를 적용해야 한다. 또한 S4 타임라인 범례(`64:572`)에 집중·비집중 2색만 있고 **일시정지(회색) 범례가 없다** — 6차 확정은 3색이다.
- **S3-4 프레임명이 `S3-4 · 미니멀 모드 (탭 전환)`이다** — `glossary.md`의 사용자 노출 표기는 **심플 모드**(미니멀은 내부 별칭). WG2는 화면 문구에 "미니멀"을 쓰지 않는다.
- **S3-3 프레임(`59:355`)에는 일시정지 캡션 `일시정지 중에는 시간이 흐르지 않아요`와 서브 문구 `다시 시작하면 이어서 측정돼요`가 이미 배치돼 있고**, 컨트롤 바 핫스팟이 `hs/resume`로 바뀌어 있다(`70:1196`). WG2 참고.
