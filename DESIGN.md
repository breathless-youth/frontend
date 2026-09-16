---
version: v1
name: FocusMakers Design System
description: "FocusMakers의 차분하고 신뢰감 있는 생산성 디자인 시스템. 공부 상태를 감시가 아닌 자기 이해와 성장의 언어로 표현하며, 흰 배경과 파란 브랜드 색, 명확한 상태색, 절제된 카드 계층을 사용한다. Figma가 시각적 원천이고 packages/design-tokens가 코드 구현의 원천이다."
platforms:
  - web
  - ios
  - android
implementation:
  tokens: "@focusmakers/design-tokens"
  web:
    framework: "React 19 + Vite"
    styling: "Tailwind CSS v4 + shadcn/ui"
    tokens: "apps/web/src/index.css"
  mobile:
    framework: "Expo 57"
    runtime: "React Native 0.86"
    routing: "Expo Router"
    styling: "NativeWind 4"
---

# FocusMakers Design System

> **색상·타이포·간격·반경의 원천은 `packages/design-tokens/src/index.ts`다.** 이 문서의 5~8절은
> 그 파일에서 옮겨 적은 것이고, 값이 갈리면 코드가 맞다. 웹은 같은 값을
> `apps/web/src/index.css`에 CSS 변수로 다시 옮겨 두었다. 시각적 원천은 Figma
> "FocusON V1.0 Design"(파일 키 `KmTbXL79g6ximY1RcnBZDz`) Foundations다.

## 화면은 두 앱에 나뉘어 있다

이 시스템은 웹과 모바일 양쪽에 적용된다. 어느 쪽 화면인지에 따라 구현 위치와 배포 경로가 다르다.

| 화면 | 구현 | 배포 |
| --- | --- | --- |
| 홈, 설정, 기록, 소셜, 스터디룸, 결과 | `apps/web` | 웹 배포, 즉시 반영 |
| 네비게이션 탭 바, 스플래시, 웹뷰 로드 스켈레톤 | `apps/mobile` | 스토어 빌드 |

토큰은 둘이 공유하지만 **컴포넌트 구현체는 공유하지 않는다.** 웹은 shadcn/ui,
모바일은 React Native + NativeWind로 각자 만들고 같은 토큰을 참조한다.

## 1. 목적

FocusOn은 AI Vision으로 사용자의 공부 상태를 단말 내부에서 분석하고 총 공부 시간, 순공시간, 집중률을 제공하는 캠스터디 서비스다. 이 문서는 모바일 앱 셸의 시각 언어와 UI 설계 규칙을 정의한다.

이 디자인 시스템의 목표는 다음과 같다.

- 공부 상태와 성과를 빠르게 이해할 수 있게 한다.
- AI 분석을 감시가 아닌 자기주도적 집중 관리로 표현한다.
- iOS와 Android에서 일관되면서도 각 플랫폼의 기본 동작을 존중한다.
- Figma 화면을 MCP로 구현할 때 토큰과 컴포넌트 API가 흔들리지 않게 한다.
- 화면에서 확인된 반복을 근거로 공통 컴포넌트를 점진적으로 확장한다.

## 2. 적용 범위

### 포함

- 스플래시, 로그인, 온보딩
- 모바일 홈과 탭 내비게이션
- 공부 기록, 통계, 랭킹
- 프로필과 설정
- 로딩, 빈 상태, 오류, 권한 안내
- 모바일 앱 셸에서 WebView 스터디룸으로 진입하는 UI

### 제외

- WebView 내부 스터디룸 UI
- 브라우저 MediaPipe 및 AI Vision 구현
- 카메라, Vision, RTC 플랫폼 어댑터
- `packages/study-core`의 계산 규칙
- 비활성 네이티브 스터디룸 구현

스터디룸 UI와 AI Vision 공부 상태 감지의 활성 소스 코드는 `apps/web`이 소유한다. 모바일은 해당 화면을 WebView로 로드하며 AI Vision 추론은 모바일 단말의 WebView 런타임에서 실행된다.

## 3. 디자인 원칙

### Calm Focus

화면은 사용자의 주의를 빼앗지 않아야 한다. 넓은 여백, 낮은 채도의 배경, 제한된 강조색을 사용한다.

### Progress over Surveillance

