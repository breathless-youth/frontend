# SCR-S1 홈

## Purpose

FocusOn 모바일 앱의 홈 탭이다. 오늘의 순공시간·총 공부 시간·집중률을 한눈에 보여주고, "집중 시작" 카드로 싱글룸 세션에 바로 진입하게 한다. 연속 공부·최장 집중 스탯으로 습관 형성을 돕고, 공부 측정 가이드 카드로 온보딩 재열람 진입점을 제공한다.

## Source Of Truth

- Figma file: FocusON V1.0 Design
- Figma file URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=51-3
- Figma frame: `S1 · 홈`
- Figma node: `51:3` (Screens — iOS 페이지, node `14:4` 하위)
- ai-wiki 근거 문서: `product/design.md`("V1.0 최종 확정" S1 행), `product/voice-tone.md`(§2 홈, §S3 인접 참고), `product/roadmap.md`(V1.0 범위 확인)
- Ownership: `docs/screen-ownership.md` — `apps/mobile` 소유
- 담당 앱: `apps/mobile`

Figma가 이 화면의 시각적 SSOT다. 구현 전 반드시 `get_design_context`로 이 프레임을 읽고, 절대 좌표를 그대로 베끼지 않고 모바일 앱 아키텍처(Flexbox 레이아웃)에 맞게 매핑한다.

**⚠️ 낡은 문서 대체**: 과거 `frontend/docs/screens/SCR-004-home.md`는 다른(빈) Figma 파일(`awZQ0hSGuxwMHkLfZZhsjl`)을 가리키던 낡은 예시로, 이 문서로 대체됐다(해당 파일에 SUPERSEDED 배너 추가 완료). 그 문서의 "공부 유지 시간"·`HomeStudySummary` 타입 등은 이 문서의 근거가 아니다.

## Ownership Boundary

이 화면은 앱 셸(홈 탭) 소유다. "집중 시작" 카드는 싱글룸 세션 진입점까지만 담당하고, 세션 내부(카메라 프리뷰·타이머·상태 감지)는 `apps/web`이 WebView로 로드하는 영역이다(ADR 0001) — 이 화면에서 세션 로직·카메라 코드를 구현하지 않는다.

## Current Figma Structure

```text
S1 · 홈 (402×874)
  iOS / Status Bar (OS 크롬 — 앱이 직접 그리지 않음, 실기기 상태바가 대신함)
  Header
    "FocusON" (title)
    "7월 25일 토요일" (date, 우측 정렬)
  Card / Hero Today
    "오늘 순공시간" (label)
    시간 표시: "3" "시간" "42" "분" (대형 숫자 + 단위)
    gauge (322×12, 25/50/75% 마커 3개, 브랜드 그라디언트 채움)
    meta: "총 공부 5시간 12분" + badge "71% 집중"
  Card / Start CTA (brand/primary, shadow)
    "집중 시작" + "누르면 바로 측정이 시작돼요" + play 원형 버튼
  프라이버시 캡션: "카메라가 자동으로 측정해요 · 영상은 저장되지 않아요"
  Card / Stat × 2 (가로 배치)
    Streak: "연속 공부" + chevron(탭 시 기록 탭 이동) + 불꽃 일러스트 + "N일째" + "하루 10분이면 유지돼요"
    Longest: "최장 집중"(탭 불가) + "N분" + "오늘 가장 길게 집중했어요"
  Card / Guide (bg/guide 틴트)
    "공부 측정 가이드" + "내 진짜 순공시간,\n어떻게 재는 걸까요?" + 링크 "지금 확인해 보세요" + study-doodle 일러스트
  Navigation / Tab Bar (홈 active · 기록 · 설정)
  iOS / Home Indicator (OS 크롬 — 앱이 직접 그리지 않음)
```

## Content

- 헤더: `FocusON` / 날짜(예: `7월 25일 토요일`)
- 히어로: `오늘 순공시간` / `{시간}시간 {분}분` / `총 공부 {시간}시간 {분}분` / `{N}% 집중`
- 시작 카드: `집중 시작` / `누르면 바로 측정이 시작돼요`
- 프라이버시 캡션: `카메라가 자동으로 측정해요 · 영상은 저장되지 않아요` (voice-tone.md §2 "시작 카드 프라이버시 캡션" — 정확히 일치 확인)
- 연속 공부: 라벨 `연속 공부` · 값 `{N}일째` · 서브 `하루 10분이면 유지돼요` · **0일일 때**: `오늘 10분 집중하면 연속 공부가 시작돼요` (voice-tone.md §2, Figma 예시 데이터에는 없는 빈 상태 — 반드시 구현)
- 최장 집중: 라벨 `최장 집중` · 값 `{N}분` · 서브 `오늘 가장 길게 집중했어요`
- 가이드 카드: `공부 측정 가이드` / `내 진짜 순공시간,\n어떻게 재는 걸까요?` / 링크 `지금 확인해 보세요`

