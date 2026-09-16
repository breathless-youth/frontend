# 토큰 대응표

출처: `apps/web/src/index.css`(`@theme inline` + `:root`), `packages/design-tokens/src/index.ts`.
Figma 이름은 V1.4 Foundations "1. Semantic Colors"와 design-tokens의 키가 같다.

## 색

| Figma / design-tokens | CSS 변수 | Tailwind 클래스 | 라이트 | 다크 |
|---|---|---|---|---|
| bg/base | `--background` | `bg-background` | #ffffff | #101419 |
| text/primary | `--foreground` | `text-foreground` | #191f28 | #f9fafb |
| brand/primary | `--primary` | `bg-primary` `text-primary` `border-primary` | #1b64da | #3182f6 |
| text/onBrand | `--primary-foreground` | `text-primary-foreground` | #ffffff | #ffffff |
| bg/layer-1 | `--muted` | `bg-muted` | #f9fafb | #191f28 |
| text/secondary | `--muted-foreground` | `text-muted-foreground` | #6b7684 | #b0b8c1 |
| border/default | `--border` | `border-border` | #e5e8eb | #333d4b |
| bg/layer-2 | `--bg-layer-2` | `bg-bg-layer-2` | #f2f4f6 | #333d4b |
| text/tertiary (일시정지 색 겸용) | `--text-tertiary` | `text-text-tertiary` `bg-text-tertiary` | #8b95a1 | #8b95a1 |
| brand/subtle | `--brand-subtle` | `bg-brand-subtle` | #e8f3ff | #1b2b4d |
| bg/guide | `--bg-guide` | `bg-bg-guide` | #f3f8fe | #152030 |
| border/strong | `--border-strong` | `border-border-strong` | #d1d6db | #4e5968 |
| state/focus | `--state-focus` | `bg-state-focus` | #1b64da | #4593fc |
| state/distract (휴식) | `--state-distract` | `bg-state-distract` | #ff8a00 | #ff9e1b |
| state/distract-subtle | `--state-distract-subtle` | `bg-state-distract-subtle` | #fff4e5 | #3d2e14 |
| state/distract-text | `--state-distract-text` | `text-state-distract-text` | #b36100 | #ff9e1b |
| text/disabled | `--text-disabled` | `text-text-disabled` | #d1d6db | #4e5968 |
| bg/dim | `--dim` | `bg-dim` | #00000066 | #00000099 |

- `feedback/error`(#f04452 / #ff6b77), `feedback/error-subtle`, `feedback/success`(#12b76a / #32d583)는
  design-tokens에만 있고 CSS 토큰이 없다. 쓰려면 네 곳에 같이 추가한다.
- `--invite-surface`, `--share-tonal` 계열은 초대코드 화면 전용 원오프다. 다른 화면에 쓰지 않는다.
- 도장 빨강 `#E5342A`(V1.4 S10 시안)는 아직 토큰이 아니다. 승격 전에는 디자인 의견으로 다룬다.

## 반경

| 시스템 | px | Tailwind |
|---|---|---|
| xs | 4 | `rounded-xs` |
| sm | 8 | `rounded-sm` |
| md | 12 | `rounded-md` |
| lg | 16 | `rounded-lg` |
| xl | 20 | `rounded-xl` |
| full | 999 | `rounded-full` |

`rounded-2xl`(16)과 `rounded`(4)는 값은 맞지만 시스템 이름이 아니다. 새 코드에는 쓰지 않는다.

## 타이포 (size/lineHeight, weight)

| 이름 | 값 | Tailwind 예 |
|---|---|---|
| display/lg (타이머 전용) | 56/64 bold | `text-[56px] leading-[64px] font-bold` |
| display/sm | 40/48 bold | `text-[40px] leading-[48px] font-bold` |
| heading/h1 | 28/36 bold | `text-[28px] leading-9 font-bold` |
| heading/h2 | 22/30 bold | `text-[22px] leading-[30px] font-bold` |
| heading/h3 | 18/26 bold | `text-lg leading-[26px] font-bold` |
| body/lg | 17/26 regular | `text-[17px] leading-[26px]` |
| body/md | 15/22 regular | `text-[15px] leading-[22px]` |
| body/sm | 13/20 regular | `text-[13px] leading-5` |
| caption | 12/16 regular | `text-xs leading-4` |
| label/lg | 16/24 medium | `text-base leading-6 font-medium` |
| label/md | 14/20 medium | `text-sm leading-5 font-medium` |
| label/sm | 12/16 medium | `text-xs leading-4 font-medium` |

글꼴은 Pretendard 하나(`font-sans`). 숫자가 바뀌는 곳은 `tabular-nums`.

## 간격 (px)

2xs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48.
Tailwind 기본 스케일(`p-1`=4 … `p-6`=24)과 값이 같아 그대로 쓴다. 화면 좌우 여백은 `px-5`(20).

## 다크 모드 동작

- iOS·브라우저: `@media (prefers-color-scheme: dark)` 블록.
- Android 웹뷰: 시스템 다크가 미디어쿼리에 전달되지 않아 셸이 `data-theme="dark"`를 붙인다
  (`src/lib/nativeTheme.ts`). 그래서 값이 두 벌이며 항상 같아야 한다.
- 세션 화면·온보딩 코치는 `packages/design-tokens`를 TS로 직접 읽는다. 세 번째 사본이다.