얼굴 인식 박스, 감시 카메라, 경고 중심 그래픽을 사용하지 않는다. 시간, 변화, 연속 기록과 달성도를 중심으로 표현한다.

### State at a Glance

공부 상태는 색상만으로 전달하지 않는다. 항상 텍스트 레이블과 필요한 경우 아이콘을 함께 사용한다.

### Honest Privacy

싱글룸과 멀티룸의 개인정보 안내를 구분한다. 싱글룸은 영상이 전송되지 않으며, 멀티룸은 화면 공유를 위해 영상이 전송될 수 있지만 AI 분석용 원본 프레임과 얼굴 데이터는 서버로 전송되지 않는다.

### Native First

Safe Area, 시스템 글자 확대, 키보드, 뒤로가기, 터치 영역과 스크린 리더를 설계 초기부터 고려한다.

## 4. 브랜드 방향

FocusMakers의 시각적 성격은 차분함, 명료함, 신뢰, 지속적인 성장이다.

- 흰 배경을 기본 캔버스로 사용한다.
- 한 단계 올라온 회색 면(`bg.layer1`)은 정보 계층이 필요할 때만 사용한다.
- 브랜드 파랑은 주요 행동과 선택 상태에 제한적으로 사용한다.
- 상태색은 공부 상태와 피드백 의미에만 사용한다.
- 장식보다 데이터와 사용자 행동을 중심에 둔다.
- 과도한 그라데이션, 네온, 유리 효과와 강한 그림자를 사용하지 않는다.

## 5. 색상

색상 이름은 화면의 외형이 아니라 의미를 나타낸다. 아래 값은 `packages/design-tokens/src/index.ts`의
`colors`에서 그대로 옮긴 것이고, 그 파일이 코드의 원천이다. 웹은 같은 값을
`apps/web/src/index.css`에 CSS 변수로 옮겨 적어 Tailwind 유틸리티로 쓴다.

**하드코딩한 hex를 쓰지 않는다.** 웹은 아래 표의 Tailwind 클래스를, 모바일은
`@focusmakers/design-tokens`의 `colors`를 참조한다.

### Brand

| Token | Light | Dark | 웹 클래스 | Use |
| --- | --- | --- | --- | --- |
| `brand.primary` | `#1b64da` | `#3182f6` | `bg-primary` `text-primary` | 주요 CTA, 활성 탭, 핵심 선택 |
| `brand.hover` | `#1957c2` | `#4593fc` | — | 주요 CTA hover·pressed |
| `brand.subtle` | `#e8f3ff` | `#1b2b4d` | `bg-brand-subtle` | 선택 배경, 강조 카드 |
| `brand.subtlePressed` | `#c9e2ff` | `#194aa6` | — | subtle 배경의 pressed |
| `text.onBrand` | `#ffffff` | `#ffffff` | `text-primary-foreground` | 브랜드 배경 위 콘텐츠 |

### Neutral

| Token | Light | Dark | 웹 클래스 | Use |
| --- | --- | --- | --- | --- |
| `bg.base` | `#ffffff` | `#101419` | `bg-background` | 앱 기본 배경 |
| `bg.layer1` | `#f9fafb` | `#191f28` | `bg-muted` | 카드, 한 단계 올라온 면 |
| `bg.layer2` | `#f2f4f6` | `#333d4b` | `bg-bg-layer-2` | 트랙, 비활성 배경 |
| `bg.guide` | `#f3f8fe` | `#152030` | `bg-bg-guide` | 가이드·안내 영역 |
| `bg.dim` | `#00000066` | `#00000099` | `bg-dim` | 모달 뒤 딤 |
| `text.primary` | `#191f28` | `#f9fafb` | `text-foreground` | 제목과 본문 |
| `text.secondary` | `#6b7684` | `#b0b8c1` | `text-muted-foreground` | 보조 설명 |
| `text.tertiary` | `#8b95a1` | `#8b95a1` | `text-text-tertiary` | 힌트, 비활성 정보, 일시정지 상태 |
| `text.disabled` | `#d1d6db` | `#4e5968` | `text-text-disabled` | 비활성 텍스트 |
| `text.inverse` | `#ffffff` | `#101419` | — | 반전 배경 위 텍스트 |
| `border.default` | `#e5e8eb` | `#333d4b` | `border-border` | 카드와 입력 테두리 |
| `border.strong` | `#d1d6db` | `#4e5968` | `border-border-strong` | 강조된 구분선 |