## Data Contract

`packages/types`에 이 화면 전용 API 계약이 없다. **백엔드 계약 미확인 — 상상 계약 금지**:

- "오늘"로 스코프된 순공시간/총 공부 시간/집중률 — 가장 가까운 기존 타입은 `StudySessionListResponse`(`totalStudySec`/`totalFocusSec`/`focusRate`)이지만 이건 `studiedDatesInMonth`가 있는 걸로 보아 월간 스코프 응답으로 보인다. "오늘만" 스코프인지, 날짜 파라미터로 스코프를 바꿀 수 있는지는 백엔드 Swagger 확인이 먼저다.
- `streakDays`(연속 공부 일수) — `packages/types`에 대응 필드가 전혀 없다. 새 필드/엔드포인트가 필요하다.
- `longestFocusSec`는 `StudySessionListResponse`에 이미 존재하지만("오늘의 최장" 의미인지 "이번 달 최장" 의미인지는 위와 같은 스코프 확인 필요).

이번 구현은 위 계약이 확정되기 전까지 **정적 예시 데이터**로 화면을 완성한다(Figma 예시값: 순공 3시간42분·총공부 5시간12분·71%·연속 12일째·최장 52분). 컴포넌트는 이 값들을 props로 받는 구조로 만들어, 실제 API 연동 시 데이터만 교체하면 되게 한다.

```ts
// 백엔드 계약 확정 전 임시 형태 — packages/types에 아직 없음, 상상 계약으로 export하지 않는다
type HomeSummaryDraft = {
  focusSec: number; // 오늘 순공시간
  studySec: number; // 오늘 총 공부시간
  focusRate: number; // %
  streakDays: number; // 0이면 빈 상태 문구
  longestFocusSec: number; // 오늘 최장 집중
};
```

## Interaction Contract

- `집중 시작` 카드 탭: 싱글룸 세션 진입(구체 라우트는 WebView 연동 시점에 결정 — 지금은 진입 핸들러 자리만 만들고 실제 목적지는 TODO로 남긴다. WG 계열 화면이 구현되기 전까지 확정 불가).
- `연속 공부` 스탯 카드 탭: 기록(S5) 탭으로 이동. **S5가 아직 구현되지 않았으므로 이동 핸들러는 만들되 목적지 탭이 없을 수 있다** — S5 구현 전까지는 아무 동작도 하지 않도록 방어적으로 둔다(존재하지 않는 라우트로 이동 시도 금지).
- `최장 집중` 스탯 카드: 탭 불가(Figma 컴포넌트 설명에 chevron 없음으로 명시).
- `공부 측정 가이드` 카드 탭: 온보딩 가이드(G1~~G5) 재생. G1~~G5는 아직 구현되지 않았다 — 위와 동일하게 방어적으로 둔다.
- 하단 탭 `기록`/`설정` 탭: 위와 동일 사유로 대상 화면 구현 전까지는 존재하는 라우트만 연결한다.

## Design Tokens Used

- 색상(`packages/design-tokens`): `colors.bg.base`, `colors.bg.layer1`, `colors.bg.guide`, `colors.border.default`, `colors.brand.primary`, `colors.brand.subtle`, `colors.text.primary`, `colors.text.secondary`, `colors.text.tertiary`
- 타이포: `typography.heading.h3`(17px 헤더 타이틀에 근접 — Figma 실측 17px Bold는 표준 스케일에 없는 값이라 heading.h3=18px로 근사, 아래 Current Limitations 참고), `typography.display.sm`류 큰 숫자 대신 실측값 46px Bold(표준 스케일 밖 — 근사 없이 실측값 그대로 사용), `typography.body.sm`, `typography.caption`, `typography.label.*`
- 반경: `radius.xl`(20px 카드), 18px(시작 카드 — 표준 스케일 밖, 실측값 사용), `radius.md`(16px 스탯 카드), `radius.full`(999px 게이지·배지·플레이 버튼)

## Components

기존 재사용 컴포넌트 없음(이 화면이 첫 실제 구현). 이번에 `apps/mobile/components/`에 새로 추출:

- `HeroTodayCard`, `StartCtaCard`, `StatCard`(streak/longest variant), `GuideCard`, `TabBar`(홈/기록/설정 공용 — 다른 탭 화면에서도 재사용 예정)

## Implementation Notes For AI Agents

