# BY-1005 홈 첫 세션 코치마크 (현재 홈) 설계

2026-11-01. 949 홈 개편(A/B 뒤 결정) 위에 만들어 보관 중인 홈 코치마크(PR #391)를 기다리지 않고, 지금 운영 중인 홈 위에 코치마크를 먼저 배포한다. base는 dev이고 앱 수정은 없다. Figma는 V2 Screens 페이지 `S1 · 홈 코치마크 (현재 홈) 라이트`(7832:14265)·`다크`(7832:14378)다. 세션 쪽 안내는 `2026-11-01-by-1062-simple-mode-start-and-help-v2-design.md`에 있다.

## 왜

- 첫 세션 전에 "무엇을 누르면 측정이 시작되는지"를 한 번 짚어 주고, 세션 도움말·카메라 확인 창까지 한 흐름으로 잇는다.
- 949 홈은 탭 바 재생 버튼 때문에 앱 쪽 기능이 필요했지만, 현재 홈은 모든 플랫폼에서 웹 `집중 시작` 버튼으로 시작하므로 웹만 배포하면 된다.

## 무엇을

### 모양

- 전체 덮개(`--coach-dim` 토큰, 라이트 70%·다크 76%) 위에 `집중 시작` 버튼만 네 조각 덮개로 뚫어 밝게 보이고, 버튼 둘레 5px 바깥에 강조 링(2px + 발광)을 그린다.
- 버튼 위 20px에 제목 `지금 바로 시작해 보세요`(primary 그라데이션 글자 `--gradient-brand-text`, 30/38 Bold)와 설명 `집중 시작을 누르면 측정 화면으로 넘어가요`(15/22, 흰색)를 버튼과 같은 폭으로 가운데 정렬한다.
- 라이트·다크 둘 다 덮개와 링 색은 Figma 값을 따른다. 나타날 때 `coach-fade-in`, reduced-motion에서는 즉시.
- 덮개는 `role="dialog"` 비모달(`aria-modal` 없음)이고 제목이 이름이다. 뜨면 초점은 `집중 시작` 버튼에 둔다.

### 언제

- 홈 탭에 들어올 때마다 뜬다. 코치마크가 뜬 상태에서 `집중 시작`을 눌러 세션으로 넘어간 계정만 `focusmakers:start-guide:${userId}`에 `seen`을 남겨 다시 뜨지 않는다.
- 앱을 끄거나 다른 탭으로 나가면 기록을 남기지 않아 다음 홈 진입 때 다시 뜬다. 횟수 상한은 없다.
- 신원(`userId`)이 없으면 기록할 수 없어 띄우지 않는다. 신원 대기(`useIdentityPending`) 중에도 띄우지 않는다.
- 다른 홈 팝업이 뜬 실행에서는 띄우지 않고 다음 홈 진입으로 미룬다. 공지 모달(`NoticeModalHost`)이 정리된 뒤(`noticeSettled`)에 홈 팝업이 하나도 문서에 없을 때(`homePopupInDoc` 거짓, 랭킹 팝업·복구 안내 닫힘)만 뜬다.
- 다시 보기 경로는 두지 않는다. 설정 항목도 없다.

### 막는 것

- 떠 있는 동안 홈 본문은 `inert`로 막고 `집중 시작`만 누를 수 있다. 덮개 탭·Escape로는 닫히지 않는다.
- 탭 바는 앱의 기존 "blocked" 경로로 막는다. `useNativeTabBarSync`가 보내는 `blockedByModal`은 `useModalOverlayOpen`(aria-modal 감지)에 묶여 있으므로, 코치마크는 aria-modal 대신 `nativeTabBar`의 차단 상태를 직접 켜는 작은 스토어(`useCoachMarkTabBar("blocked")`, #391의 것에서 `except-play`를 뺀 꼴)로 보낸다. 앱 쪽 메시지 형식은 기존 `set-tab-bar { blockedByModal: true }` 그대로라 구버전 앱도 받는다.

### 흐름

```
홈 진입 → 팝업 없음·신원 있음·seen 아님 → 코치마크
  └─ 집중 시작 탭 → seen 저장 → 세션(심플 모드) → 세션 도움말(안 본 계정) → 카메라 확인 창
```

### 건너뛰기

- `집중 시작` 링 아래 12px에 글자 버튼 `나중에 할게요`(15 Medium, 흰색 70%, 눌리는 영역 120×44 이상)를 둔다. 본문이 `inert`인 동안 Tab 순서는 `집중 시작` → `나중에 할게요`다.
- 누르면 이번 홈 진입 동안만 코치마크를 숨긴다(`guideDismissed`, 마운트마다 거짓). `seen`은 남기지 않아 홈을 다시 마운트하면 다시 뜬다. 숨기면 본문 `inert`와 탭 바 차단이 풀리고 초점은 `집중 시작`으로 돌아간다.
- 덮개 탭·Escape로는 여전히 닫히지 않는다. 출구는 `집중 시작`과 `나중에 할게요` 둘뿐이다.
- 숨길 때 따로 모션을 두지 않고 언마운트한다. `home_start_guide_skipped`(속성 없음)만 보내고 `home_start_guide_completed`는 보내지 않는다.

### 계측

- `home_start_guide_shown`·`home_start_guide_completed`·`home_start_guide_skipped`(모두 속성 없음). 완료는 코치마크에서 `집중 시작`을 누른 것이고, 건너뜀은 `나중에 할게요`를 누른 것이다. 분석 설계 문서 표에 행을 더한다.

## 어떻게

| 단위                               | 역할                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/home/StartCoachMark.tsx` | #391의 것을 옮겨 붙이되 `target` prop과 재생 원 분기를 뺀다. `data-coach="start"` 요소의 사각형을 재서 네 조각 덮개·링·글을 그린다                         |
| `features/home/startGuide.ts`      | `startGuideState`(seen \| null), `markStartGuideSeen`, `shouldShowStartGuide({ state, popupOpen, userId })`. `replay`·`firstVisit`·iPad 판정은 없다        |
| `lib/nativeTabBar.ts`              | `useCoachMarkTabBar(active)`: 켜져 있는 동안 `blockedByModal`을 보낸다                                                                                     |
| `routes/HomeTabPage.tsx`           | `집중 시작` 버튼에 `data-coach="start"`, 노출 조건, `startFocus` 앞에 `markStartGuideSeen`·완료 이벤트                                                     |
| `lib/amplitude.ts`                 | 이벤트 함수 3개                                                                                                                                            |
| 테스트                             | `startGuide.test.ts`, `StartCoachMark.test.tsx`, `HomeTabPage.test.tsx`(노출·팝업 미룸·신원·완료·초점·inert), `nativeTabBar.test.tsx`, `amplitude.test.ts` |

## 범위 밖

- 949 홈용 코치마크(#391, A/B 뒤), 다시 보기, 탭 바 재생 버튼 앱, 위키 BY-1004 명세 갱신(별도).

## 결정 기록

- 2026-11-01 사용자: A/B 전에 현재 홈에 먼저 배포. 노출 규칙은 세션 도움말과 같게(모두에게, 완료 계정만 제외). 다시 보기 없음(권장안). 제목이 덮개 아래 통계 글자와 겹치는 것은 그대로 둔다.
- 2026-11-01 사용자 결정 A: 덮개 탭·Escape는 닫지 않고, 세션 없이 나오는 길은 `seen`을 남기지 않는 `나중에 할게요` 버튼 하나로 한다.