### Study Status

세션 상태는 3색 체계다(`@focusmakers/design-tokens`의 `sessionStateColors`).

| State | Token | Light | Dark | Label |
| --- | --- | --- | --- | --- |
| `FOCUS` | `sessionStateColors.FOCUS` | `#1b64da` | `#4593fc` | 순공 |
| `DISTRACTION` | `sessionStateColors.DISTRACTION` | `#ff8a00` | `#ff9e1b` | 휴식 |
| `PAUSE` | `sessionStateColors.PAUSE` | `#8b95a1` | `#8b95a1` | 일시정지 |

`PAUSE`는 고유 색이 없고 `text.tertiary`를 재사용한다. 화면에 나가는 말은 BY-574에서
순공·휴식으로 정리했고, 코드 식별자(`FOCUS`·`DISTRACTION`)는 백엔드 계약이라 그대로 둔다.

보조 색도 함께 정의돼 있다.

| Token | Light | Dark | 웹 클래스 | Use |
| --- | --- | --- | --- | --- |
| `state.focusSubtle` | `#e8f3ff` | `#1b2b4d` | `bg-brand-subtle` | 순공 강조 배경 |
| `state.distractSubtle` | `#fff4e5` | `#3d2e14` | `bg-state-distract-subtle` | 휴식 카드 배경 |
| `state.distractText` | `#b36100` | `#ff9e1b` | `text-state-distract-text` | 휴식 소형 텍스트 전용 |

서버 이벤트(`StudyEventStatus`)는 위 상태로 매핑된다. `AWAY`(자리 이탈)·`PHONE`(휴대폰 사용)·
`DEVICE`(기기 조작)는 `DISTRACTION`으로, `PAUSE`는 `PAUSE`로 간다. 순공은 기본 상태라 이벤트가 없다.
자세한 내용은 [docs/domain-glossary.md](./docs/domain-glossary.md) 참고.

### Feedback

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `feedback.success` | `#12b76a` | `#32d583` | 완료, 성공 |
| `feedback.error` | `#f04452` | `#ff6b77` | 오류, 파괴적 행동 |
| `feedback.errorSubtle` | `#ffebee` | `#3d1b1f` | 오류 배경 |

경고(warning)와 정보(info) 색은 **아직 정의돼 있지 않다.** 필요해지면 임의로 만들지 말고
Figma Foundations에서 값을 받아 `design-tokens`에 먼저 추가한다.

### 아직 토큰이 아닌 색

초대코드 화면(BY-409)에서 쓰는 원오프 색이 `index.css`에만 있다. 시맨틱 토큰 승격은
디자이너 검수 후로 미뤄 둔 상태이므로, 다른 화면에서 가져다 쓰지 않는다.

| CSS 변수 | Light | Use |
| --- | --- | --- |
| `--invite-surface` | `#f2f5fa` | 코드 카드·코드 셀 배경 |
| `--invite-surface-text` | `#1b2538` | 코드 숫자 텍스트 |
| `--share-tonal` | `#e0ebff` | 공유하기 버튼 배경 |
| `--share-tonal-text` | `#1b64da` | 공유하기 버튼 텍스트 |

### 색상 사용 규칙

- 본문 텍스트는 `text.primary` 또는 `text.secondary`를 사용한다.
- 브랜드 색상과 상태색의 역할을 섞지 않는다.
- 오류가 아닌 일반 취소 행동에 빨간색을 사용하지 않는다.
- 차트는 상태색과 혼동되지 않는 별도 데이터 시각화 팔레트를 화면 설계 시 정의한다.
- 색상 대비는 일반 텍스트 4.5:1, 큰 텍스트와 UI 경계 3:1 이상을 목표로 한다.
- 다크 값을 웹에서 고칠 때는 `index.css`의 `@media (prefers-color-scheme: dark)` 블록과
  `[data-theme="dark"]` 블록을 **둘 다** 고친다. 한쪽만 고치면 토글과 OS 설정이 어긋난다.

## 6. 타이포그래피

