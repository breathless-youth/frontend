# BY-737 홈 화면 V2 UI 적용

## 배경

V2 시안이 올라오면서 홈이 Soft Blue 시각 언어로 다시 그려졌다. 지금 홈은 V1 팔레트에 히어로 카드, 집중 시작 카드, 스탯 카드 2개, 가이드 카드를 손으로 만들어 쓰고 있어 구성과 색, 간격, 반경, 그림자가 시안과 모두 다르다.

시안은 `S1 · 홈 (Soft Blue)` 섹션의 `홈 · 집중률 바 (Soft Blue)` 프레임(`5381:3762`)이다. 다크 판이 없어 같은 섹션 다크 판의 `링 없음` 프레임(`5296:3420`) 색을 따른다.

## 착수 전 확인한 사실

### 시안 구조

위에서 아래로 헤더, 연속 공부 카드, 통계 카드, 집중 시작 버튼, 친구 초대 카드다. 화면 좌우 여백은 20, 카드 사이 간격은 12다.

- 헤더는 좌상단 D-Day 블록 하나다. 위 22, 아래 8 패딩이다.
- 연속 공부 카드는 흰 카드(반경 20, `shadow/card-soft-blue`)에 불꽃 38×44, 제목 `5일 연속 공부 중` 15/19 Bold, ⓘ 14px, 일요일부터 토요일까지 도트 7개(24px, 요일 라벨 11/13)다.
- 통계 카드는 같은 카드 셸에 패딩 22/22/20/22, 세로 간격 18이다. `오늘 순공시간` 14/17 Bold, 큰 숫자는 숫자 40/48 ExtraBold와 단위 21 Bold를 섞는다. `집중률` 14/17 Bold와 `96%` 15/18 ExtraBold가 한 줄, 그 아래 게이지 10px(반경 999)다. 1px 구분선 아래 `총 공부시간`과 `최대 집중시간`이 2열이고 라벨 13/16, 값 18/22 ExtraBold다.
- 집중 시작은 56px 단색 버튼, 반경 20, 글자 17/21 Bold다. 그림자는 없다.
- 친구 초대 카드는 `brand/subtle` 배경, 반경 20, 패딩 20/22, 일러스트 64×64(PNG 이미지 채움), 제목 16/20 Bold, 본문 14/20, 링크 12/15 Bold와 셰브런 6×10이다. 글자색은 Figma 변수 `5283:15`(`#3f5f96`, 다크 `#a9c4f5`)다.

### 코드에 이미 있는 것

- `.theme-soft-blue`, `bg-soft-blue`, `shadow-sb-card`, `Card`, `Button size=xl`, `Tooltip`이 dev에 있다.
- `Button size=xl`은 반경 16이고 소셜 V2가 그대로 쓴다. 시안 CTA는 20이지만 소셜과 같은 값을 쓴다.
- 기록 탭 `StreakBanner`의 `WeekDot`이 도트 상태 3종(done, today, none)을 그린다. 크기는 28이다.
- `streakQuery(userId, range)`는 `studiedDatesInRange`를 준다. 홈은 지금 범위 없이 조회해 스트릭 숫자만 쓴다.
- `weekDateKeys`, `weekdayIndexOfDateKey`, `dayOfDateKey`, `WEEKDAY_LABELS`가 `recordsFormat.ts`에 있다. 주간 도트 배열 조립은 `RecordsPage`에 인라인이다.
- shadcn `Progress`는 없어서 받았다(`@radix-ui/react-progress`).

### 브리지 계약

`navigate-tab`의 `tab`은 `"records"` 하나뿐이다. 셸 `webBridge.ts`는 계약 밖 값을 통째로 버리고, `nativeBridgeHandler.ts`는 `/records`로만 이동한다. 초대 카드가 소셜 탭으로 가려면 `packages/types`, `webBridge.ts`, `nativeBridgeHandler.ts`, `nativeAnalytics.ts` 네 곳을 같이 넓혀야 한다. 이미 배포된 앱은 새 값을 버리므로 새 빌드 전까지 초대 카드 탭은 무동작이다.

