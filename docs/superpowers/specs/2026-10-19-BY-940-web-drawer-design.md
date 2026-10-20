# BY-940 웹 바텀시트 Drawer 통일 설계

- 티켓: BY-940 `웹 바텀시트를 shadcn Drawer(Base UI)로 통일`
- 기준: origin/dev `30a232d0`, 브랜치 `feature/BY-940-web-drawer`
- 관련: BY-929(앱 잠금 RN 시트를 네이티브 formSheet로 바꿈, PR #306), BY-827(손잡이 `SheetHandle` 도입), BY-800(Radix 스크롤 잠금이 iOS 탭을 먹는 문제), BY-658(바닥 시트 모션·탭 바 숨김)
- 시안: Figma V2 `YcyImcuVORDbBneii41Byh`의 랭킹 기록·추월·기간 선택·디데이 시트

## 배경

웹 바닥 시트는 shadcn Sheet(Radix Dialog)로 만들었다. Radix Dialog에는 끌어서 닫는 기능이 없어 BY-827에서 손잡이 `SheetHandle`을 직접 만들었고, 실제로 끌어 닫히는 시트는 디데이와 추월 둘뿐이다. 랭킹 기록과 기간 선택의 손잡이는 끌리지 않는 그림이다.

shadcn의 끌어 닫는 시트는 Drawer이고, 원래 vaul 위에 만들어졌다. vaul은 관리가 멈췄고(마지막 1.1.2), shadcn Base 레지스트리는 2026-07부터 Drawer를 `@base-ui/react/drawer`로 만든다. 그래서 바닥 시트를 Base UI Drawer로 통일한다.

공용 Sheet는 위치·모션·딤·포커스만 정하고 모양은 정하지 않았다. 각 시트가 `className`으로 둥글기·배경·여백을 따로 덮어써서 둥글기가 24px·28px로 갈렸고 손잡이 모양도 시트마다 다르다. 이번에 모양을 공용 부품 한 곳으로 모은다.

## 조사에서 확인한 사실

### 지금 코드 (`apps/web/src/` 기준)

- `components/ui/sheet.tsx:29-53`의 바닥 변형은 `inset-x-0 bottom-0 border-t`와 슬라이드 키프레임뿐이다. Content가 `aria-modal="true"`를 직접 달고, `side="bottom"`일 때만 `data-covers-tab-bar`를 단다.
- `lib/nativeModalOverlay.ts`는 `[aria-modal="true"]:not([data-state="closed"])`를 MutationObserver(`attributeFilter: ["data-state"]`)로 지켜본다. `lib/nativeTabBar.ts`가 이를 받아 바닥 시트면 `set-tab-bar {visible:false}`, 일반 모달이면 `blockedByModal`을 브리지로 보낸다.
- `SheetHandle.tsx`는 `closest('[role="dialog"]')`에 인라인 transform을 쓰고 80px을 넘기면 닫는다. 놓는 속도는 보지 않는다.
- 시트별 덮어쓰기
  - 랭킹 기록 `features/ranking/components/RecordsSheet.tsx:116`: `rounded-t-[28px] bg-muted px-5 pt-3`
  - 추월 `features/ranking/exposure/OvertakeSheet.tsx:70`: `rounded-t-[28px] bg-muted px-5 pt-3`
  - 기간 선택 `features/records/PeriodPickerSheet.tsx:52`: `rounded-t-[24px] px-5 pt-2.5`
  - 디데이 `features/home/DdaySection.tsx`: `rounded-t-3xl px-5 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]`
- 기간 선택과 디데이 달력은 포인터로 가로 스와이프를 받는다. 디데이는 입력에 키보드가 뜨면 달력을 칩으로 접고, 시트 안에 Radix 확인 창을 띄운다.
- 추월 닫기는 끌기·바깥·Esc를 가리지 않고 `trackRankingOvertakeAction("close")` 하나로 남는다(`features/ranking/exposure/HomeRankingPopupHost.tsx:224-226`, `lib/amplitude.ts:1012`).
- 홈·랭킹·기록은 첫 번들에 들어가는 라우트다. 나눠 받기를 미리 받는 도우미는 저장소에 없다.
- 시트 안에서 코드 받기가 실패하면 오류가 라우트 오류 경계(`App.tsx:219`)까지 올라가 화면 전체가 오류 화면이 된다.
- 세션 과목 시트(`SubjectSheet.tsx`)는 알약이 시트로 늘어나고 26% 지점에 저항·햅틱이 걸리며 진행률을 타이머에 넘기는 자체 구현 비모달이다.

### Base UI Drawer (`@base-ui/react@1.9.0`)

- Drawer는 1.2.0(2026-02)에 들어왔다. 1.9.0에서 `data-base-ui-swipe-ignore`에 축 값(`x`·`y`)이 생겼다.
- `onOpenChange(open, details)`의 `details.reason`은 `swipe`·`outside-press`·`escape-key`·`close-press`·`close-watcher`(Android 뒤로 가기) 등이다.
- `Popup`은 `Viewport` 안에 있어야 스와이프와 터치 스크롤 잠금이 켜진다. 첫 포커스는 팝업 자신, 닫으면 이전 요소로 돌아간다.
- `aria-modal`을 달지 않는다. 열림 표시는 `data-state`가 아니라 `data-open`·`data-closed`·`data-ending-style`이다.
- 스와이프로 닫히는 기준은 팝업 높이의 50% 또는 놓는 속도이고 prop으로 바꿀 수 없다.
- 열려 있는 동안 document에 캡처·non-passive `touchmove` 리스너를 건다. 스크롤 없는 영역에서는 바로 `preventDefault`한다. React의 `stopPropagation` 우회는 여기에 닿지 않는다.
- 번들은 minify 111.5KB, gzip 38.6KB다. Radix Dialog는 다른 곳에서 계속 써서 빠지지 않는다.

## 결정

| #   | 항목                | 결정                                                                                                                                                                                                                                                                             |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 늘어나는 번들       | 시트 네 개를 `lazy()`로 나누고, 화면이 뜬 뒤 남는 시간에 미리 받는다                                                                                                                                                                                                             |
| D2  | 디데이 안의 확인 창 | 확인 창이 떠 있는 동안 Drawer를 `disablePointerDismissal`·`modal={false}`로 두고, 그동안 들어오는 닫기 요청은 `eventDetails.cancel()`로 버린다(Esc가 두 창에 함께 가는 것을 jsdom에서 재현). 실기기에서 시트가 닫히거나 포커스가 꼬이면 확인 창을 Base UI로 옮기는 안으로 바꾼다 |
| D3  | 추월 닫은 방법      | `ranking_overtake_action`에 `close_method` 속성을 더한다                                                                                                                                                                                                                         |
| D4  | 세션 과목 시트      | 범위 밖. 다른 UI로 바뀔 예정이다                                                                                                                                                                                                                                                 |
| D5  | 시트 모양           | 둥글기 24px, 그림자 `0 -12px 40px rgba(0,0,0,0.18)`, 배경 `bg-muted`(Figma `bg/layer-1`)로 통일하고 `DrawerContent`만 정한다. V2 시안 대부분(디데이·기간 선택·플래너·공유·앱 잠금 시트)이 이 값이고 랭킹 기록(28px)·추월(32px)만 예외였다                                        |
| D6  | 버전                | `@base-ui/react`를 `1.9.0`으로 정확히 고정한다                                                                                                                                                                                                                                   |
| D7  | 순서                | 랭킹 기록(파일럿) → 추월 → 기간 선택 → 디데이                                                                                                                                                                                                                                    |

## 설계

### 1. 공용 부품 `components/ui/drawer.tsx`

shadcn Base 레지스트리 `drawer.tsx`를 줄여 받는다.

- 내보내는 것: `Drawer`, `DrawerTrigger`, `DrawerClose`, `DrawerContent`, `DrawerTitle`, `DrawerDescription`.
- 넣지 않는 것: 스냅 포인트, 중첩 스택 스케일, Header·Footer, 방향 선택. 쓰는 곳이 없다. 방향은 `down` 고정이다.
- `DrawerContent` = Portal > Backdrop > Viewport > Popup > 손잡이 > 내용.
  - Popup에 `aria-modal="true"`와 `COVERS_TAB_BAR_ATTR`를 항상 단다.
  - 모양: `rounded-t-[24px]`, 그림자 D5, 좌우 `px-5`, 아래 `pb-[max(28px,calc(env(safe-area-inset-bottom)+8px))]`. 시트별로 더 필요한 아래 여백은 내용 쪽에서 준다.
  - 배경은 `bg-muted`다. Figma `bg/layer-1`이 웹 `--muted`와 같은 값이다(soft-blue 다크 `#1b2333`). 기간 선택·디데이가 쓰던 `bg-background`는 다크에서 `#101419`라 시안과 달랐다.
  - 손잡이 막대는 `h-1 w-9 rounded-full bg-border-strong`(시안 36x4 `border/strong`, 위 12px)이다.
  - 손잡이 막대는 `aria-hidden`이고 막대를 감싼 끌기 영역은 높이 44px 이상이다.
  - 딤은 `bg-dim`이고 끄는 동안 `--drawer-swipe-progress`만큼 옅어진다.
  - 모션: 열고 닫을 때 transform 전환, 곡선은 shadcn 레지스트리 값 `cubic-bezier(0.22,1,0.36,1)`. `motion-reduce`에서는 transform 대신 opacity만 전환한다. 전역 tw-animate 덮기는 Base UI 전환에 닿지 않아 컴포넌트 안에서 처리한다.
  - 시트들이 넘기던 모양 `className`은 지운다. `className`은 받되 모양이 아닌 것(테마 클래스 `theme-soft-blue` 등)만 넘긴다.

### 2. 탭 바 감시

`lib/nativeModalOverlay.ts`

- 열린 창 셀렉터: `[aria-modal="true"]:not([data-state="closed"]):not([data-closed])`
- `attributeFilter`: `["data-state", "data-closed", "data-open"]`
- 기존 Radix 창 판정은 그대로 둔다.

### 3. 나눠 받기 도우미

새 파일 `lib/lazyWithPreload.ts` 하나.

```ts
export function lazyWithPreload<P extends { open: boolean }>(
  load: () => Promise<ComponentType<P>>,
) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error) => {
        pending = null;
        throw error;
      },
    ));
  function LazySheet(props: P) {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      if (props.open && !loaded)
        preload().then(rerender, (error) => Sentry.captureException(error));
    }, [props.open]);
    return loaded ? createElement(loaded, props) : null;
  }
  return { LazySheet, preload };
}
```

- `React.lazy`·Suspense·오류 경계를 쓰지 않는다. `React.lazy`는 거부된 결과를 기억해 재시도가 안 되기 때문이다. 받은 컴포넌트는 모듈 변수에 두고, 받으면 다시 그린다.
- 받기에 실패하면 `pending`을 비워 다음에 열 때 새로 받는다. 실패는 Sentry에만 남기고 시트는 그리지 않는다.
- 아직 받지 못한 채 열면 받은 뒤 `open=true`로 처음 마운트된다. Base UI는 첫 마운트에도 `data-starting-style`로 열림 전환을 보여 준다.
- 시트를 띄우는 화면은 마운트 뒤 저장소의 `whenIdle`(`requestIdleCallback`, 없는 엔진은 1.5초 뒤)로 `preload()`를 부르고 실패는 무시한다. iOS에는 `requestIdleCallback`이 없어 화면이 뜬 뒤 1.5초 안에 열면 받는 동안 잠깐 기다린다.
- 받기에 실패하면 호출부가 따로 처리를 넘기지 않은 한 `onOpenChange(false)`로 열림 상태를 되돌린다. true로 남으면 다시 눌러도 상태가 바뀌지 않아 재시도하지 못한다.
- 시트 안의 렌더 오류는 지금처럼 라우트 오류 경계로 간다. 이번에 바꾸지 않는다.

### 4. 시트별 이관

- **랭킹 기록(파일럿).** Drawer로 바꾸고 나눠 받기를 붙인다. 여기서 iOS 탭 먹힘과 A23 FCP를 판정한다. 문제가 있으면 다음 시트로 넘어가지 않는다.
- **추월.** `onOpenChange`의 `details.reason`을 `close_method`로 바꾼다.

  | reason          | close_method |
  | --------------- | ------------ |
  | `swipe`         | `swipe`      |
  | `outside-press` | `outside`    |
  | `escape-key`    | `escape`     |
  | `close-press`   | `button`     |
  | `close-watcher` | `back`       |
  | 그 밖           | 속성 없음    |

  `trackRankingOvertakeAction(action, closeMethod?)`로 넓히고 `close`일 때만 싣는다. 홈의 복구 창 미루기는 같은 `onOpenChange`를 그대로 쓴다.

- **기간 선택.** 가로 스와이프 영역에 `data-base-ui-swipe-ignore="x"`를 단다.
- **디데이.** 달력에 `data-base-ui-swipe-ignore="x"`를 단다. 확인 창이 떠 있는 동안 D2를 적용한다. 키보드가 뜰 때 칩으로 접는 처리는 그대로 두고 실기기에서 Drawer와 부딪치는지 본다. `VirtualKeyboardProvider`는 쓰지 않는다.
- 시트마다 넣었던 포커스 처리(`onOpenAutoFocus` 막기, 닫힐 때 포커스 복귀)는 Base UI 기본 동작과 같으면 지운다.

### 5. 지울 것

- `components/SheetHandle.tsx`와 테스트
- `sheet.tsx`의 `bottom` 변형과 `data-covers-tab-bar` 분기. 옆 시트(배경음)용 `left`·`right`·`top`은 남긴다.

### 6. 범위 밖

- 세션 과목 시트(D4)
- 타임랩스 공유 창. Sheet가 아니라 Dialog이고 이미 24px이다.
- 디데이 확인 창 외의 Radix Dialog·확인 창 이관
- 위키 랭킹 명세. 이벤트 이름만 적는 형식이라 `close_method`를 더하지 않고 코드 주석만 고친다

### 7. 문서·시안

- `.claude/skills/focusmakers-design/references/shadcn-map.md:15`, `components.md:14`: vaul → Base UI Drawer, 둥글기 20px → 24px, 노드 `44:96`(V1.4) 표기 정리, "바닥 시트 모양은 `DrawerContent`에서만 정한다" 추가.
- Figma V2에서 랭킹 기록·추월 시트의 둥글기·그림자·손잡이를 D5로 맞춘다.

## 동작 변화

- 네 시트 모두 손잡이뿐 아니라 판 어디를 끌어도 닫힌다. 지금은 디데이·추월만 손잡이로 닫힌다.
- 닫히는 기준이 80px에서 "높이의 절반 또는 빠르게 튕기기"로 바뀐다.
- 랭킹 기록·추월의 둥글기가 28px에서 24px로 바뀌고 그림자가 생긴다. 기간 선택·디데이는 다크 배경이 `#101419`에서 `#1b2333`으로 바뀐다(시안대로).

## 오류 처리

- 시트 코드 받기 실패: 시트를 그리지 않고 Sentry에 남긴다. 화면 전체 오류 경계로 올리지 않는다. 다음에 열 때 다시 받는다.
- 미리 받기 실패: 조용히 넘어간다.
- iOS 탭 먹힘: 파일럿에서 스크롤 없는 영역의 버튼·행을 탭해 본다. 먹히면 그 영역에 `data-base-ui-swipe-ignore`를 다는 안을 먼저 시험하고, 안 되면 멈추고 다시 정한다.

## 테스트

TDD, 웹 vitest.

| 대상                 | 케이스                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawer.tsx`         | 열면 Popup에 `aria-modal`·`data-covers-tab-bar` / Esc·바깥 누름·닫기 버튼으로 닫히고 이유가 넘어온다 / 손잡이가 보조기기에 숨겨진다                           |
| `nativeModalOverlay` | Base UI 시트 열림·닫힘(`data-closed`)에 탭 바 숨김·복귀 신호 / Radix 창 판정 유지                                                                             |
| `lazyWithPreload`    | 미리 받은 뒤 열면 바로 그린다 / 받기 전에 열면 받은 뒤 그린다 / 첫 받기 실패 시 아무것도 그리지 않고 다음 열기에 다시 받는다 / 미리 받기 실패는 던지지 않는다 |
| 추월                 | reason → `close_method` 변환 / Esc·바깥·닫기 버튼에 맞는 값                                                                                                   |
| 디데이               | 확인 창을 눌러도 시트가 닫히지 않는다 / 확인 창이 닫히면 포커스가 시트로 돌아온다                                                                             |
| 기존 4개 시트 테스트 | 역할·이름·Esc·포커스 단언 유지, Radix 전용 단언(`dialog.style.transform` 손잡이 끌기, `sheet.test.tsx` 바닥 변형) 삭제                                        |

끌어서 닫기는 jsdom에 레이아웃이 없어 실기기로 확인한다.

## 검증

- 실기기: iPhone 13 mini Dev Client, A23.
  - 네 시트: 열기, 끌어 닫기, 바깥 눌러 닫기, 탭 바 숨김·복귀
  - iOS: 스크롤 없는 영역 탭이 한 번에 눌린다
  - 기간 선택·디데이: 가로 넘김이 시트를 닫지 않고 달을 넘긴다
  - 디데이: 키보드가 뜨면 칩으로 접힌다, 확인 창 취소·확인
  - Android 뒤로 가기로 닫히고 추월에 `close_method: back`
  - 라이트·다크 스크린샷, 모션 축소, VoiceOver·TalkBack, 44px 터치 영역
- 성능
  - 이 브랜치와 dev를 `vite build`해 메인 청크 gzip을 비교한다. 늘지 않아야 하고 Base UI는 별도 청크다.
  - A23에서 홈 FCP를 dev와 이 브랜치로 5회씩 재 중앙값을 비교한다.