**폰트는 Pretendard로 고정한다.** 웹은 자체 호스팅해 `--font-sans`로 걸고, 모바일은
`assets/fonts/PretendardVariable.ttf`를 번들한다. 시스템 폰트 폴백은
`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` 순이다.

스케일은 `packages/design-tokens`의 `typography`가 원천이다.

| Token | Size | Line Height | Weight | Use |
| --- | --- | --- | --- | --- |
| `display.lg` | 56 | 64 | bold | 세션 타이머 전용 |
| `display.sm` | 40 | 48 | bold | 결과 화면 핵심 수치 |
| `heading.h1` | 28 | 36 | bold | 화면 제목 |
| `heading.h2` | 22 | 30 | bold | 섹션 제목 |
| `heading.h3` | 18 | 26 | bold | 카드 제목 |
| `body.lg` | 17 | 26 | regular | 주요 설명 |
| `body.md` | 15 | 22 | regular | 기본 본문 |
| `body.sm` | 13 | 20 | regular | 보조 본문 |
| `label.lg` | 16 | 24 | medium | 큰 버튼 |
| `label.md` | 14 | 20 | medium | 버튼과 탭 |
| `label.sm` | 12 | 16 | medium | 소형 컨트롤 |
| `caption` | 12 | 16 | regular | 메타 정보와 도움말 |

### 코드의 실제 상태

웹에는 이 스케일을 감싼 Tailwind 유틸리티가 **없다.** 화면은 `text-[15px]`처럼 임의 값으로
쓰고 있고, 빈도를 세어 보면 상위 값 대부분이 위 토큰과 일치한다(`13px` 27회, `15px` 25회,
`14px` 19회, `12px` 12회, `17px` 10회).

다만 토큰에 없는 값도 섞여 있다. `11px`, `18px`, `20px`, `21px`, `35px`, `46px`, `52px`가
그렇다. 새 화면을 그릴 때는 위 표의 값을 먼저 고르고, 표에 없는 크기가 필요하면 그 이유를
남기거나 토큰 추가를 제안한다. 눈대중으로 새 크기를 만들지 않는다.

### 타이포그래피 규칙

- 시간과 비율은 고정폭 숫자를 지원하는 경우 tabular number를 사용한다.
- 제목은 최대 두 줄을 기본으로 하되 중요한 정보는 말줄임으로 숨기지 않는다.
- 본문은 시스템 글자 확대 시 레이아웃이 확장되게 한다. 높이를 고정하지 말고 패딩과
  `min-h`로 잡는다.
- 중요한 상태를 굵기 하나만으로 구분하지 않는다.
- 영문 대문자만 사용하는 레이블을 만들지 않는다.

## 7. 간격과 레이아웃

### Spacing Scale

`packages/design-tokens`의 `spacing`이 원천이다. 값은 Tailwind 기본 스케일과 맞아떨어져
웹에서는 `gap-4`(16px)처럼 기본 유틸리티를 그대로 쓴다.

| Token | Value | 웹 클래스 |
| --- | --- | --- |
| `spacing.2xs` | 2 | `gap-0.5` |
| `spacing.xs` | 4 | `gap-1` |
| `spacing.sm` | 8 | `gap-2` |
| `spacing.md` | 12 | `gap-3` |
| `spacing.lg` | 16 | `gap-4` |
| `spacing.xl` | 20 | `gap-5` |
| `spacing.2xl` | 24 | `gap-6` |
| `spacing.3xl` | 32 | `gap-8` |
| `spacing.4xl` | 40 | `gap-10` |
| `spacing.5xl` | 48 | `gap-12` |

### 화면 규칙

- 기본 좌우 여백은 20이다.
- 밀도가 높은 목록은 최소 16의 좌우 여백을 유지한다.
- 섹션 사이는 24 또는 32를 사용한다.
- 카드 내부 여백은 기본 16, 주요 요약 카드는 20 또는 24를 사용한다.
- Safe Area는 `Screen` 레이아웃에서 처리하고 개별 화면이 임의로 중복 처리하지 않는다.
- 화면 콘텐츠는 작은 기기에서 세로 스크롤 가능해야 한다.
- 고정 CTA는 홈 인디케이터와 키보드를 가리지 않아야 한다.

## 8. 모서리, 테두리와 깊이