## 확정한 결정

- 헤더는 기존 `FocusMakers`와 날짜를 유지하고 V2 타이포로만 다듬는다. D-Day 블록은 BY-656 몫이다.
- 가이드 카드, `카메라가 자동으로 측정해요` 캡션, 연속 공부 카드의 기록 탭 이동은 시안대로 없앤다.
- 게이지는 shadcn `Progress`로 바꾼다. 트랙 `bg-bg-layer-2`, 채움은 `primary` 반투명에서 불투명 그라디언트다. 눈금은 없앤다.
- 초대 카드는 웹뷰에서 `navigate-tab {tab: "social", via: "invite_card"}`를 보내고 브라우저에서는 `/social`로 쿼리를 이어받아 이동한다. 웹 전용 이벤트는 만들지 않는다. 셸이 `tab_pressed {via: invite_card}`로 세면 충분하다.
- `WeekDot`을 `StreakBanner.tsx`에서 export해 홈이 재사용한다. 체크 아이콘은 lucide `Check`로 바꿔 기록 탭도 같이 따라간다. 크기 28은 유지하고 시안 24와의 차이는 PR에 적는다.
- 주간 도트 배열 조립을 `buildStreakWeek(todayKey, doneDates)`로 `recordsFormat.ts`에 옮기고 기록과 홈이 같이 쓴다.
- `useHomeSummary`가 `streakQuery`를 이번 주 범위로 조회해 `studiedDates`를 더한다. 기록 탭과 캐시 키가 같아져 조회가 하나 줄어든다.
- 초대 카드 글자색은 토큰에 없어 `text-primary`로 쓴다.
- 큰 숫자 폰트는 NanumSquareRound ExtraBold로 통일한다.
- ⓘ 툴팁 문구는 `하루 10분 이상 공부하면 연속 공부가 이어져요`다.
- 손으로 그린 `IconPlay`, `IconChevronRight`, `IllustStudyDoodle`은 홈 밖에서 쓰지 않아 지운다.

## 변경 파일

