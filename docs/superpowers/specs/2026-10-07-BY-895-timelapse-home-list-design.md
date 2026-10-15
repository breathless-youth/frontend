# BY-895 홈 최근 타임랩스 목록 설계

- 티켓: BY-895 (BY-888에서 분할, 상위 BY-822, 선행 BY-894, 후속 BY-896·BY-889)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §6
- 시안: Figma V2 `YcyImcuVORDbBneii41Byh` S9-2 `홈 · 최근 타임랩스` 5989:8016, `홈 · 최근 타임랩스 없음` 6021:7538
- 브랜치: `feature/BY-895-timelapse-home-list` (base `dev`)

## 목표

홈 맨 아래에서 기기에 보관 중인 타임랩스를 세로 카드의 가로 목록으로 보여준다.

## 사용자 결정 (2026-10-07)

| 항목               | 결정                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 카드 내용          | 정지 썸네일. 재생은 카드를 눌러 여는 공유 다이얼로그(BY-889)에서 한다      |
| 썸네일 사진        | 촬영한 사진 중 가운데 한 장                                                |
| `더보기`           | 버튼과 `/timelapses` 이동은 이번에 만들고, 라우트와 화면은 BY-896이 붙인다 |
| 카드 누르기        | BY-889 전까지 아무 동작도 하지 않는다. 버튼이 아닌 일반 요소로 둔다        |
| 기한 지난 타임랩스 | 홈을 열 때도 7일·7개 정리(`sweep`)를 돌린다                                |
| 불러오는 중·실패   | 섹션을 그리지 않는다                                                       |
| 썸네일 대체 텍스트 | 장식(`alt=""`). 카드 글자(날짜·순공)를 스크린리더가 읽는다                 |

## 저장소 (`features/timelapse/timelapseStore.ts`)

- `middlePhoto(startedAtMs): Promise<ArrayBuffer | null>`를 더한다.
- 그 세션 사진 범위를 `count`로 센 뒤 커서를 `advance(Math.floor(count / 2))`로 가운데까지 옮겨 한 장만 읽는다. 사진이 없으면 null이다.
- `listPhotos`는 세션 사진 전체(최대 360장, 약 15MB)를 읽어 썸네일 한 장에는 쓰지 않는다.

## 화면 (`features/timelapse/RecentTimelapses.tsx`)

- `HomeTabPage`의 `HomeContent`가 `VITE_TIMELAPSE=on`일 때 초대 카드 다음에 렌더한다.
- 목록 쿼리 `["timelapse", "recent"]`는 `sweep(Date.now())` 뒤 `listReady()`를 부른다. 기본 `staleTime`이라 홈 탭으로 돌아올 때(`refetchOnWindowFocus`) 다시 읽어 방금 끝낸 세션도 들어온다.
- 썸네일 쿼리 `["timelapse", startedAtMs, "thumb"]`는 `middlePhoto`를 data URL로 바꿔 돌려주고 `staleTime: Infinity`다. ready 타임랩스의 사진은 바뀌지 않는다.
- 날짜 라벨의 기준 시각은 렌더 중 `Date.now()` 대신 목록 쿼리의 `dataUpdatedAt`을 쓴다(React Compiler 순수성 규칙).
- 제목 `최근 타임랩스`는 18px Bold `text-foreground`, 오른쪽 `더보기 >`는 14px Regular `text-muted-foreground`이고 터치 영역은 44px이다.
- `더보기`는 플래너·가이드와 같은 `slideNavigate("forward", …)` 패턴으로 `/timelapses`에 간다. 현재 쿼리 문자열을 이어 붙이고 이중 탭을 막는다.
- 목록은 `ul` 가로 스크롤(`overflow-x-auto`, `snap-x`)이고 카드 간격 10px, 화면 오른쪽 끝까지 붙는다. 스크롤바는 숨긴다.
- 보관 중인 타임랩스가 없으면 흰 카드(모서리 20px, 그림자)에 `공부를 완료하고 공부한 모습을 공유해보세요`(14px `text-muted-foreground`, 가운데)를 보여주고 `더보기`를 숨긴다.

## 카드

- 144×256, 모서리 14px, 검은 바탕.
- 썸네일은 썸네일 쿼리에서 JPEG 바이트를 data URL로 바꿔 `<img>`로 그린다. 한 장에 수십 KB라 7장이어도 작고, Blob URL과 달리 해제할 것이 없어 effect에서 state를 바꾸지 않아도 된다.
- 9:16은 사진을 `object-cover`로 채운다.
- 16:9는 같은 사진을 `object-cover`·흐림(시안 레이어 흐림 18)·25% 어둡게로 배경에 깔고, 원본은 `object-contain`으로 가운데 둔다. 기기 웹뷰가 화면 회전 뒤 다시 계산하지 않았던 CSS `aspect-ratio`는 쓰지 않는다.
- 아래쪽 120px에 투명→검정 70% 그라디언트를 깔고, 왼쪽 아래(12px 안쪽)에 날짜(16px Bold 흰색)와 `순공 N시간 M분`(13px Regular 흰색 85%)을 넣는다.
- 날짜는 오늘이면 `오늘`, 어제면 `어제`, 그 밖에는 `M월 D일`이다. 순공은 `toKoreanDurationLength(summary.focusSec)`다.
- 오버레이(D-Day·워터마크 등)는 카드에 그리지 않는다. 시안 카드에도 없다.

## 문서

- ADR 0013 "결정"의 보관 줄에 홈을 열 때도 지난 것을 지운다고 더한다.

## 테스트

- 저장소: `middlePhoto`가 가운데 사진을 돌려준다, 사진이 없으면 null이다.
- `RecentTimelapses`(fake-indexeddb 실제 저장소 주입):
  - 최신순 카드와 `오늘`·`어제`·`M월 D일` 라벨, 순공 문구
  - 16:9 카드에 흐림 배경 사진이 하나 더 있다
  - 보관 중인 타임랩스가 없으면 안내 문구가 보이고 `더보기`가 없다
  - 기한 지난 타임랩스는 보이지 않는다
  - `더보기`를 누르면 `/timelapses`로 간다
- `HomeTabPage`: 플래그가 꺼져 있으면 섹션이 없고, 켜져 있으면 초대 카드 다음에 있다.

## 범위 밖

- 전체 목록 화면과 삭제(BY-896), 카드 누르기와 공유 다이얼로그(BY-889).