1. `DESIGN.md`, `docs/screen-ownership.md`, 이 문서를 먼저 읽는다.
2. Figma 노드 `51:3`을 `get_design_context`로 재확인한다.
3. `apps/mobile/app/(tabs)/index.tsx`에서만 구현한다.
4. `apps/web`, 세션 내부 로직, 카메라 코드를 건드리지 않는다.
5. 랭킹, AI 리포트, 그룹 검색, 로그인 UI 등 V1.0 범위 밖 기능을 추가하지 않는다.
6. 아이콘/일러스트는 `apps/mobile/components/icons.tsx`의 SVG 컴포넌트를 쓴다. Figma `download_assets`로 내보낸 SVG의 path 데이터를 그대로 옮긴 것이며 형상을 직접 그리지 않았다. **PNG를 쓰지 말 것** — Figma의 PNG/SVG 익스포트에는 캔버스·섹션 배경 `<rect>`(`#F5F5F5`, `white`)가 함께 포함돼, PNG로 내보내면 그 배경이 합성돼 아이콘이 흰 네모로 보인다(2026-07-26 실제로 발생). SVG에서는 해당 `<rect>`만 제외하면 된다.
7. 단색 아이콘(`IconTabHome`/`IconTabRecord`/`IconTabSettings`/`IconPlay`/`IconChevronRight`)은 `color` prop으로 런타임 틴팅한다 — 탭 활성/비활성이나 셰브런 색상 차이를 위해 상태별 에셋 파일을 따로 만들지 않는다. 일러스트(`IllustFlame`/`IllustStudyDoodle`)는 다색이라 색이 고정돼 있다.

## Accessibility Requirements

- `집중 시작` 카드, 스탯 카드(탭 가능한 것만), 가이드 카드의 터치 영역은 최소 44px 높이 확보(현재 Figma 실측 카드 높이가 이미 44px를 넘음 — 카드 전체가 탭 영역이므로 충족).
- 집중률(`71%`)은 게이지만이 아니라 텍스트(`N% 집중` 배지)로도 항상 병기한다(이미 디자인에 포함됨 — 구현 시 누락 금지).
- 한글 라벨이 시스템 폰트 확대 시에도 잘리지 않도록 숫자/단위 영역에 충분한 유연성을 둔다.

## Current Limitations

- 실제 API 연동 없음 — 정적 예시 데이터로 렌더링(Data Contract 참고).
- `집중 시작`/`연속 공부`/`공부 측정 가이드` 탭의 실제 이동 대상 화면(S3, S5, G1~G5)이 아직 없어 핸들러만 존재하고 동작은 방어적으로 비활성.
- Figma 실측 타이포(17px, 46px, 21px 등)가 `packages/design-tokens`의 표준 스케일과 정확히 일치하지 않는 값이 있다 — 표준 스케일에 억지로 맞추지 않고 실측값을 그대로 썼다. 추후 디자인 시스템이 이 스케일을 흡수할지는 별도 검토 필요.
- 히어로 카드 게이지의 25/50/75% 눈금 마커는 아직 구현하지 않았다(채움 바만 구현). 이 눈금이 목표 시간 대비 진행률을 뜻하는지 단순 장식인지 확정되지 않아, 의미를 추측해 데이터와 연결하지 않았다.
- **다크모드에서 `IllustStudyDoodle`이 판독 불가능하다** (2026-07-26 시뮬레이터 확인). 두들 일러스트의 윤곽선 색(`#191F28`)이 다크모드 카드 배경(`bg/layer-1` dark = `#191f28`)과 동일해 선이 배경에 묻히고, 내부 `fill="white"` 영역만 흰 덩어리로 남는다. 일러스트의 다크모드 변형이 디자인에 정의되지 않은 상태라 임의로 색을 바꾸지 않았다 — 디자이너 확인 필요(아래 Review Checklist).

## Review Checklist

- [ ] "오늘" 스코프 통계 API(순공/총공부/집중률/최장집중/연속일수)의 실제 Swagger 계약 확인
- [ ] `집중 시작` 카드의 실제 이동 대상(딥링크/라우트) 확정 — WebView 세션 구현 시점에 연결
- [ ] 히어로 게이지의 25/50/75% 눈금 마커가 목표 시간 기준인지 확인 (의미 미확정이라 현재 미구현)
- [ ] **두들 일러스트의 다크모드 변형 확정** — 현재 다크모드에서 선이 배경에 묻혀 판독 불가. 선택지: (a) 다크용 일러스트를 Figma에서 별도 제공, (b) 가이드 카드 배경을 다크에서도 밝게 유지, (c) 윤곽선을 `text/primary` 토큰에 바인딩해 모드별 반전