| 파일                                                                          | 변경                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/ui/progress.tsx`                                     | 받은 원본을 토큰 클래스로 고친다. 높이 10, 트랙 `bg-bg-layer-2`, 채움 그라디언트, `motion-reduce:transition-none` |
| `apps/web/src/routes/HomeTabPage.tsx`                                         | 화면 구성 전체를 V2로 바꾼다                                                                                      |
| `apps/web/src/features/home/useHomeSummary.ts`                                | 스트릭을 주 범위로 조회하고 `studiedDates`를 준다                                                                 |
| `apps/web/src/features/home/homeSummary.ts`                                   | `studiedDates` 필드 추가                                                                                          |
| `apps/web/src/features/home/icons.tsx`                                        | `IllustFlame`만 남긴다                                                                                            |
| `apps/web/src/assets/home-invite-friends.png`                                 | Figma 원본 256×256                                                                                                |
| `apps/web/src/features/records/StreakBanner.tsx`                              | `WeekDot` export, 체크를 lucide `Check`로                                                                         |
| `apps/web/src/features/records/recordsFormat.ts`                              | `buildStreakWeek` 추가                                                                                            |
| `apps/web/src/routes/RecordsPage.tsx`                                         | 인라인 조립을 `buildStreakWeek`로 교체                                                                            |
| `apps/web/src/lib/statsQueries.ts`                                            | 홈·기록 키 분리 주석 갱신                                                                                         |
| `packages/types/src/bridge.ts`                                                | `tab`에 `"social"`, `via`에 `"invite_card"` 추가                                                                  |
| `apps/mobile/lib/webBridge.ts`                                                | `navigate-tab` 검사 확장                                                                                          |
| `apps/mobile/lib/nativeBridgeHandler.ts`                                      | 탭 매핑과 이동 경로 확장                                                                                          |
| `apps/mobile/lib/nativeAnalytics.ts`                                          | `tab_pressed.via`에 `invite_card` 추가                                                                            |
| `.claude/skills/focusmakers-design/references/components.md`, `shadcn-map.md` | 홈 행과 Progress 행 갱신                                                                                          |

## 테스트 계획

기존 테스트를 바뀐 문구와 구성 기준으로 고치고, 새 동작에는 테스트를 더한다. 상태는 텍스트, `aria-label`, 라우트로만 검증한다.

### `HomeTabPage.test.tsx`

- 성공 시 `오늘 순공시간`, `집중률`, `77%`, `총 공부시간`, `2시간 0분`, `최대 집중시간`, `52분`, `3일 연속 공부 중`이 보인다.
- 오늘 도트가 `요일, 오늘` 라벨로, 공부한 날 도트가 `공부함`으로 그려진다.
- 집중 시작 버튼의 접근성 이름이 `집중 시작`이다. 기존 가이드 분기, 세션 이동, 이중 탭 방지 케이스는 이름만 바꿔 유지한다.
- 웹뷰에서 초대 카드를 누르면 `navigate-tab` `tab: social`을 보내고 웹 라우팅하지 않는다.
- 브라우저 단독 모드에서 초대 카드를 누르면 `/social?userId=7`로 이동한다.
- 가이드 카드 케이스와 연속 공부 카드의 기록 탭 이동 케이스는 지운다.
- 오류, 단독 모드 안내, 복구 모달 케이스는 그대로 둔다.

### `useHomeSummary.test.tsx`

- `getStreak`이 이번 주 일요일부터 오늘까지 범위로 불린다.
- `summary.studiedDates`가 응답의 `studiedDatesInRange`다. 없으면 빈 배열이다.

### `recordsFormat.test.ts`

- `buildStreakWeek`이 오늘을 `today`, 공부한 날을 `done`, 나머지를 `none`으로 7개를 준다.

### `webBridge.test.ts`, `nativeBridgeHandler.test.ts`

- `tab: "social"`이 살아남고 `via: "invite_card"`가 유지된다.
- `navigate-tab social`이 `/social`로 이동하고 `tab_pressed {tab: social, via: invite_card}`를 남긴다.

## 검증

- `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm --filter web lint`
- `pnpm --filter mobile test`
- 브라우저에서 `/home?userId=N` 라이트와 다크 스크린샷 한 장씩

## 채점 반영

`code-review`로 두 번 채점하고 아래를 고쳤다.

- ⓘ 툴팁은 Radix가 터치에서 열지 않아 `InfoTooltip`으로 공용화했다. 열림을 직접 들고 탭으로 토글하며, 열린 채 다시 탭하면 닫힌다. 설정 화면도 같이 쓴다.
- 시간 길이는 전 화면 공통 `formatDuration`을 쓴다. 홈 전용 `formatHoursMinutes`, `formatMinutes`는 지웠다.
- 가이드 카드가 사라져 진입값 `home-card`를 없앴다. 출처를 모르는 진입은 `unknown`으로 센다.
- 오늘 통계에는 placeholder를 두지 않는다. 자정을 넘긴 뒤 어제 합계가 새 날짜 아래 보이면 안 된다. 주간 스트릭만 직전 값을 유지한다.
- 초대 카드는 500ms 안의 재탭을 무시한다. 홈 문서는 탭을 오가도 살아 있어 영구 래치를 쓸 수 없다.
- `navigate-tab`의 목적지·발신처 목록을 `packages/types`의 상수 하나로 두고 셸 파서가 그 목록으로 검사한다.
- 카드 테두리는 `border-0`이다. 투명 테두리는 1px을 차지해 시안 패딩과 어긋난다.

반영하지 않은 것과 이유는 PR 본문에 적는다. 구 앱에서 초대 카드가 무동작인 것은 계약 확장을 같은 PR에서 하기로 한 결정의 결과이고, 오늘 도트의 `bg-background`는 Figma가 `bg/base`에 묶어 둔 값 그대로다.