`packages/design-tokens`의 `radius`가 원천이다.

| Token | Value | 웹 클래스 | Use |
| --- | --- | --- | --- |
| `radius.xs` | 4 | `rounded-xs` | 아주 작은 표식 |
| `radius.sm` | 8 | `rounded-sm` | 배지, 작은 컨트롤 |
| `radius.md` | 12 | `rounded-md` | 입력, 일반 버튼 |
| `radius.lg` | 16 | `rounded-lg` | 카드 |
| `radius.xl` | 20 | `rounded-xl` | 주요 요약 카드, 시트 |
| `radius.full` | 999 | `rounded-full` | 원형 아이콘 버튼, 상태 점 |

> ⚠️ **`rounded-lg`는 이 저장소에서 16px다.** Tailwind 기본값(8px)과 다르다. 반경 스케일을
> `index.css`의 `@theme`에서 재정의했기 때문이다. 같은 이유로 재정의하지 않은
> `rounded-2xl`·`rounded-3xl`·`rounded`는 Tailwind 기본값이 그대로 나오므로 쓰지 않는다.
> 표에 있는 여섯 개만 쓴다.

- 깊이는 배경색 차이와 1px 테두리로 우선 표현한다.
- 그림자는 플로팅 CTA, 모달, 바텀시트처럼 실제 중첩 관계가 있을 때만 사용한다.
- 모든 카드를 둥근 사각형으로 감싸지 않는다. 단순 정보 그룹은 여백과 구분선으로 표현한다.

## 9. 아이콘과 이미지

### 아이콘

- 하나의 아이콘 패밀리만 사용한다.
- 기본 크기는 20, 작은 보조 아이콘은 16, 주요 행동은 24다.
- 아이콘 단독 버튼은 접근성 이름과 최소 44x44 터치 영역을 제공한다.
- 상태 아이콘은 텍스트 레이블을 대체하지 않는다.

### 생성 이미지

- UI, 버튼, 텍스트와 상태 바를 이미지 생성 모델에 포함시키지 않는다.
- 생성 이미지는 온보딩 또는 빈 상태 일러스트처럼 독립된 비주얼 자산으로 사용한다.
- 감시 카메라, 얼굴 인식 박스, 생체 좌표를 연상시키는 이미지를 피한다.
- 공부, 성장, 루틴과 편안한 몰입을 표현한다.
- 워터마크, 로고와 이미지 내부 텍스트를 금지한다.

## 10. 컴포넌트

이 절은 **웹(`apps/web`) 기준**이다. Figma 컴포넌트와 코드 파일의 전체 대응표는
[`.claude/skills/focusmakers-design/references/components.md`](./.claude/skills/focusmakers-design/references/components.md)에
있고, 노드 id까지 적혀 있다. 아래는 그중 무엇이 실제로 존재하고 무엇이 아직 없는지만 가른 것이다.

### 지금 있는 것

공용 프리미티브는 `apps/web/src/components/ui/`에 있다.

| 컴포넌트 | API | 비고 |
| --- | --- | --- |
| `Button` | `variant`: `default` `outline` `ghost` / `size`: `default`(h-10) `sm`(h-8) `lg`(h-12) | shadcn 기반. `buttonVariants`도 함께 내보낸다 |
| `Dialog` | `Dialog` `DialogTrigger` `DialogContent` `DialogHeader` `DialogFooter` `DialogTitle` `DialogDescription` `DialogClose` `DialogOverlay` `DialogPortal` | Radix 기반 |
| `Toast` / `ToastViewport` | `message`, `tone`(`session` 하나) | 다크 알약 고정. 배경은 `--session-toast-bg` |
| `Skeleton` | `className` | 로딩 자리표시 |
| `ErrorState` | `message`, `onRetry`, `screen` | 조회 실패 자리표시. `screen`은 계측용 |

공용 화면 조각은 `apps/web/src/components/`에 있다.

| 컴포넌트 | 역할 |
| --- | --- |
| `ScreenBackHeader` | 뒤로가기 + 제목 헤더 |
| `LegalDocumentScreen` | 약관·개인정보 문서 화면 껍데기 |
| `ErrorFallback` | 라우트 단위 에러 바운더리 |

