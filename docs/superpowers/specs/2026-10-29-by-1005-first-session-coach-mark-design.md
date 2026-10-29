# BY-1005 첫 세션 안내 코치마크 설계

- Jira: BY-1005 (BY-1004 첫 세션 안내 기획의 구현)
- 명세: 위키 `product/specs/BY-1004-첫-세션-안내.md`
- 기준 브랜치: `feature/BY-949-home-redesign` (PR #383 탭 바 재생 버튼 머지 뒤)
- 날짜: 2026-10-29

## 왜

과목이 0개인 홈은 `+ 과목 추가` 빈 화면이다(2026-10-30 사용자 결정으로 BY-1054의 환영 화면은 없앴다). 세션을 시작하는 입구는 날짜 줄 위의 `순공 시작하기` 버튼이나 탭 바 오른쪽의 재생 원인데, 처음 온 사람은 과목을 만들어야 시작할 수 있다고 읽기 쉽다. 시작 버튼을 가리키는 코치마크 하나로 첫 세션 진입을 앞당긴다.

## 무엇을

### 노출 조건 (전부 참일 때)

| 조건                                         | 판단 근거                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 과목을 만든 적 없는 계정                     | 과목이 0개이면서 기기 기록 `hasCreatedSubject`가 없다(`firstVisit`). 화면은 과목을 만든 적 있는 계정과 같은 `+ 과목 추가` 빈 화면이다                                                      |
| 홈이 오늘을 보여 준다                        | `selectedKey === todayKey`. 다른 날짜에선 같은 자리의 원이 `오늘로 돌아가기`다                                                                                                             |
| 지금 다른 팝업이 열려 있지 않다              | 공지·세션 복구 판단이 끝났고(`noticeSettled && recoverySettled`) `aria-modal` 대화상자(공지·복구·랭킹 팝업·시트)가 열려 있지 않다(`useModalOverlayOpen()`이 거짓). 팝업이 닫히면 그때 뜬다 |
| 기기 기록이 "본 적 없음"이거나 "다시 보기"다 | 아래 저장 규칙                                                                                                                                                                             |
| 상단 탭 바 iPad가 아니다                     | `tabBarPlay=1`이면서 iPad(UA에 `iPad`, 또는 `Macintosh`이면서 `maxTouchPoints > 1`)면 띄우지 않는다. 폴백 버튼 앱의 iPad는 버튼이 웹 안에 있어 띄운다                                      |

"다시 보기"로 온 경우는 과목 유무와 상관없이 띄운다(과목을 이미 만든 사용자도 설정에서 다시 볼 수 있어야 한다). 나머지 조건은 같다.

### 가리키는 대상

| 앱                                        | 대상                                                                                                                              | 덮개                                                                                     | 탭 바 차단                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `tabBarPlay=1` 아님(이전 앱, iOS 26 미만) | 날짜 줄 위 전체 너비 `순공 시작하기` 버튼. PR #383이 이미 시안(7421:14374) 크기로 바꿨고, 이 티켓은 `data-coach="start"`만 붙인다 | 버튼 자리만 뚫린 어두운 덮개 + 발광 테두리                                               | `set-tab-bar { visible: true, blockedByModal: true }` (기존 차단)   |
| `tabBarPlay=1`                            | 웹뷰 밖 탭 바 오른쪽 재생 원. 웹은 덮개를 웹뷰 전체에 깔고, 오른쪽 아래에서 재생 원 쪽으로 꼬리를 둔 문구 블록을 놓는다           | 웹뷰 전체(뚫린 곳 없음). 날짜 줄·탭 바의 어두움은 앱의 `blocked-except-play` 딤이 맡는다 | `set-tab-bar { visible: false, blockedExceptPlay: true }` (BY-1058) |

### 사라지는 조건과 저장

- 덮개를 누르거나 시작 버튼(웹 폴백 버튼, 또는 앱의 재생 원 → `home-play-pressed`)을 누르면 닫힌다.
- 닫히면 기기 저장소에 계정별로 `seen`을 남기고 다시 띄우지 않는다.
- 키: `focusmakers:start-guide:${userId}`, 값: `seen` | `replay`. 값이 없으면 "본 적 없음".
- 설정의 `처음 안내 다시 보기` 행을 누르면 값을 `replay`로 바꾸고 홈으로 보낸다(앱은 `navigate-home` 브리지, 브라우저는 `/home` 이동). 홈은 탭이 다시 보일 때(`tab-focus`)와 마운트 때 값을 다시 읽는다.
- 저장소를 쓸 수 없는 기기에서는 "본 적 없음"으로 보고, 닫은 기록도 남기지 못해 다음 방문에 한 번 더 보일 뿐이다(`subjectHistory.ts`와 같은 태도).

### 문구 (voice-tone, 해요체, 느낌표 없음)

| 자리               | 문구                                                      |
| ------------------ | --------------------------------------------------------- |
| 코치마크 제목      | `지금 바로 시작해 보세요`                                 |
| 코치마크 설명      | `시작 버튼을 누르면 측정 화면으로 넘어가요`               |
| 설정 행            | `처음 안내 다시 보기` (임시, 디자인 검토 뒤 바꿀 수 있음) |
| 코치마크 aria 이름 | 제목과 같다                                               |

### 모양 (Figma 시안 'BY-1005 코치마크' 행, 라이트·다크)

- 덮개: `--coach-dim`(라이트 #000000b3, 다크 #000000c2). 기존 `--dim`(40%/60%)보다 짙다. 앱이 그리는 탭 바·날짜 줄의 딤은 앱의 `--dim` 값이라 실기기에서 농도 차가 띠로 보이면 `bg-dim`으로 낮춘다.
- 대상 강조: 대상 둘레 5px 여유의 2px 테두리(`--coach-ring`, 라이트 #4593fc·다크 #5a9cff)와 같은 색 발광 그림자(blur 18, 80%).
- 제목: 30/38 bold, 세로 그라데이션 `--gradient-brand-text`(라이트 #8cc0ff→#4593fc, 다크 #7fb3ff→#3182f6. 라이트에서 #1b64da는 덮개 위 대비가 1.6:1이라 뺐다). 토큰은 `index.css` 세 블록 + `packages/design-tokens` 네 곳에 둔다. 사용은 `bg-(image:--gradient-brand-text) bg-clip-text text-transparent`.
- 설명: 15/22, `text-primary-foreground/90`, 제목 아래 10px. 재생 원 변형은 설명 아래에 재생 원 쪽으로 꺾이는 점선 곡선 화살표(SVG, 시안 7516:14487)를 둔다.
- `다음`·`건너뛰기` 없음. 행동 유도는 강조된 진짜 시작 버튼이 맡는다.
- 모션: 덮개·문구 페이드인 200ms. `prefers-reduced-motion`이면 즉시 표시.

## 어떻게

### 단위

| 단위                         | 위치                          | 역할                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startGuide.ts`              | `apps/web/src/features/home/` | 기기 기록 읽기·쓰기(`startGuideState`, `markStartGuideSeen`, `requestStartGuideReplay`), 노출 판정 순수 함수 `shouldShowStartGuide(input)`, iPad 판정 `isIPad(userAgent, maxTouchPoints)`                                                                                                                                                                     |
| `StartCoachMark.tsx`         | `apps/web/src/features/home/` | 오버레이 그리기. `target: "button" \| "play"`. button이면 `[data-coach="start"]`의 사각형을 재서 네 조각 덮개(위·아래·왼쪽·오른쪽)로 구멍을 내고 발광 테두리를 그린다. play면 전체 덮개 + 오른쪽 아래 문구. `role="dialog"` + `aria-label`, `aria-modal`은 붙이지 않는다(붙이면 `nativeModalOverlay`가 모달로 읽어 재생 원까지 막는다). 덮개 탭 → `onDismiss` |
| `nativeTabBar.ts` 확장       | `apps/web/src/lib/`           | `useCoachMarkTabBar(mode: "blocked" \| "except-play" \| null)` 모듈 스토어. `useNativeTabBarSync`가 `except-play`면 `{ visible: false, blockedExceptPlay: true }`, `blocked`면 `{ visible: true, blockedByModal: true }`를 보낸다. 코치마크가 내려가면 원래 계산으로 돌아간다                                                                                 |
| `HomeTabPage.tsx`            | `apps/web/src/routes/`        | 과목 0개면 `+ 과목 추가` 빈 화면(환영 화면 없음). 노출 판정 후 `StartCoachMark` 렌더. 폴백 버튼·`home-play-pressed`·덮개 탭에서 `markStartGuideSeen`. `tab-focus`에서 기록 다시 읽기                                                                                                                                                                          |
| `HomeDateStrip.tsx`          | `apps/web/src/features/home/` | 폴백 버튼에 `data-coach="start"`                                                                                                                                                                                                                                                                                                                              |
| `SettingsPage.tsx`           | `apps/web/src/routes/`        | `처음 안내 다시 보기` 행(재생 원 앱의 iPad에서는 안내가 뜰 수 없어 행을 숨긴다). `trackSettingsRowPressed("first_session_guide")` → `requestStartGuideReplay(userId)` → 홈으로                                                                                                                                                                                |
| `index.css`, `design-tokens` | —                             | `--gradient-brand-text` 토큰                                                                                                                                                                                                                                                                                                                                  |

### 흐름

```
홈 마운트 ─ 과목 목록·그날 기록 수신 ─ firstVisit(과목 0개 && 만든 적 없음) 계산
   └ shouldShowStartGuide({ firstVisit, isToday, popupFree(열린 팝업 없음), state, tabBarPlay, iPad })
        ├ false → 아무것도 안 그림
        └ true  → <StartCoachMark target=…>  + useCoachMarkTabBar(mode)
              ├ 덮개 탭 ─────────────→ markStartGuideSeen → 내림
              ├ 폴백 버튼 탭 ───────→ markStartGuideSeen → startFocus("home_fallback")
              └ 앱 재생 원 → home-play-pressed → markStartGuideSeen → startFocus("tab_bar")
설정 `처음 안내 다시 보기` → requestStartGuideReplay → navigate-home(앱)/"/home"(웹)
   → 홈 tab-focus/마운트에서 state 재읽기 → replay면 위 흐름
```

### 테스트

- `startGuide.test.ts`: 상태 전이(없음→seen, replay→seen, 저장소 예외), `shouldShowStartGuide` 조건 조합, `isIPad` UA 세 경우.
- `StartCoachMark.test.tsx`: `role="dialog"` 이름, `aria-modal` 없음, 덮개 클릭이 `onDismiss`를 부름, button 대상일 때 대상 요소를 찾아 구멍 네 조각을 그린다(요소 수), play 대상일 때 구멍 없음.
- `HomeTabPage.test.tsx`: 과목 0개+만든 적 없음+오늘 → 코치마크 있음 / `hasCreatedSubject` → 없음 / 과거 날짜 → 없음 / `tabBarPlay=1`+iPad UA → 없음 / `replay`면 과목 있어도 있음 / 폴백 버튼 클릭 뒤 seen.
- `nativeTabBar.test.tsx`: 모드별 `set-tab-bar` 페이로드.
- `SettingsPage.test.tsx`: 행 클릭 → `replay` 저장 + `navigate-home` 전송.

## 범위 밖

- 푸시 권한 요청 시점(BY-1076), 과목 세트 시트(보류), Amplitude 차트, 새 분석 이벤트.
- iPad 전용 레이아웃. 상단 탭 바 iPad는 띄우지 않고 설정의 다시 보기 행도 숨기는 것으로 끝낸다.

## 결정 기록

| 결정                                                     | 이유                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 환영 화면을 없애고 과목 0개는 항상 `+ 과목 추가` 빈 화면 | 2026-10-30 사용자 결정. 코치마크가 시작 입구를 알려 주므로 환영 화면의 `과목 만들기` 주 동선이 필요 없다. 설명 문구도 `시작 버튼을 누르면 측정 화면으로 넘어가요`로 줄였다                                              |
| 버튼 교체는 하지 않는다                                  | PR #383이 스토리 브랜치에 머지되면서 이미 시안 크기의 `순공 시작하기` 버튼이 들어왔다. 식별자만 붙인다                                                                                                                  |
| 탭 바 차단은 `nativeTabBar.ts` 스토어로 보낸다           | `aria-modal` 감지기에 기대면 재생 원 앱에서 분기할 수 없고, 보내는 곳이 한 군데여야 `pageshow` 재전송·전환 대기 규칙을 그대로 탄다                                                                                      |
| 구멍은 네 조각 덮개                                      | 한 장 덮개에 마스크를 쓰면 구멍 아래 버튼이 눌리지 않는다. 네 조각이면 구멍은 빈 공간이라 누름이 버튼으로 간다                                                                                                          |
| 팝업이 열려 있는 동안만 숨긴다                           | 처음엔 "팝업이 뜬 실행은 다음 실행으로"였는데, 설정의 다시 보기가 같은 문서에서 안 뜨는 문제가 있어 "지금 열린 팝업이 없으면"으로 바꿨다. 열린 팝업 판정은 탭 바 차단이 이미 쓰는 `useModalOverlayOpen()`을 그대로 쓴다 |
| iPad는 UA로 판정                                         | 앱이 iPad 표시를 보내지 않는다. `storeLink.ts`가 같은 규칙으로 iPadOS를 가른다                                                                                                                                          |
