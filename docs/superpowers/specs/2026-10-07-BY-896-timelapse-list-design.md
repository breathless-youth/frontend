# BY-896 타임랩스 전체 목록과 삭제 설계

- 티켓: BY-896 (BY-888에서 분할, 상위 BY-822, 선행 BY-895, 후속 BY-889)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §5·§6
- 시안: Figma V2 `YcyImcuVORDbBneii41Byh` S9-4 `최근 타임랩스 · 전체` 6021:7863, `최근 타임랩스 · 삭제 확인` 6038:7631 (다크 6021:8351·6038:8009)
- 브랜치: `feature/BY-896-timelapse-list` (base `dev`)

## 목표

홈 `더보기`로 여는 화면에서 보관 중인 타임랩스 전체를 세로 목록으로 보고, 하나씩 확인을 거쳐 지운다.

## 사용자 결정 (2026-10-07)

| 항목                      | 결정                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| 빈 목록                   | 마지막 하나를 지우면 홈과 같은 안내 문구를 보여주고 화면에 머문다                        |
| 시각 표기                 | `10월 5일 (월) 18:23 – 21:03` (엔대시, 기록·결과 화면과 같음)                            |
| 줄 누르기                 | BY-889 전까지 아무 동작도 하지 않는다                                                    |
| 삭제 실패                 | 확인 창을 닫고 토스트 `삭제하지 못했어요`, 목록은 그대로                                 |
| 확인 창                   | 시안대로 이 화면 안에 만든다. 앱에 삭제 확인 창이 처음이라 공용 컴포넌트로 빼지 않는다   |
| 불러오는 중·실패          | 헤더와 안내 문구는 보이고 목록 자리는 비워 둔다                                          |
| 홈 `더보기` (2026-10-08)  | 보관 중인 타임랩스가 없어도 보인다. 빈 전체 목록으로 갈 수 있다                          |
| 확인 창 모양 (2026-10-08) | 시안이 아니라 앱의 다른 확인 창(카메라 켜기·세션 복구)과 같은 모양. `삭제`만 위험 색이다 |

## 공용 부분 (`features/timelapse/`)

- `recentTimelapsesQuery(store)`: 키 `["timelapse", "recent"]`, `sweep(Date.now())`는 실패해도 넘어가고 `listReady()`를 돌려준다. 홈 목록과 전체 목록이 같은 키와 같은 캐시를 쓴다(둘 다 홈 탭 웹뷰 안이다).
- `TimelapseThumb({ record, store, className })`: 썸네일 쿼리(`["timelapse", startedAtMs, "thumb"]`, `middlePhoto` → data URL, `staleTime: Infinity`)와 이미지를 그린다. 16:9는 흐린 배경 + 원본, 9:16은 채움이고 모든 `<img>`에 `amp-block sentry-block`을 붙인다.
- `RecentTimelapses`는 위 둘을 쓰도록 바꾸고 동작은 그대로다.

## 화면 (`routes/TimelapsesPage.tsx`)

- `VITE_TIMELAPSE=on`일 때 `/timelapses`를 lazy 라우트로 등록하고 `lib/nativeTabBar.ts`의 `FULL_SCREEN_PATHS`에 넣어 탭바를 숨긴다.
- `ScreenBackHeader title="최근 타임랩스"`. `onBack`은 플래너와 같은 판단으로, 앱 안에서 왔으면 `navigate(-1)`, 딥링크로 열렸으면 `/home`으로 replace한다(쿼리 유지).
- 배경과 여백은 설정형 하위 화면과 같다(`theme-soft-blue bg-soft-blue min-h-dvh`, 본문 `px-5`).
- 안내 `최근 7일 동안 최대 7개까지 기기 내에 보관돼요` 13px `text-muted-foreground`.
- 목록은 `ul` 세로, 간격 12px. 비면 홈과 같은 안내 카드(`공부를 완료하고 공부한 모습을 공유해보세요`).

## 목록 한 줄

- 흰 카드(`bg-muted`, 모서리 20px, 여백 12px, 가로 간격 14px). 왼쪽 `TimelapseThumb` 56×100, 모서리 10px.
- `순공 {toKoreanDurationLength(focusSec)}` 18px Bold `text-foreground`.
- `총 공부 {toKoreanDurationLength(studySec)} · 집중률 {rate}%` 14px `text-muted-foreground`. 집중률은 `studySec > 0 ? round(focusSec / studySec × 100) : 0`(영상 오버레이와 같은 계산).
- 오른쪽 아래 `M월 D일 (요일) HH:MM – HH:MM` 12px `text-muted-foreground`. 시작은 `startedAtMs`, 끝은 `summary.endedAtMs`, 기기 시간대.
- 오른쪽 위 휴지통(lucide `Trash2`, `text-feedback-danger`) 버튼은 44px 터치 영역, `aria-label` `{M월 D일 HH:MM} 타임랩스 삭제`.

## 삭제

- 휴지통을 누르면 `Dialog`로 확인 창을 연다. 모양은 `CameraOnConfirmDialog`와 같다(최대 너비 320px, `rounded-3xl`, 여백 22px, 버튼 높이 52px·`rounded-lg`·15px SemiBold). `DialogHeader` 안에 제목 `타임랩스 삭제`(18px Bold)와 본문 `정말 삭제하시겠어요?`(16px Medium)를 왼쪽 정렬로 두고, 버튼은 `DialogFooter`에 둔다. `취소`는 `bg-bg-layer-2`, `삭제`는 `bg-feedback-danger` 흰 글자다. 처음 포커스는 `취소`, Esc·바깥 누르기는 취소이고, 닫히면 누른 휴지통으로 포커스를 돌려준다(`useDialogFocusRestore`).
- `삭제`는 `useMutation`으로 `store.remove(startedAtMs)`를 부른다.
- 성공하면 `setQueryData(["timelapse", "recent"])`로 그 항목을 빼고, `removeQueries(["timelapse", startedAtMs])`로 그 타임랩스의 레코드·사진·썸네일 캐시를 지운다. 홈 목록도 같은 캐시라 바로 사라진다.
- 실패하면 확인 창을 닫고 토스트 `삭제하지 못했어요`를 띄운다.
- 지우는 중에는 `삭제` 버튼을 막아 두 번 지우지 않게 한다.

## 테스트

- 공용 쿼리: `sweep`이 실패해도 목록을 읽는다.
- `TimelapsesPage`(fake-indexeddb 실제 저장소):
  - 최신순 줄과 순공·총 공부·집중률·날짜 시각 문구
  - 휴지통 → 확인 창 → `삭제`면 줄이 사라지고 저장소에서도 지워진다
  - `취소`면 그대로다
  - 마지막을 지우면 안내 문구가 보인다
  - 삭제가 실패하면 토스트가 뜨고 줄이 남는다
  - 썸네일 이미지에 리플레이 차단 클래스가 있다
  - 뒤로 가기: 앱 안에서 왔으면 이전 화면, 딥링크면 `/home`
- `App` 라우트: 플래그가 꺼져 있으면 `/timelapses`가 없다.

## 범위 밖

- 줄을 눌러 여는 공유 다이얼로그(BY-889).
