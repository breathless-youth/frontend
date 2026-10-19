# BY-937 나머지 화면 가운데 최대 폭 설계

상위 티켓 BY-641(태블릿 반응형)의 마지막 하위 작업이다. 세션·소셜룸(BY-936)을 뺀 화면들이 태블릿에서 전폭으로 늘어나는 문제를 가운데 최대 폭으로 정리한다.

## 배경

- 공통 레이아웃 컴포넌트가 없어 화면마다 `<main className="theme-soft-blue bg-soft-blue min-h-dvh …">`를 따로 쓰고, 안쪽 `px-5`가 콘텐츠 폭을 정했다.
- iPad 가로(1180~1376px)에서 카드·버튼·기록 달력이 전폭으로 늘어났다. 기록 달력 셀은 약 160px까지 커졌다.
- 아래 시트 4개(D-Day, 랭킹 추월, 기록 상세, 기간 선택)가 `sheet.tsx` bottom 변형이라 태블릿에서도 전폭이었다.
- 세션·소셜룸 11개 파일의 51곳이 `sm:not-landscape-compact:`를 쓰고, 이 조합은 `landscape-compact` 정의의 바깥 괄호가 빠지면 규칙 전체가 사라진다.

## 결정

| 항목                | 결정                                                                                                 | 이유                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 태블릿 variant 이름 | `regular:` (폭 600 이상이면서 `landscape-compact`가 아님)                                            | `landscape-compact:`와 짝을 이루는 짧은 이름이고 기기 이름이 아니다. 괄호 함정이 정의 한 곳에만 남는다 |
| 최대 폭             | 태블릿 640px, 큰 태블릿(`short-side-lg`) 720px                                                       | 홈 카드·기록 달력·랭킹 목록이 읽기 편한 폭(약 600~700px)에 들어간다                                    |
| 적용 방식           | 배경은 전폭, 좌우 여백으로 콘텐츠를 가운데에 모은다                                                  | `bg-soft-blue` 그라디언트가 `<main>`에 걸려 있어 폭을 직접 줄이면 양옆 배경이 잘린다                   |
| 아래 시트           | 같은 최대 폭으로 아래 가운데                                                                         | 본문과 폭이 맞고 `sheet.tsx` 한 곳으로 4개가 해결된다                                                  |
| 다이얼로그          | 그대로                                                                                               | 이미 320~360px 고정 폭이다                                                                             |
| 제외 화면           | 온보딩 가이드, 세션·소셜룸, 개발용 화면                                                              | 온보딩은 세션 목업 전체 화면이고 화면 폭 절반으로 탭 방향을 판정한다                                   |
| Figma               | `5. Tablet (V2)`에 최대 폭 기준 8프레임(홈 세로·가로, 기록 월간 가로, D-Day 시트 가로 × 라이트·다크) | 이 화면들은 라이트·다크가 모두 있다                                                                    |

## 변경

### `apps/web/src/index.css`

- `@custom-variant regular (@media ((width >= 37.5rem) and (not ((orientation: landscape) and (height < 30rem)))));` 형태로 정의한다. 정확한 식은 빌드 CSS가 지금의 `sm:not-landscape-compact:`와 같아지도록 맞춘다.
- 페이지 폭 유틸리티(이름 예: `page-column`)를 하나 둔다. 태블릿에서 좌우 여백을 `max(기존 여백, (100% - 40rem) / 2)`로, 큰 태블릿에서 45rem 기준으로 계산한다. 폰에서는 효과가 없다.

### 교체와 적용

- 세션·소셜룸 51곳의 `sm:not-landscape-compact:`를 `regular:`로 바꾼다.
- 화면 15개 파일의 `<main>` 17곳에 페이지 폭 유틸리티를 붙인다: HomeTabPage, SocialHomePage, RecordsPage, RankingPage, SettingsPage, ResultPage, TimelapsesPage, TimelapseSettingsPage, PlannerPage, ManualRecordPage, ProfilePage(3곳), RankingRecordsPage, InviteCodeJoinPage, InviteCodeSharePage, LicensesPage, LegalDocumentScreen, GoogleFormPage.
- `components/ui/sheet.tsx` bottom 변형에 태블릿 최대 폭과 가운데 정렬을 넣는다.
- `TimelapseShareDialog.tsx`의 아래 시트 영역도 같게 맞춘다.

## 테스트

- `customVariantsCss.test.ts`를 `regular:`로 바꾸고, 페이지 폭 유틸리티가 유효한 미디어 쿼리로 나오는지 추가한다.
- 클래스 문자열을 단언하는 기존 테스트는 값만 맞춘다.
- Playwright로 402×874, 874×402, 820×1180, 1180×820, 1376×1032에서 각 화면 콘텐츠 폭(640/720), 시트 폭, 폰 화면이 `dev`와 같은지 측정한다. 결과 화면은 스크롤과 색종이 효과를 따로 본다.

## 범위 밖

- 기록 달력 2분할, 홈 다열 카드처럼 화면마다 따로 만드는 넓은 화면 배치(PC 확장 때).
- 과목 UI 개편(BY-939), 저장소 전체 px 표기 정리(BY-938).
