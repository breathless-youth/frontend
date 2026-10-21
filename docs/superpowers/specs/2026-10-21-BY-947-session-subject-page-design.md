# BY-947 세션 과목·배경음 페이지 설계

- Jira: BY-947 (상위 스토리 BY-939, 기획 BY-945, 시안 BY-946)
- 기준 브랜치: `feature/BY-947-session-subject-page` (base `origin/dev` 71b33712)
- 기획 원본: 위키 `product/specs/BY-939-세션-과목-배경음-페이지.md` (PR #43, 2026-10-21 c84ebe9 기준)
- 시안: Figma V2 `YcyImcuVORDbBneii41Byh` Screens `S1b-1`부터 `S1b-4`까지, Tablet `T1-1`부터 `T1-3`까지와 `T3`
- 상태: 묻힌 결정 확정(2026-10-21, 14절), 구현 반영

## 1. 목표

- 하단 플로팅 컨트롤 바와 끌어 올리는 과목 시트를 없앤다.
- 일시정지는 왼쪽 아래, 나가기는 오른쪽 아래, 카메라 전환·배경음·과목은 오른쪽 위 열에 둔다.
- 과목과 배경음은 모든 폭에서 세션 위에 겹치는 전체 페이지로 연다.
- 휴대폰 가로와 태블릿 가로의 과목 페이지는 목록·상세 두 열로 나눈다.
- 데이터 모델·API·측정 규칙은 BY-696과 같게 유지한다.

## 2. 코드 조사 결과

### 지금 구조

- `RoomPage.tsx`의 `RoomSessionScreen`이 세션 레이어(`SESSION_LAYER_LAYOUT`)를 그린다.
- 세로는 flex 컬럼, `landscape-compact:`는 3열 그리드이고 방향은 CSS로만 갈린다.
- `sessionLandscape.test.tsx`가 "세션 화면은 `matchMedia`를 부르지 않는다"를 고정한다.
- `SubjectSheet.tsx`(492줄)가 라벨 버튼, 바깥 탭 캐처, 끌기 제스처, 고정 그룹, `--session-sheet-progress` 변수 게시를 맡는다.
- `SessionControlBar`는 시트의 손잡이로 `bar` 렌더 prop을 거쳐 들어가고, 시트가 열리면 `surface="bare"`로 알약 배경을 잃는다.
- `SheetFollowingSlot`(RoomPage 안)과 `sheetTimerTravel.ts`가 시트 진행률에 맞춰 타이머를 올린다.
- `SessionSideActions`는 배경음 슬롯과 카메라 전환을 그리고, 시트가 열리면 `invisible`이 된다.
- `SubjectPanel.tsx`(816줄)가 헤더(`과목` + `+ 과목 추가`), 카드 목록, 할 일 행, 인라인 편집, 길게 누르기 메뉴, 핸들 끌기를 맡는다.
- `AmbientSoundSheet`는 공용 `ui/sheet.tsx`(Radix Dialog) 위의 300px 오른쪽 시트다.
- 배경음 시트는 `container`로 `main`에 포털을 내리고, `onTouchMove` 전파를 막아 Radix 스크롤 잠금이 iOS 탭을 먹지 않게 한다.
- `ui/sheet.tsx`의 `SheetContent`가 `aria-modal`을 직접 단다(네이티브 탭 바 차단 감지가 이 속성을 본다).
- 토스트는 `CtaToaster`(z-40)가 바 위에 띄우는데 Radix 모달(z-50)보다 아래라 페이지가 열리면 가려진다.
- 온보딩 목업(`SessionMockBackdrop`)과 소셜룸 `RoomControlBar`는 `SessionControlBar`·`controlButtonVariants`를 import하지 않는다.
- `controlButtonVariants`의 사용처는 `SessionControlBar`, `SessionSideActions`, `AmbientSoundButton` 셋뿐이다.
- `sheet-check.svg`·`sheet-dot.svg`는 `SubjectPanel`·`SubjectSheet`만 쓴다.

### 시안 실측 (402×874, 874×402 기준)

- 오른쪽 위 열은 카메라 전환, 배경음, 과목 순서이고 버튼 54px, 간격 12px, 상태 필 아랫변에서 23px 아래에 있다.
- 심플 모드에서는 카메라 전환이 빠지고 배경음·과목이 위로 올라온다(`S1b-1` 심플 프레임 `side-actions` 높이 120).
- 세로 하단 버튼은 좌우 24px, 아랫변이 홈 인디케이터 위 8px이다.
- 세로 타이머(52px) 아랫변과 버튼 윗변 사이는 8px, 라벨(높이 44)과 타이머 사이는 4px이다.
- 가로 하단 버튼은 좌우 안전 영역 + 16px, 아랫변이 하단 안전 영역에 붙는다.
- 가로 타이머는 44px, 총 줄은 14px이고 두 버튼 사이 가운데 하단에 있으며 라벨과 8px 떨어진다.
- 나가기 버튼은 다른 버튼과 같은 유리 버튼이고 아이콘만 `#F0555F`다.
- 라벨은 높이 44, 좌우 12, 간격 8, 점 6px, 이름 13px semibold 85%, 시간 13px bold 92%, 끝에 14px `›`다.
- 페이지 본문은 `rgba(25,31,40,0.9)`(`#191F28` 90%), 헤더·동작 줄·푸터는 `#191F28` 불투명이다.
- 헤더는 52px, 뒤로 버튼 44px, 제목 17px bold `#F9FAFB`다.
- 세로 동작 줄은 위 4·아래 8·좌우 12, 버튼 간격 8, 버튼은 `할 일 추가`와 같은 모양(흰 6%, 높이 44, 반경 12, 좌우 14, 14px semibold 70%)이다.
- 세로 푸터는 위 8·좌우 20, 아래 홈 인디케이터 + 8, 타이머 28px bold 상태색 + 발광이다.
- 세로 과목 카드는 좌우 12, 카드 간격 14, 측정 중 카드는 테두리 `#4593FC` 45%와 파란 제목·시간이고 행 바탕 강조는 없다.
- 가로 과목 페이지는 좌우 안전 영역 + 16, 위 8, 아래 안전 영역 + 8, 목록 열 280px, 두 열 간격 16이다.
- 가로 과목 줄은 높이 56, 반경 14, 좌우 14, 이름 15px, 시간 13px이다.
- 가로 측정 중 줄은 테두리 `#4593FC` 35%만, 보는 줄은 흰 12% 바탕 + 흰 20% 테두리, 나머지는 흰 6% 바탕이다.
- 가로 상세 열은 카드 모양(흰 6%, 테두리 흰 8%, 반경 18)이고 머리에 이름 17px + 시간 13px을 한 줄로 둔다.
- 태블릿 가로(1180×820)는 여백 24, 목록 열 360, 두 열 간격 24, 타이머 40px이다.
- 태블릿 세로(820×1180)는 헤더·목록·동작 줄·푸터 전체가 640px 열 안에 있고 타이머 40px이다.
- 큰 태블릿(T3, 1376×1032)은 하단 버튼이 좌우 32, 아랫변이 하단 안전 영역 + 27, 타이머와 버튼 사이가 12다.
- 큰 태블릿 가로 과목 페이지는 여백 32, 목록 열 420, 두 열 간격 32, 타이머 48px이다.
- 태블릿 배경음 가로(T1-3)는 두 묶음이 546px씩 40 간격이고, 줄 높이 48·간격 4, 이름 글자 칸 120px이다(아이콘 20과 간격 10을 더한 이름 버튼은 150px).
- 시안은 배경음 제목과 ⓘ, ⓘ와 스위치, 집중 연동 글자와 ⓘ를 모두 22px 띄웠다(ⓘ 터치 영역 44 + 8).
- 코드는 D18에 따라 글자와 ⓘ 사이를 4px로 줄였다.
- 완료 체크는 `#8B95A1` 원에 `#191F28` 체크다.
- 할 일 저장 `완료`와 순서 변경 `완료`는 60×44 `Button secondary`다.
- 순서 변경 모드에서는 카드가 머리 줄만 남고, 핸들(28×44)이 왼쪽에 생기고, 재생·추가 버튼이 사라진다.
- 가로 순서 변경 중 상세 열은 40% 불투명도다.
- 배경음 세로는 헤더(뒤로 · `배경음` · ⓘ · 스위치), 좌우 24의 탭(높이 44), 목록, 고정 `집중 연동 ⓘ ··· 스위치` 줄, 타이머 푸터 순서다.
- 배경음 가로는 탭 없이 `노이즈`·`배경 소리` 두 묶음이 350px씩 24 간격으로 나란하고, 줄 하나가 아이콘 · 이름 · 슬라이더다.
- 이름 글자 칸은 100px이고, 아이콘 20과 간격 10을 더한 이름 버튼은 130px이다.
- 배경음 가로 아래 줄은 왼쪽 `집중 연동 ⓘ 스위치`, 오른쪽 타이머다.

## 3. 가로 두 열을 어떻게 가를까

세로 카드 목록과 가로 목록·상세는 DOM 구조가 다르다. 세로 카드는 할 일을 카드 안에 품고, 가로는 할 일을 오른쪽 열 한 곳에만 그린다.

### A. CSS만으로 한 트리를 재배치

- `li`를 가로에서 `display: contents`로 풀고, 머리 줄은 1열, 보고 있는 카드의 본문만 2열에 `row-span`으로 붙인다.
- 회전해도 DOM이 바뀌지 않아 입력 중 포커스가 살아남는다.
- 왼쪽 목록과 오른쪽 상세가 따로 스크롤되지 않고, 상세 높이가 줄 높이를 늘리는 문제를 `contain: size` 같은 장치로 막아야 한다.
- 3시에 읽기 어려운 코드가 된다.

### B. 페이지 안에서만 JS로 방향을 읽어 구조를 고른다 (추천)

- `matchMedia("(orientation: landscape)")`를 `useSyncExternalStore`로 읽는 훅 하나를 둔다.
- 페이지가 열려 있을 때만 구독해서 세션 화면은 여전히 `matchMedia`를 부르지 않는다.
- 세로는 카드 목록, 가로는 목록·상세를 그리고 크기는 CSS(`regular:`, `short-side-lg:`, `landscape-compact:`)가 맡는다.
- 편집·메뉴·순서 변경 모드·보는 과목 상태는 레이아웃 바깥(`SubjectPanel`)에 있어 회전해도 남는다.
- 회전하면 페이지 본문이 다시 마운트되어 페이지 안 포커스가 사라진다(페이지 안에서 회전하는 드문 경우다).
- Android는 키보드가 창 높이를 줄여서(Expo 기본 `adjustResize`) 작은 폰에서 세로인데도 가로로 잡힐 수 있다.
- 이 경우 입력 중인 줄이 다시 마운트되어 키보드가 닫히므로 텍스트 입력에 포커스가 있는 동안은 직전 값을 유지하고 `focusout`에 다시 읽는다.

### C. 두 트리를 모두 그리고 CSS로 숨긴다

- 편집 중인 입력이 두 군데 마운트되고 `autoFocus`가 겹친다.
- jsdom은 Tailwind를 적용하지 않아 테스트에서 모든 요소가 두 번씩 잡힌다.

B를 고른다. A는 동작은 맞지만 유지 비용이 크고, C는 입력 중복이 실제 버그로 이어진다.

## 4. 구조

### 컴포넌트 트리: 지금

```text
RoomSessionScreen (main, theme-dark, --session-*)
├─ SimpleModeSurface / CameraPreviewSurface
├─ 심플 모드 토글 (absolute inset-0)
├─ 세션 레이어
│  ├─ SessionStatusPill
│  ├─ SessionSideActions (배경음, 카메라 전환)
│  ├─ SheetFollowingSlot > SessionTimer
│  └─ CtaToaster + SubjectSheet
│     ├─ 라벨 버튼 · 바깥 탭 캐처 · 끌기 그룹
│     ├─ bar = SessionControlBar (일시정지, 공부 종료)
│     └─ SubjectPanel (헤더 + 카드 목록)
├─ AmbientSoundSheet (Sheet side=right, 300px)
└─ SessionConfirmDialog × 2
```

### 컴포넌트 트리: 바꾼 뒤

```text
RoomSessionScreen
├─ SimpleModeSurface / CameraPreviewSurface
├─ 심플 모드 토글
├─ 세션 레이어 (페이지가 열려도 숨기지 않는다, D15)
│  ├─ SessionStatusPill
│  ├─ SessionSideActions (카메라 전환, 배경음, 과목)
│  ├─ 위 여백 (grow)
│  ├─ 타이머 묶음 (relative)
│  │  ├─ CtaToaster (페이지가 닫혀 있을 때만)
│  │  ├─ SubjectLabel (선택한 과목이 있을 때만)
│  │  └─ SessionTimer
│  ├─ 아래 여백 (심플 모드만 grow)
│  └─ 하단 버튼 줄: SessionPauseButton · SessionExitButton
├─ SessionPage "과목" (Sheet side=right, 전폭)
│  └─ SubjectPanel
│     ├─ 세로: 카드 목록 + SessionPageFooter(동작 줄 + 타이머)
│     └─ 가로: 목록 열(줄 + 동작 줄) | 상세 열(카드 + SessionPageFooter)
├─ AmbientSoundSheet = SessionPage "배경음"
│  ├─ 세로: 탭 + 목록 + SessionPageFooter(집중 연동 · 타이머 한 줄, D19)
│  └─ 가로: 두 묶음 + SessionPageFooter(집중 연동 · 타이머)
└─ SessionConfirmDialog × 2 (페이지 뒤에 렌더해 위로 쌓인다)
```

### 파일

추가한다.

- `features/study-session/useLandscapeLayout.ts`: 페이지용 가로 판정 훅.
- `features/study-session/components/SessionPage.tsx`: 전체 페이지 껍데기 `SessionPage`와 `SessionPageFooter`.
- `features/study-session/components/SubjectLabel.tsx`: 타이머 위 `● 과목 순공 ›` 버튼.
- 테스트: `useLandscapeLayout.test.ts`, `SessionPage.test.tsx`, `SubjectPanel.test.tsx`, `SessionControlButtons.test.tsx`.

바꾼다.

- `routes/RoomPage.tsx`: 레이어 배치, 페이지 상태, 이벤트, 포커스 복귀.
- `features/study-session/components/SessionControlBar.tsx` → `SessionControlButtons.tsx`(git mv): 바 컨테이너를 삭제하고 `SessionPauseButton`·`SessionExitButton`만 남긴다.
- `features/study-session/components/controlButtonVariants.ts`: 기본 모양에 유리 배경을 합치고 `exit`을 빨간 아이콘으로 바꾼다.
- `features/study-session/components/SessionSideActions.tsx`: `subject` 슬롯, 순서 변경, 인라인 유리 클래스 삭제.
- `features/ambient-sound/components/AmbientSoundButton.tsx`: 인라인 유리 클래스 삭제.
- `features/study-session/components/SessionTimer.tsx`: 가로 프리뷰 배치를 가운데 44px로 바꾸고 `SessionPageTimer`를 추가한다.
- `features/study-session/components/SubjectPanel.tsx`: 헤더 삭제, 동작 줄, 순서 변경 모드, 가로 두 열, 체크박스·완료 버튼.
- `features/ambient-sound/components/AmbientSoundSheet.tsx`: `SessionPage` 사용, 가로 두 묶음, 집중 연동 ⓘ.
- `components/ui/InfoTooltip.tsx`: `contentClassName` prop 추가(세션 툴팁 색으로 덮기 위해).
- `lib/amplitude.ts`: `trackSubjectSheetOpened(source)`, `trackSubjectSheetClosed(...)`.
- `features/study-session/sessionCopy.ts`: `hint` 삭제, `reorder` 추가, 빈 상태 보조 문구(결정 D8).
- `features/study-session/sessionTheme.ts`: `--session-sheet-bg` 삭제(페이지 바탕은 `--session-dialog-bg`, D15).
- `assets/icons/sheet-check.svg`: 체크 색 `#191F28`.
- `index.css`: `sheet-content-rise` 키프레임 삭제, `sheetTimerTravel` 언급 주석 정리.

삭제한다.

- `features/study-session/components/SubjectSheet.tsx` 전체.
- `features/study-session/sheetTimerTravel.ts`와 `__tests__/sheetTimerTravel.test.ts`.
- `RoomPage.tsx`의 `SheetFollowingSlot`과 `--session-sheet-progress`·`--session-sheet-transition`·`--session-sheet-timer-travel` 변수 사용.
- `SessionControlBar`의 바 컨테이너, `barSurfaceVariants`, `surface` prop과 `SessionControlBarSurface` 타입, `role="group" aria-label="세션 컨트롤"`.
- `SubjectPanel`의 `open` prop과 닫힐 때 편집을 닫는 상태 동기화(페이지 본문이 닫힐 때 언마운트되므로 필요 없다).
- `AmbientSoundSheet`의 X 닫기 버튼, 세션 딤 오버레이 클래스, `triggerRef` prop.
- `SUBJECT_SHEET_COPY.hint`.

손대지 않는다.

- 온보딩 목업, 소셜룸 하단 바, `useSubjects`, `subjectSegments`, `useStudyRoomSession`, `subjectInteractions`.

## 5. 세션 화면 배치

레이어는 지금처럼 세로 flex 컬럼, `landscape-compact:` 그리드 하나의 DOM이다. JS 방향 감지는 넣지 않는다.

### 세로

- 레이어 패딩은 위 `safe + 13`(유지), 좌우 24(유지), 아래 `safe + 8`이다.
- 자식 순서는 상태 필, 오른쪽 위 열(absolute), 위 여백(`grow`), 타이머 묶음, 아래 여백(심플 모드만 `grow`), 하단 버튼 줄이다.
- 타이머 묶음은 `flex flex-col items-center`이고 라벨 아래 4px(`mb-1`)에 타이머를 둔다.
- 하단 버튼 줄은 `mt-2 flex w-full justify-between`이고 왼쪽에 일시정지, 오른쪽에 나가기를 둔다.
- 심플 모드에서는 지금처럼 위·아래 여백이 1:1로 늘어 타이머 묶음이 상태 필과 버튼 줄 사이 가운데에 온다(결정 D4).
- 오른쪽 위 열은 `right: safe + 16`, `top: safe + 72`(필 위 13 + 필 높이 36 + 23)다.

### 휴대폰 가로 (`landscape-compact:`)

- 그리드는 `grid-cols-[1fr_auto_1fr] grid-rows-[auto_1fr_auto]`로 바꾼다.
- 좌우 패딩은 `safe + 16`, 위 `safe + 18`(유지), 아래는 지금 식(`max(safe, (safe + 14) / 2)`)을 유지한다.
- 상태 필은 1행 2열, 타이머 묶음은 3행 2열(`self-end`), 여백 두 개는 숨긴다.
- 하단 버튼 줄은 `landscape-compact:contents`로 풀어 일시정지를 3행 1열(`justify-self-start self-end`), 나가기를 3행 3열(`justify-self-end self-end`)에 둔다.
- 버튼 줄 div에는 role을 달지 않는다(`display: contents` 요소의 role은 Safari에서 사라진 이력이 있다).
- 라벨과 타이머 사이는 8px(`landscape-compact:mb-2`)이다.
- 타이머는 44px, 총 줄은 14px, 가운데 정렬이다.
- 가로 심플 모드에서는 타이머 묶음을 지금처럼 화면 가운데 absolute(`top-1/2 left-1/2 -translate`)로 띄운다.
- 오른쪽 위 열은 `top: safe + 77`(필 위 18 + 36 + 23)이다.

### 태블릿 (`regular:` · `short-side-lg:`)

- 버튼은 `controlButtonVariants`에 이미 있는 `regular:size-16`(64)·`short-side-lg:size-20`(80)을 쓴다.
- 레이어 아래 패딩은 `regular:pb-[calc(env(safe-area-inset-bottom)+24px)]`(T1 실측 하단 44)이다.
- 타이머와 버튼 줄 사이는 `regular:mt-2.5`(T1 실측 10)이다.
- 오른쪽 위 열 top은 `regular:` `safe + 75`(필 39), `short-side-lg:` `safe + 84`(필 48)이고 간격은 지금 값(`regular:gap-3.5`, `short-side-lg:gap-4.5`)을 유지한다.
- 태블릿 가로도 `landscape-compact`가 아니므로 세로 배치를 쓴다(T1 가로 시안과 같다).
- 큰 태블릿은 `short-side-lg:`로 좌우 `safe + 32`, 아래 `safe + 27`, 타이머와 버튼 사이 `mt-3`을 덧씌운다(T3 실측).

### 버튼 모양

- `controlButtonVariants`의 `default`에 지금 오른쪽 위 버튼이 인라인으로 붙이는 유리 배경·그림자·흐림을 합친다.
- `resume`은 지금처럼 파란 채움이다.
- `exit`은 `default`와 같은 유리 버튼에 `text-(--session-control-exit-bg)`(`#F0555F`)만 다르다.
- 다섯 버튼(카메라 전환, 배경음, 과목, 일시정지, 나가기)이 같은 모양을 쓰고 인라인 중복은 삭제한다.
- 과목 버튼 아이콘은 lucide `BookOpen`(시안 `ic/subject (lucide book-open)`), 크기는 배경음과 같은 `size-5.75 regular:size-6.75 short-side-lg:size-8.5`다.
- 버튼은 모두 `pointer-events-auto`라 레이어의 `pointer-events-none`을 뚫고 눌린다.

### 선택 과목 라벨

- `SubjectLabel`은 `SubjectSheet`의 라벨 부분만 떼어 낸 버튼이다.
- 선택한 과목이 없으면 RoomPage가 그리지 않는다.
- `aria-haspopup="dialog"`, `aria-expanded`, 화면 읽기용 `순공 N분` 문구를 유지한다.
- 일시정지 중이면 점이 깜빡이지 않고 40%로 옅다(지금과 같다).

## 6. 전체 페이지 껍데기 `SessionPage`

```tsx
interface SessionPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 포털 자리. `--session-*` 변수가 풀리도록 세션 `main`을 넘긴다. */
  container: HTMLElement | null;
  /** 닫힌 뒤 포커스를 돌려줄 요소를 고른다. */
  returnFocus: () => HTMLElement | null;
  title: string;
  /** 제목 오른쪽(배경음의 ⓘ·스위치). */
  headerExtras?: ReactNode;
  landscape: boolean;
  children: ReactNode;
}
```

- `ui/sheet.tsx`의 `Sheet`·`SheetContent side="right"`를 그대로 쓰고 `className`으로 전폭(`w-full sm:max-w-none`), 테두리·그림자·패딩 없음, 불투명 바탕 `bg-(--session-dialog-bg)`을 준다(D15).
- 오버레이는 `overlayClassName="bg-transparent"`다(본문 뒤로 카메라만 비쳐야 한다).
- 흐림은 쓰지 않는다.
- 세로에서는 `SheetContent`에 `page-column`을 붙여 태블릿 세로에서 640(큰 태블릿 720) 열로 모은다.
- 가로에서는 `pl-[calc(env(safe-area-inset-left)+16px)] pr-[calc(env(safe-area-inset-right)+16px)] pb-[calc(env(safe-area-inset-bottom)+8px)] regular:px-6`을 붙인다.
- 헤더는 `ScreenBackHeader`와 같은 모양(높이 `52 + safe-top`, 위 패딩 `safe-top`, 뒤로 44px, `ChevronLeft` 16)이고 바탕은 `--session-dialog-bg`다.
- 휴대폰 가로 헤더는 위 8px을 더한다(`landscape-compact:pt-[calc(env(safe-area-inset-top)+8px)]`).
- 뒤로 버튼은 `SheetClose`, 제목은 `SheetTitle`이라 Radix가 대화상자 이름과 닫기를 맡는다.
- `ScreenBackHeader`를 그대로 쓰지 않는 이유는 그 헤더가 라우터 뒤로 가기와 `screen_back_pressed` 이벤트를 보내고 제목이 `h1`이라 대화상자 제목이 되지 못하기 때문이다.
- `onCloseAutoFocus`는 기본 동작을 막고 `returnFocus()`에 포커스를 준다.
- `onEscapeKeyDown`은 텍스트 입력(슬라이더 제외)에서 온 Escape를 막는다.
- Radix는 Escape를 문서 캡처 단계에서 받아서, 막지 않으면 이름 편집을 취소하려던 Escape가 페이지를 닫는다.
- `onTouchMove`는 전파를 막는다(배경음 시트와 같은 이유로 Radix 스크롤 잠금이 iOS 탭을 먹지 않게 한다).
- `touch-manipulation`을 유지한다(더블탭 줌 인식기가 빠른 연속 탭을 삼키지 않게 한다).
- 들어오고 나가는 모션은 `sheetVariants` right(`slide-in-from-right`·`fade`, 300ms `ease-overlay`)를 그대로 쓴다.
- reduced-motion에서는 `index.css`의 전역 규칙이 이동량을 0으로 만들어 페이드만 남는다.

### `SessionPageFooter`

```tsx
interface SessionPageFooterProps {
  landscape: boolean;
  /** 세로에서 타이머 위에 따로 두는 고정 줄. */
  actions?: ReactNode;
  /** 타이머와 같은 줄의 왼쪽. */
  leading?: ReactNode;
  timer: ReactNode;
}
```

- `relative`이고 안에 `CtaToaster`를 둔다(바탕은 페이지 전체가 불투명 `--session-dialog-bg`라 따로 칠하지 않는다, D15).
- 토스트는 페이지가 열린 동안 이 푸터 위 12px에 뜬다.
- 세로는 `actions`(타이머 위 고정 줄, 호출부가 패딩을 정한다) 아래에 `leading`과 타이머가 한 줄에 있는 줄(`flex items-center justify-between gap-3 pt-2 pr-5 pl-6 pb-[calc(env(safe-area-inset-bottom)+8px)]`)을 둔다.
- 가로는 한 줄(`flex min-h-11 items-end justify-between gap-3`)에 `leading`과 타이머를 두고 `actions`는 쓰지 않는다.

### `SessionPageTimer` (`SessionTimer.tsx`에 추가)

- 순공만 보여 준다.
- 색은 `--session-state-color`, 발광은 `SessionTimer`의 `GLOW_TEXT_SHADOW`를 같이 쓴다.
- 크기는 28px(`leading-8.25 tracking-[-0.4px]`), `regular:` 40px, `short-side-lg:landscape:` 48px이다.
- 화면 읽기용으로 `순공시간 N분` 문구를 둔다.

### 토스트 자리

- 세션 레이어의 `CtaToaster`는 `page === null`일 때만 렌더한다.
- 페이지 푸터의 `CtaToaster`는 마운트 여부가 아니라 `SessionPage`가 내려 주는 열림 값으로 거둔다.
- 닫히며 밀려 나가는 동안에도 내용은 남아 있지만 푸터 Toaster는 닫는 순간 빠지고, 같은 렌더에서 레이어 Toaster가 들어온다.
- 두 Toaster가 같은 id로 동시에 마운트되지 않아 토스트가 두 번 뜨지 않는다.
- 페이지가 열린 동안 난 카메라 토스트도 페이지 안 Toaster가 받는다.

## 7. 과목 페이지

### 열기와 닫기

- `RoomSessionScreen`은 `page: "subject" | "ambient" | null` 상태 하나로 두 페이지를 가른다.
- 과목 버튼과 라벨은 `openSubjectPage(source, event.currentTarget)`를 부른다.
- 열 때 `subject_sheet_opened`를 보내고 열린 시각과 연 요소를 ref에 담고, 미리 받기가 실패했으면 목록을 다시 받는다.
- 두 페이지 모두 `openPage(kind)`로 열고, 열 때 URL은 바꾸지 않고 라우터 상태에 `sessionPage`를 더한 history 항목 하나를 쌓는다(D20).
- 맨 위가 이미 그 표시 항목이면(브라우저 앞으로 가기·새로고침) 새로 쌓지 않고 그 항목을 다시 쓴다.
- 뒤로 버튼과 Escape는 Radix `onOpenChange(false)`로 와서 `closePage("back")`이 된다.
- 재생 버튼은 일시정지 중이면 `resume()`한 뒤 `closePage("play")`를 부른다.
- `closePage`는 표시 항목이 맨 위면 `history.back()`만 부르고, 실제로 닫는 일은 popstate를 받은 `finishClosingPage`가 한다.
- 요청 없이 온 popstate는 iOS 가장자리 스와이프나 브라우저 뒤로 가기라 `back`으로 남긴다.
- popstate를 기다리는 동안 온 닫기 요청은 무시한다. 두 번 되돌리면 세션 화면 밖으로 나간다.
- 세션이 공부 중을 벗어나면 렌더 중에 페이지 상태를 비우고(닫힘 계측 없음), 쌓은 항목은 effect에서 한 칸 되돌려 걷어 낸다.
- 화면이 사라질 때도 같은 정리를 하고, 이미 되돌리는 중이면 건너뛴다.
- 닫을 때 `subject_sheet_closed`에 열린 초를 싣는다(결정 D6).
- 포커스는 연 요소가 아직 문서에 있으면 그 요소로, 없으면(과목을 해제해 라벨이 사라졌으면) 과목 버튼으로 돌아간다.
- 페이지가 열린 동안 세션을 일시정지하지 않는다.
- Android 하드웨어 뒤로 가기는 다루지 않는다(BY-948). 세션 화면은 네이티브가 `blockHardwareBack`으로 삼켜 웹에 오지 않는다.
- `useSubjects` 실패 알림은 `page === "subject"`일 때만 토스트로 보인다(지금 `sheetOpen` 조건과 같다).

### `SubjectPanel` props

```tsx
interface SubjectPanelProps {
  store: SubjectsStore;
  selection: SubjectSelection | null;
  onSelect: (next: SubjectSelection | null) => void;
  /** 재생 버튼으로 골랐을 때. 호출부가 필요하면 세션을 다시 시작하고 페이지를 닫는다. */
  onRequestClose: () => void;
  paused: boolean;
  onNotice: (message: string) => void;
  liveTotals: ReadonlyMap<number, SubjectTotals>;
  landscape: boolean;
  timer: ReactNode;
}
```

- 헤더는 껍데기가 그리므로 패널은 본문과 푸터만 그린다.
- 패널은 `SheetContent` 안에 있어 페이지를 닫으면 언마운트되고 편집·메뉴·순서 변경 모드가 함께 초기화된다.

### 세로

- 스크롤 영역(`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-4`)에 카드를 14px 간격으로 둔다.
- 카드 머리 줄은 이름·시간과 재생 버튼이고, 눌러도 아무 일이 없다.
- 머리 줄의 길게 누르기는 지금처럼 수정·제거 메뉴를 연다(이름 바꾸기와 과목 삭제의 유일한 길이다).
- 머리 줄에서 `role="button"`·`aria-pressed`·Enter/Space 선택을 삭제한다.
- 측정 중 카드는 카드 테두리 45%와 파란 제목·시간만 바꾸고 줄 바탕·링을 삭제한다.
- 재생 버튼은 고르고 닫기(`onSelect(id)` 뒤 `onRequestClose()`)다.
- 측정 중 과목의 정지 버튼은 선택을 해제하고 페이지는 열어 둔다(결정 D3).
- 동작 줄은 `SessionPageFooter`의 `actions`로 넘기고 `flex justify-end gap-2 px-3 pt-1 pb-2`다.
- 동작 줄 버튼은 `↕ 순서 변경`(lucide `ArrowUpDown` 18, 70%)과 `+ 과목 추가`이고 `할 일 추가`와 같은 클래스 상수를 쓴다.
- 과목이 없으면 `+ 과목 추가`만 보인다.
- 목록을 받는 중이거나 실패했으면 동작 줄을 비운다(지금 헤더의 `+ 과목 추가`도 `ready`에서만 보인다).

### 가로

- 본문은 `flex min-h-0 flex-1 gap-4 regular:gap-6`이다.
- 왼쪽 열(`w-70 regular:w-90 shrink-0 flex flex-col gap-2`)은 과목 줄 스크롤 목록(간격 4)과 아래 동작 줄(`flex justify-end gap-2`)이다.
- 오른쪽 열(`min-w-0 flex-1 flex flex-col gap-2`)은 상세 카드와 `SessionPageFooter`(타이머만)다.
- 과목 줄을 누르면 보는 과목만 바뀌고 `onSelect`는 부르지 않는다.
- 보는 과목은 `viewedId` 상태에서 파생한다: `viewedId`의 과목 → 측정 중 과목 → 첫 과목.
- 보는 과목이 삭제되면 같은 규칙으로 다음 과목이 보인다.
- 과목 줄은 `role="button"`, 보는 줄에 `aria-current="true"`를 단다.
- 과목 줄 길게 누르기는 세로와 같은 메뉴다.
- 상세 카드는 머리(이름 + 시간), 완료율, 할 일 행, `할 일 추가`이고 세로 카드 본문과 같은 컴포넌트다.
- 상세 카드의 할 일 목록만 스크롤된다.
- 과목이 없거나 목록을 받는 중·실패면 두 열을 쓰지 않고 세로와 같은 본문을 한 열로 보이고 푸터 한 줄에 동작과 타이머를 둔다(결정 D9).

### 순서 변경 모드

- `reorderMode` 상태를 둔다.
- 모드에서만 `Grip`을 그린다.
- 모드에서 카드는 머리 줄만 남고 재생 버튼·`할 일 추가`·`+ 과목 추가`를 숨긴다.
- `순서 변경` 자리에 `완료`(`Button variant="secondary"`, 높이 44, 좌우 14, 반경 12)가 보인다.
- 가로에서 상세 열은 `opacity-40`과 `inert`로 누를 수 없게 한다.
- 모드에서는 길게 누르기 메뉴를 열지 않는다.
- 끌어서 놓을 때마다 지금처럼 `commitReorder`가 `PUT /api/subjects/order`로 저장한다.
- `완료`는 모드만 끈다.
- 과목이 0개가 되면 모드를 끈다.

### 할 일 행과 편집

- 완료 체크는 `bg-text-tertiary`(세션 서브트리에서 `#8B95A1`)와 `#191F28` 체크다.
- 진행 막대·정지 원 색은 결정 D10을 따른다.
- `InlineNameEditor`의 `완료`는 `Button variant="secondary"`, `h-11`, 반경 12, 좌우 14다.
- `할 일 추가` 버튼 반경을 시안 값 12(`rounded-md`)로 맞춘다.
- 할 일 순서 변경은 없다.

## 8. 배경음 페이지

```tsx
// 바뀌는 props만
interface AmbientSoundSheetProps {
  // triggerRef 삭제
  returnFocus: () => HTMLElement | null;
  landscape: boolean;
  timer: ReactNode;
}
```

- `AmbientSoundSheet`가 `SessionPage`를 렌더하고 제목 옆 ⓘ·전체 스위치를 `headerExtras`로 넘긴다.
- X 닫기 버튼을 삭제하고 뒤로 버튼으로 닫는다.
- 세로는 지금 Tabs를 쓰고 탭 줄은 좌우 24, 높이 44(`TabsTrigger`의 `min-h-11`)다.
- 세로 목록은 좌우 24로 스크롤된다.
- 세로에서도 따로 두던 동작 줄을 없애고, `집중 연동` · ⓘ · 스위치 묶음을 푸터의 `leading`으로 넘겨 타이머와 같은 줄 왼쪽에 둔다(D19).
- 가로는 Tabs를 쓰지 않고 `soundGroups` 묶음을 `grid grid-cols-2 gap-6`으로 나란히 둔다.
- 가로 묶음은 13px 제목 아래 줄마다 아이콘 · 이름 · (안내가 있으면) ⓘ · 슬라이더(`flex-1`)를 한 줄에 둔다(D16).
- 안내 ⓘ는 세로·가로 모두 이름 글자 바로 뒤에 붙고, 이름 칸 폭을 넓히지 않아 모든 줄의 슬라이더 길이가 같다(D16).
- 아이콘과 이름을 함께 감싼 버튼 폭은 `w-32.5`(130) · 태블릿 `regular:w-37.5`(150)라 시안의 이름 글자 칸 100·120과 같은 자리에서 슬라이더가 시작한다.
- 가로 아래 줄도 `SessionPageFooter`에 `집중 연동 ⓘ 스위치`를 `leading`으로 넘겨 왼쪽에, 타이머를 오른쪽에 둔다.
- `집중 연동`의 보조 문구 `집중 상태가 아닐 때는 소리를 낮춰요`는 `InfoTooltip`(`label="집중 연동 안내"`) 본문이 된다.
- `InfoTooltip`은 전역 토큰 색을 쓰므로 `contentClassName`으로 세션 툴팁 색(`bg-[var(--session-dialog-cancel-bg)] text-white`)을 덮는다.
- 제목 옆 ⓘ와 소리별 ⓘ도 `InfoTooltip`으로 바꾼다(결정 D12).
- 자동 재생 차단 안내와 목록 실패 안내는 유지한다.
- 재생 규칙(`ambient-sound-playback` 스킬)은 바꾸지 않는다.
- 소리 켜기와 슬라이더는 지금처럼 사용자 제스처 핸들러 안에서 `AudioContext`를 살린다.

## 9. 분석 이벤트

| 이벤트                 | 속성                                               | 시점                                                                 |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `subject_sheet_opened` | `source`: `button` \| `label`                      | 과목 페이지를 열 때                                                  |
| `subject_sheet_closed` | `open_sec`: 정수 초, `closed_by`: `back` \| `play` | 과목 페이지를 닫을 때, 가장자리 스와이프·브라우저 뒤로 가기도 `back` |
| `subject_item_added`   | `surface`: `sheet` 유지                            | 지금과 같다                                                          |

- 값은 enum과 정수라 Firebase 포워딩 값 규칙(`ANALYTICS_PARAM_VALUE_PATTERN`)을 통과한다.
- 개인정보처리방침의 "화면 이동 및 클릭 기록"이 이미 이 범위를 덮어 방침을 고치지 않는다.
- 세션이 끝나 페이지가 함께 사라지는 경우는 닫힘 이벤트를 보내지 않는다(결정 D6).

## 10. 접근성

- 페이지는 Radix Dialog라 `aria-modal`, 포커스 가두기, Escape, 뒤 화면 `aria-hidden`이 붙는다.
- 대화상자 이름은 `SheetTitle`(`과목`·`배경음`)이다.
- 페이지가 열린 동안 뒤 세션 화면은 Radix가 `aria-hidden`으로 가리고 포커스를 가둔다.
- 심플 모드에서 숨긴 버튼은 `invisible`과 `inert`로 보조기기·탭 순서에서 빠진다(D14).
- 페이지 안 누를 수 있는 것은 모두 44px 이상이다(시안 주석과 같다).
- 세로 카드 머리는 버튼이 아니게 되어 탭 순서에서 빠진다.
- 탭 순서는 상태 필 다음 카메라 전환, 배경음, 과목, 라벨, 일시정지, 나가기다.

## 11. 모션 (`animate` 스킬 순서)

- 페이지 열기·닫기는 하루 몇 번 여는 드로어 등급이고 목적은 위치 일관성(오른쪽에서 들어와 오른쪽으로 나간다)이다.
- 도구는 기존 `tw-animate-css` 키프레임(Radix가 퇴장 `animationend`를 기다린다), 속성은 transform·opacity, 300ms `--ease-overlay`(`cubic-bezier(0.23, 1, 0.32, 1)`)다.
- 페이지가 열려도 세션 레이어를 숨기지 않는다(D15).
- 불투명 페이지가 오른쪽으로 밀려 나가면 그 자리에 실제 세션 화면이 드러난다.
- 심플 모드 버튼 숨김은 `transition-[opacity,visibility] duration-200 motion-reduce:transition-none`이다(D14).
- 과목·배경음 버튼 아이콘 팝, 카메라 전환 회전은 유지한다.
- 새 keyframes는 만들지 않고 `sheet-content-rise`는 삭제한다.

## 12. 위험과 대응

| 위험                                                                             | 대응                                                                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS에서 Radix 스크롤 잠금이 페이지 안 탭을 먹는다                                | 껍데기 `onTouchMove` 전파 차단, 테스트로 고정                                                                                                 |
| 전폭 페이지가 카메라 위에서 움직일 때 프레임이 떨어진다                          | 흐림 없음, transform·opacity만 움직임, 실기기에서 열고 닫기 확인                                                                              |
| Escape가 이름 편집 취소 대신 페이지를 닫는다                                     | `onEscapeKeyDown`에서 텍스트 입력을 거른다                                                                                                    |
| Android 키보드가 창 높이를 줄여 세로가 가로로 잡힌다                             | 텍스트 입력에 포커스가 있으면 직전 판정을 유지하고 `focusout`에 다시 읽는다                                                                   |
| 토스트가 모달 아래 깔린다                                                        | 페이지 푸터 안 `CtaToaster`, 레이어 Toaster와 동시 마운트 금지                                                                                |
| 초대 확인 창이 페이지 아래 깔린다                                                | 확인 창을 페이지보다 뒤에 렌더(지금 순서 유지), 테스트 추가                                                                                   |
| React Compiler가 렌더 중 ref 읽기에서 컴파일을 포기한다                          | ref는 이벤트 핸들러에서만 읽고, 보는 과목은 상태에서 파생한다                                                                                 |
| 페이지를 lazy로 나누면 첫 열기가 늦다                                            | 세션 화면은 새 문서로 여는 라우트라 lazy로 나누지 않는다                                                                                      |
| JS 방향 판정이 세션 화면 원칙을 깬다                                             | 훅은 페이지가 열려 있을 때만 구독하고 기존 "matchMedia를 부르지 않는다" 테스트를 유지한다                                                     |
| iOS 한글 입력과 JS 자르기                                                        | 입력값을 JS로 자르지 않고 지금 `maxLength`를 유지한다                                                                                         |
| 가로 과목 줄(`role="button"`) 안에 재생 버튼이 들어가 누를 수 있는 요소가 겹친다 | 지금 세로 카드도 같은 구조다, 재생 버튼은 포인터 이벤트 전파를 막는 지금 처리를 유지하고 PR 리뷰 포인트로 적는다                              |
| 페이지 표시 항목이 남아 결과 화면 아래에 세션 항목이 깔린다                      | 세션이 끝날 때와 화면이 사라질 때 같은 정리 함수로 걷어 낸다, 테스트로 고정                                                                   |
| 닫기를 연달아 눌러 history가 두 칸 돌아가 세션을 나간다                          | 닫는 중 요청은 무시하고 `history.back` 호출 수를 테스트로 고정                                                                                |
| 닫은 뒤 앞쪽에 표시 항목이 남는다                                                | 웹뷰는 패치로 앞으로 가기 제스처를 껐다, 브라우저 단독에서 결과 화면의 앞으로 가기를 누르면 같은 주소의 룸이 새 세션으로 열리는 한계는 남긴다 |

## 13. 테스트 전략

- Kent Beck 순서로 순수 단위(훅, 이벤트 함수) → 프리미티브(껍데기, 버튼) → 패널 → RoomPage 통합 순으로 빨강·초록·정리를 돈다.
- 새 테스트는 클래스 문자열을 단언하지 않고 role·이름·aria·텍스트·콜백으로 본다.
- 기존 `sessionLandscape.test.tsx`는 레이어 배치를 클래스 문자열로 고정하는 예외라 새 클래스로 맞춘다.
- 가로 테스트는 `landscape` prop을 직접 넘기고, `matchMedia` 스텁은 훅 테스트에서만 쓴다.
- 목록은 계획 문서 "테스트 계획" 절에 둔다.

## 14. 결정 (2026-10-21 확정)

세션 담당자가 사용자 대신 정했고 구현에 반영했다.

| #   | 항목                                   | 결정                                                                                                | 이유                                                                                                          |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| D1  | 가로 두 열 전환 방식                   | B. 페이지 안에서만 `useLandscapeLayout`으로 구조를 고르고 크기는 CSS가 맡는다                       | 3절                                                                                                           |
| D2  | 페이지 본문 바탕                       | 헤더·푸터와 같은 `#191F28`의 90%(`--session-page-bg`), 흐림 없음 (2026-10-22 D15로 대체)            | 헤더·푸터가 `#191F28` 불투명이라 본문만 다르면 띠가 보인다, 위키 명세의 `bg.base` 다크 90% 문장은 따로 고친다 |
| D3  | 측정 중 과목의 정지(∥) 버튼            | 측정을 해제하고 페이지는 열어 둔다                                                                  | 명세가 닫는다고 한 것은 "이 과목으로 공부 시작"인 재생이고, 해제는 공부 시작이 아니다                         |
| D4  | 세로 심플 모드 타이머 위치             | 지금처럼 화면 가운데                                                                                | 명세가 가로 심플만 정했고 지금 값은 실기기 확인으로 정한 것이다, Figma를 코드에 맞춘다                        |
| D5  | 열림 이벤트 진입 경로                  | `subject_sheet_opened`에 `source: button \| label`                                                  | 라벨이 진입점으로 쓰이는지 알 수 있다                                                                         |
| D6  | 닫힘 이벤트                            | `subject_sheet_closed { open_sec, closed_by: back \| play }`, 세션 종료·언마운트 때는 남기지 않는다 | 재생으로 닫힌 비율이 "골라서 바로 공부"를 보여 준다                                                           |
| D7  | `subject_item_added`의 `surface`       | `sheet` 유지                                                                                        | 기존 지표가 끊기지 않는다                                                                                     |
| D8  | 빈 상태 보조 문구                      | `탭 한 번으로 과목이 생겨요. 나중에 이 화면에서 바꿀 수 있어요`                                     | 시트가 없어졌다, voice-tone 해요체와 맞다                                                                     |
| D9  | 가로 빈 상태·로딩·실패                 | 한 열(세로와 같은 본문, 푸터 한 줄에 동작과 타이머)                                                 | 오른쪽에 보여 줄 할 일이 없다                                                                                 |
| D10 | 정지 원·진행 막대 색                   | Figma blue/500 `#3182F6`(`bg-primary`)                                                              | 시안 변수가 blue/500에 묶여 있다                                                                              |
| D11 | 순서 변경 끌기 표시                    | 지금처럼 실시간 자리 바꿈, 들어 올린 카드·놓을 자리 표시는 하지 않는다                              | BY-696 동작이다, 디자인 후속으로 남긴다                                                                       |
| D12 | 배경음 페이지 다른 ⓘ(제목 옆·바이노럴) | `InfoTooltip`으로 통일                                                                              | 열린 툴팁을 아이콘으로 다시 눌러 닫을 수 있고 코드가 줄어든다                                                 |
| D13 | 순서 변경 모드의 길게 누르기 메뉴      | 끈다                                                                                                | 핸들 끌기와 같은 손가락 동작이 겹친다                                                                         |

### 실기기 확인 뒤 사용자 결정 (2026-10-22, 위 결정 중 겹치는 항목을 대신한다)

| #   | 항목                           | 결정                                                                                                                                                                                                                                                                                                                   | 이유                                                                                                                                                |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D14 | 심플 모드 버튼                 | 상태 필과 일시정지·재개 버튼만 남기고 카메라 전환·배경음·과목·나가기를 숨긴다, 측정 중인 과목 시간(`● 수학 01:10:00`)은 누를 수 없는 글자로 남기고 총 공부 줄은 뺀다, 화면을 한 번 더 누르면 모두 돌아온다                                                                                                             | 심플 모드는 숫자에 집중하는 화면이다, 명세의 "카메라 전환만 숨김"과 이전 시안 심플 프레임을 대신한다                                                |
| D15 | 페이지 바탕 (D2 대체)          | 반투명을 없애고 헤더·푸터와 같은 불투명 `#191F28`(`--session-dialog-bg`), `--session-page-bg`는 삭제                                                                                                                                                                                                                   | 카메라가 비치지 않아야 한다                                                                                                                         |
| D15 | 페이지가 열린 동안 세션 화면   | 숨기지 않는다, 퇴장 모션이 끝날 때까지 숨겨 두던 장치는 삭제                                                                                                                                                                                                                                                           | 불투명 페이지가 밀려 나가며 실제 세션 화면이 드러나는 편이 자연스럽다, Toaster 하나만 있게 하는 보장은 페이지 열림 값으로 유지한다                  |
| D16 | 바이노럴 비트 ⓘ 위치           | 세로·가로 모두 이름 글자 바로 오른쪽, 가로에서도 슬라이더 앞                                                                                                                                                                                                                                                           | 모든 줄의 슬라이더 길이를 맞춘다, 44px 터치 영역은 유지하고 이름 칸 폭은 늘리지 않는다                                                              |
| D17 | 과목 버튼 측정 표시            | 과목을 고른 동안 배경음 버튼처럼 아이콘이 집중 색(`data-on` + `--state-focus`)이고 이름이 `과목 선택됨`                                                                                                                                                                                                                | 배경음 버튼의 `배경음 켜짐` 규칙을 그대로 쓴다, 일시정지 중에도 선택은 남아 있어 "측정 중" 대신 "선택됨"이다                                        |
| D18 | 제목·글자와 ⓘ 간격             | 배경음 제목·집중 연동·바이노럴 비트 모두 글자와 ⓘ 사이 4px(홈 연속 공부 카드와 같은 `gap-1`), ⓘ와 스위치 사이는 22px 유지                                                                                                                                                                                              | 44px 터치 영역은 가상 요소라 간격을 밀지 않는다, 스위치 쪽은 두 터치 영역이 겹치지 않아야 한다                                                      |
| D19 | 세로 배경음의 집중 연동 줄     | 타이머 위 동작 줄을 없애고 `집중 연동 ⓘ 스위치` 묶음을 푸터의 타이머와 같은 줄 왼쪽에 둔다(가로와 같은 모양), 글자와 ⓘ 4px, ⓘ와 스위치 22px, 과목 페이지의 동작 줄은 그대로                                                                                                                                            | 사용자 요청(2026-10-22, 같은 날 왼쪽·오른쪽 정렬 안을 거쳐 최종 결정)                                                                               |
| D20 | 플랫폼 뒤로 가기로 페이지 닫기 | 페이지를 열 때 URL은 바꾸지 않고 history 항목 하나를 쌓고 popstate가 오면 닫는다, ‹·Escape·재생 버튼도 `history.back()`으로 같은 길을 타고 `closed_by`는 닫을 때마다 한 번만 남긴다, 세션이 끝나거나 화면이 사라질 때는 쌓은 항목만 걷어 내고 닫힘은 남기지 않는다, Android 하드웨어 뒤로 가기는 바꾸지 않는다(BY-948) | iOS 가장자리 스와이프와 브라우저 뒤로 가기가 세션을 나가지 않고 페이지만 닫아야 한다(사용자 승인 A안, 2026-10-22), 네이티브 변경 없이 웹만으로 된다 |

- D14에서 심플 모드 과목 글자를 누를 수 없게 한 것은 세션 담당자 추천이다.
- 심플 모드는 화면 탭이 모드 전환이라 눌리는 라벨이 그 동작과 겹쳐 페이지가 잘못 열린다.
- 사용자가 되돌리면 `RoomPage`에서 `SubjectLabel`의 `onClick`을 심플 모드에도 넘기면 된다.

## 15. 디자인 확인 필요 (PR 본문에 적는다)

- 페이지 본문이 시안의 90% 반투명에서 불투명으로 바뀌었다(D15, 시안·명세 갱신 필요).
- 시안 가로 타이머는 ExtraBold인데 코드 타이포는 Bold라 Bold로 구현한다.
- 시안 페이지 타이머 발광은 한 겹(11.8px 60%)이고 코드는 심플 모드와 같은 두 겹을 쓴다.
- 순서 변경 끌기 표시가 시안과 다르다(D11).
- 큰 태블릿 세로 페이지 타이머 크기는 명세에 없어 40px로 둔다.
- 세로 심플 모드 타이머는 코드가 화면 가운데(D4)라 S1b-1·T1-1 심플 프레임(하단)을 코드에 맞춰 고친다.
- 배경음 가로 헤더 위 여백이 시안은 4, 과목 페이지는 8이라 공용 껍데기에서 8로 맞췄다.
- 배경음 ⓘ 색이 `InfoTooltip` 기본값(`text-tertiary` #8B95A1)으로 바뀌었다(예전 시트는 #B0B8C1).