나머지는 화면 단위로 각 feature 폴더에 있다. 설정은 `SettingsRow` `SettingsSection`
`PermissionToggle`, 기록은 `SummaryTiles` `SessionListItem` `MonthCalendar` `EventChip`
`StreakBanner`가 그렇다. 홈은 아직 별도 파일이 없고 `routes/HomeTabPage.tsx` 안에
`HeroTodayCard` `StartCtaCard` `StatCard` `GuideCard` `FocusGauge`가 직접 정의돼 있다.

### 아직 없는 것

아래는 **계약 후보이며 구현된 적이 없다.** 시안이 이들을 전제로 그려지면 구현 단계에서
전부 새로 만들어야 하므로, 쓰려면 먼저 만들 일감으로 잡는다. 만들 때 지킬 성격은 적어 둔다.

| 후보 | 만들 때 지킬 것 |
| --- | --- |
| `Screen` | Safe Area와 기본 캔버스 배경을 소유한다. 스크롤 여부와 하단 고정 영역을 명시적으로 고른다 |
| `Stack`, `Row` | 토큰 기반 간격만 허용한다. 임의 margin 반복을 대체한다 |
| `AppText` | 타이포 토큰을 variant로 제공한다. 기본 색은 `text.primary`. 글자 확대와 줄바꿈을 막지 않는다 |
| `IconButton` | 시각 크기와 무관하게 최소 44×44 터치 영역. 접근성 이름은 아이콘 이름이 아니라 사용자 행동 |
| `TextInput` | default·focused·filled·disabled·error. 레이블·값·도움말·오류를 한 필드 계약으로 묶는다. placeholder로 레이블을 대체하지 않는다 |
| `Card` | `surface` `outlined` `highlighted`만 우선. 카드 전체가 눌리면 pressed 상태와 접근성 역할을 준다 |
| `Divider` | 목록과 정보 그룹의 구조 보조용. 장식으로 반복하지 않는다 |
| `StudyStatusBadge` | 세션 상태와 1:1. 상태색·텍스트 레이블·선택적 아이콘을 함께 쓴다. 지금은 `features/study-session`의 `SessionStatusPill`이 비슷한 일을 한다 |
| `LoadingState`, `EmptyState` | 문구와 행동을 props로 받는다. 로딩은 레이아웃 이동을 줄이고, 빈 상태는 다음 행동을 제시한다 |

