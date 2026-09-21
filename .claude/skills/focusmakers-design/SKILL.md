---
name: focusmakers-design
description: Use when building or changing any screen or component in apps/web from a Figma frame, adding a color/radius/motion token, or reviewing UI for design-system drift in the FocusMakers frontend (Tailwind v4 + shadcn, Expo WebView).
---

# FocusMakers Design

## Overview

Figma V1.4(`zQOglXxTTaI88OuqIeOYQa`)가 시각의 기준이고, 코드의 기준은 `apps/web/src/index.css`의
시맨틱 토큰이다. 이 스킬은 둘 사이의 대응표와, 대응표만으로는 알 수 없는 함정을 모아 둔 것이다.
값을 새로 정하지 않는다. Figma에 없는 색·반경·모션을 만들지 않는다.

## When to Use

- Figma 노드 링크를 받아 화면·컴포넌트를 구현할 때
- 시안에 있는 색이 `index.css`에 없어 토큰을 추가해야 할 때
- keyframes·transition을 새로 넣을 때
- PR 전에 "토큰 대신 hex", "반경 절반", "다크 한 블록만 수정" 같은 드리프트를 찾을 때

## 절차

1. `get_metadata`로 노드 트리를 보고, 구현할 프레임과 그 안의 **인스턴스 이름**을 적는다.
2. `get_design_context`로 값을 읽되 절대 좌표는 버리고 flex·grid로 옮긴다. 고정 높이 대신
   패딩과 `min-h`를 쓴다(기기 글자 크기 확대 대응).
3. 인스턴스 이름을 [references/components.md](references/components.md)에서 코드 컴포넌트로
   바꾼다. 없는 컴포넌트만 새로 만든다. 코드 쪽 프리미티브는
   [references/shadcn-map.md](references/shadcn-map.md)에서 먼저 고르고, 없을 때만 직접 만든다.
4. 색·반경·타이포는 [references/tokens.md](references/tokens.md)의 클래스만 쓴다.
5. 자산(아이콘·일러스트·마스코트)은 Figma에서 내보내거나 `src/assets/`에 있는 것을 쓴다.
   손으로 그려 근사하지 않는다. SVG 색은 `currentColor`로 바꿔 부모가 정한다.
6. 모션은 `animate` 스킬의 순서(애니메이션이 필요한가 → 목적 → 가장 싼 도구 → 곡선·시간표)를
   그대로 따른다. keyframes는 `index.css`에, 사용처는 `animate-[...] motion-reduce:animate-none`.
7. PR 전에 `review-animations`(모션)와 `accessibility-audit`(44px·aria·대비)를 돌린다.

## 함정

| 함정 | 규칙 |
|---|---|
| 반경 이름과 값이 어긋난다 | `rounded-lg`는 이 저장소에서 16px(시스템 lg)다. `rounded-2xl`과 `rounded`는 Tailwind 기본값이라 쓰지 않는다 |
| 다크 토큰이 세 곳에 있다 | 색을 추가하면 `:root`, `@media (prefers-color-scheme: dark)` 블록, `:root[data-theme="dark"]` 블록, `packages/design-tokens/src/index.ts` **네 곳**을 같이 고친다. 하나라도 빠지면 Android 웹뷰나 세션 화면에서만 색이 다르다 |
| `dark:` 변형 금지 | 시맨틱 클래스 하나만 쓰면 변수가 알아서 바뀐다 |
| 토큰에 없는 색 | 화면 구현 작업에서는 새 토큰을 만들지 않는다. 가장 가까운 기존 시맨틱 토큰으로 구현하고, 시안 값과 다르다는 사실을 PR 본문의 "디자인 확인 필요" 목록에 적는다. 토큰 추가는 Figma 변수에 값이 생긴 뒤 별도 작업으로만 한다. 컴포넌트 안에 hex를 쓰지 않는다 |
| 없는 자산 | 아이콘·일러스트가 Figma 노드나 `src/assets/`에 없으면 기존 아이콘으로 자리만 잡고 "자산 필요"를 PR 본문에 적는다. 노드가 없다는 이유로 직접 그리지 않는다 |
| 카탈로그 갱신 | `references/`는 실제로 추가된 컴포넌트·토큰만 적는다. 노드 id를 모르는 행, 정식으로 채택하지 않은 토큰을 적지 않는다 |

## 이런 생각이 들면 멈춘다

| 생각 | 실제 |
|---|---|
| "디자인 검토를 기다릴 수 없으니 토큰으로 채택하고 주석을 남기자" | 토큰 채택은 디자이너 결정이다. 기존 토큰으로 구현하고 PR에 적는다 |
| "노드가 없으니 비슷하게 그려 두고 나중에 바꾸자" | 그린 아이콘은 대개 그대로 배포된다. 자리만 잡고 자산을 요청한다 |
| "레거시 테스트도 클래스 문자열을 단언하니 따라가자" | 새 테스트는 상태·aria·텍스트만 단언한다 |
| 색만으로 의미 전달 | 도트·막대·도장에는 텍스트 라벨이나 `role="img"` + `aria-label`을 붙인다 |
| 터치 타겟 | 누를 수 있는 것은 `min-h-11`(44px). 시각 크기가 작으면 `before:-inset-1`로 히트 영역을 넓힌다 |
| 계산은 컴포넌트 밖 | 집중률·합계·날짜 계산은 순수 TS 모듈(`recordsFormat.ts`, `sessionResult.ts` 방식)에 두고 컴포넌트는 그리기만 한다 |
| 하단 고정 | 새 화면에 `fixed bottom-*`을 쓰지 않는다. 토스트 위치는 `ToastViewport`가 소유한다 |
| 이동 시 검색 문자열 | `navigate`할 때 `location.search`(`?userId=`)를 반드시 넘긴다 |

## Quick Reference

- 카드: `rounded-lg border border-border bg-muted px-4`
- 보조 텍스트: `text-[13px] text-muted-foreground`, 3차: `text-text-tertiary`
- 브랜드 필: `rounded-full bg-brand-subtle px-[9px] py-[3px] text-xs font-semibold text-primary tabular-nums`
- 기존 카드는 `rounded-2xl`을 쓰고 있다(값은 16으로 같다). 새 코드는 `rounded-lg`, 기존 코드는 손대지 않는다
- 상태색: 순공 `bg-primary`, 휴식 `bg-state-distract`, 일시정지 `bg-text-tertiary`
- 스켈레톤: `<Skeleton className="h-[92px]" />`, 오류: `<ErrorState screen="…" onRetry />`
- 클래스 조합은 `cn()`으로, 조건부 문자열 삼항은 쓰지 않는다

## Common Mistakes

- 시안의 `Container` 프레임을 그대로 div 트리로 옮기는 것. 인스턴스 이름이 없는 프레임은
  프로토타입 잔재이므로 라이브러리 컴포넌트로 다시 읽는다.
- `hsl()`로 감싸는 것. 이 저장소는 raw hex를 쓴다(`tailwind-v4-shadcn` 스킬의 예시와 다르다).
- 테스트에서 클래스 문자열을 단언하는 것. 상태는 `aria-label`·텍스트·`disabled`로 검증한다.