승격 판단 기준은 [17. 컴포넌트 승격 규칙](#17-컴포넌트-승격-규칙)을 따른다.

### 알려진 어긋남

고치기 전까지 사실로 알고 있어야 하는 것들이다.

- **공용 `Button`이 거의 쓰이지 않는다.** 웹 전체에서 `<Button`을 쓰는 파일이 두 개뿐이고,
  나머지 화면은 각자 `<button>`에 클래스를 붙인다. 버튼 룩이 화면마다 갈라져 있다.
- **`Button`의 기본 높이가 40px(`h-10`)다.** [12. 접근성](#12-접근성)의 최소 44×44 규칙에
  못 미친다. Figma의 `Button / CTA V2`는 56·48·44 계열이라 그쪽과도 어긋난다.
- **아이콘이 중복 정의돼 있다.** `IconChevronRight`와 `IllustFlame`이 `features/home/icons.tsx`,
  `features/records/icons.tsx`, `apps/mobile/components/icons.tsx` 세 곳에 각각 있다.
- **홈 컴포넌트가 라우트 파일 안에 있다.** 다른 화면에서 재사용하려면 먼저 파일로 꺼내야 한다.

## 11. 내비게이션

- Expo Router의 파일 기반 라우팅을 유지한다.
- 탭은 최상위 목적지에만 사용한다.
- 탭 레이블과 아이콘을 함께 표시한다.
- 스택 화면은 플랫폼 기본 뒤로가기를 보존한다.
- WebView 스터디룸은 앱 셸과 다른 전체 화면 작업으로 취급한다.
- 내비게이션 UI가 도메인 계산이나 플랫폼 SDK를 직접 호출하지 않는다.

## 12. 접근성

- 모든 주요 동작은 최소 44x44 터치 영역을 갖는다.
- 아이콘 단독 버튼에 `accessibilityLabel`을 제공한다.
- 선택, 비활성, 로딩과 확장 상태를 `accessibilityState`로 전달한다.
- 색상만으로 상태를 전달하지 않는다.
- 시스템 글자 확대에서 핵심 정보와 CTA가 잘리지 않아야 한다.
- 모달과 바텀시트가 열리면 포커스를 내부로 이동하고 닫힌 뒤 이전 위치로 돌린다.
- 움직임 감소 설정을 존중하며 필수 정보 전달을 애니메이션에 의존하지 않는다.

## 13. 콘텐츠 원칙

- 사용자를 평가하거나 비난하지 않는다.
- `집중 실패` 대신 `자리 비움 12분`처럼 관찰 가능한 사실을 표현한다.
- 숫자는 단위와 함께 표시한다.
- 핵심 용어는 `docs/domain-glossary.md`를 따른다.
- 총 공부 시간, 순공시간과 집중률을 서로 바꿔 쓰지 않는다.
- 버튼은 `확인`보다 `공부 시작`, `다시 시도`처럼 결과가 드러나는 동사를 사용한다.

## 14. 개인정보 표현

### 싱글룸

권장 문구:

> 카메라 영상은 이 기기 안에서만 분석되며 전송되거나 저장되지 않습니다.

### 멀티룸

권장 문구:

> 카메라 영상은 참여자 화면 공유를 위해 전송되며 녹화되거나 저장되지 않습니다. AI 분석용 원본 프레임과 얼굴 데이터는 서버로 전송되지 않습니다.

싱글룸과 멀티룸에 같은 문구를 사용하지 않는다.

## 15. Figma 구조

권장 페이지 구조:

```text
00 Foundations
01 Components
02 Patterns
03 Screens
04 Prototypes
99 Archive
```

### Foundations

- Colors
- Typography
- Spacing
- Radius
- Elevation
- Iconography

### Components

- 컴포넌트 이름은 코드 이름과 동일한 PascalCase를 사용한다.
- Variant 이름은 `property=value` 형식으로 관리한다.
- default, pressed, disabled, loading, error 상태를 필요한 컴포넌트에 포함한다.
- Auto Layout을 사용하고 고정 위치 배치를 최소화한다.

### Screens

- 화면 ID는 `SCR-NNN / 화면명 / 상태`로 작성한다.
- 정상, 로딩, 빈 상태와 오류 상태를 별도 프레임으로 둔다.
- iOS와 Android 차이가 실제로 있을 때만 플랫폼 프레임을 분리한다.
- MCP 입력에 사용할 최종 프레임은 명확한 이름과 설명을 갖는다.

## 16. Figma에서 코드까지

각 화면은 한 번에 하나씩 다음 순서를 따른다.

1. Jira 티켓의 목표와 완료 조건을 확인한다.
2. `docs/screens/SCR-NNN-<name>.md` 화면 명세를 작성한다.
3. Figma에서 필요한 모든 상태를 설계한다.
4. 토큰과 기존 컴포넌트만 사용했는지 검토한다.
5. MCP로 대상 프레임의 구조, 스타일, 에셋과 컴포넌트 관계를 읽는다.
6. AI가 수정 파일, 보호 파일, 재사용 컴포넌트와 검증 계획을 제시한다.
7. 승인 후 Expo/React Native 컴포넌트로 구현한다.
8. 동일 기기 크기의 Figma 프레임과 스크린샷을 비교한다.
9. 접근성, 작은 화면, 글자 확대와 예외 상태를 검증한다.
10. 반복 패턴과 의도적인 차이를 문서화한다.

MCP가 생성한 결과는 참고 입력이며 저장소에 바로 병합할 완성 코드가 아니다.

## 17. 컴포넌트 승격 규칙

- 첫 사용은 화면 가까이에 둘 수 있다.
- 두 화면에서 반복되면 API와 시각 차이를 비교한다.
- 세 번째 사용이 확인되거나 명백한 제품 프리미티브일 때 `apps/mobile/components/ui`로 승격한다.
- 비즈니스 데이터, 라우팅과 플랫폼 SDK를 공통 UI 컴포넌트에 넣지 않는다.
- 화면 전용 조합을 범용 컴포넌트로 성급하게 추출하지 않는다.
- 공통 컴포넌트로 승격할 때 variant, 상태, 접근성과 테스트 계약을 함께 정의한다.

## 18. Do and Don't

### Do

- 따뜻한 중립 배경과 명확한 텍스트 대비를 사용한다.
- 중요한 데이터와 다음 행동을 화면의 주인공으로 둔다.
- 모든 공부 상태에 텍스트 레이블을 제공한다.
- 실제 기기와 시스템 글자 확대에서 검증한다.
- Figma와 코드가 같은 의미 토큰 이름을 사용하게 한다.
- 반복이 검증된 컴포넌트만 공통화한다.

### Don't

- AI 분석을 감시나 처벌처럼 표현하지 않는다.
- 얼굴 인식 박스와 생체 좌표를 장식으로 사용하지 않는다.
- 브랜드 색상을 모든 카드와 텍스트에 과도하게 사용하지 않는다.
- 상태색을 장식색으로 사용하지 않는다.
- 작은 회색 글자로 개인정보 안내를 숨기지 않는다.
- Figma 좌표를 그대로 하드코딩해 반응형 동작을 잃지 않는다.
- WebView 내부 스터디룸 UI를 모바일 앱 셸에서 중복 구현하지 않는다.

## 19. 화면 완료 기준

- Figma 정상 상태와 예외 상태가 모두 존재한다.
- 화면 명세와 Figma 노드가 연결되어 있다.
- Safe Area, 스크롤과 키보드 동작이 정의되어 있다.
- 작은 화면과 큰 화면에서 핵심 정보가 잘리지 않는다.
- 글자 확대에서 핵심 정보와 행동을 사용할 수 있다.
- 스크린 리더 이름, 역할과 상태가 제공된다.
- Figma 기준 스크린샷과 구현 결과의 차이가 검토되었다.
- 하드코딩된 의미 색상과 반복 간격이 토큰을 우회하지 않는다.
- WebView, Vision, RTC와 `study-core` 보호 영역을 침범하지 않는다.

## 20. 현재 결정과 후속 확정

### 확정

- 웹(`apps/web`)이 화면 대부분의 구현 범위이고, 모바일(`apps/mobile`)은 앱 셸과 탭 바·스플래시를 맡는다.
- `@focusmakers/design-tokens`를 의미 기반 토큰의 코드 원천으로 사용한다. 웹은 그 값을
  `apps/web/src/index.css`에 CSS 변수로 옮겨 쓴다.
- 브랜드 색은 `#1b64da`, 기본 배경은 흰색이다.
- 폰트는 Pretendard로 고정한다.
- 탭은 네 개이고 순서는 홈·소셜·기록·설정이다.
- 공부 상태는 순공·휴식·일시정지 3색 체계이고, 서버 이벤트 네 종이 여기에 매핑된다.
- 컴포넌트 구현체는 웹·모바일이 공유하지 않는다. 토큰만 공유한다.
- 화면은 Figma에서 하나씩 완성한 뒤 구현한다. 공통 컴포넌트는 점진적으로 추출한다.

### 아직 정해지지 않은 것

- 경고(warning)·정보(info) 피드백 색. 토큰에 없다.
- 데이터 시각화 팔레트. 상태색과 구분되는 별도 체계가 필요하다.
- 카드 테두리와 그림자 강도의 기준. 지금은 화면마다 다르다.
- 일러스트 스타일과 사용 범위.
- 웹 타이포 스케일을 Tailwind 유틸리티로 감쌀지 여부. 지금은 임의 px 값으로 쓰고 있다.
- 초대코드 화면의 원오프 색을 시맨틱 토큰으로 승격할지 여부.

이 항목들은 임의로 확정하지 않고 Figma 설계와 실제 기기 검증을 근거로 결정한다.

## 21. Iteration Guide

1. 한 번에 하나의 화면 또는 컴포넌트만 변경한다.
2. 변경 전에 관련 Jira 티켓, 화면 명세와 Figma 노드를 확인한다.
3. 새 값을 만들기 전에 기존 토큰과 컴포넌트를 검색한다.
4. 시각 변경은 스크린샷으로 비교한다.
5. 의도적인 예외는 이유와 적용 범위를 기록한다.
6. 화면에서 검증된 결정을 이 문서와 토큰에 반영한다.
7. alpha 단계에서는 실제 사용 근거 없이 컴포넌트 종류를 늘리지 않는다.
