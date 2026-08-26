# BY-420 공부 세션 중 화면 개선 — 설계

- 티켓: [BY-420](https://breathless-youth.atlassian.net/browse/BY-420) `[FE] 공부 세션 중의 화면 개선` (버그)
- 브랜치: `fix/BY-420-session-screen-cleanup` (base `dev`)
- 작성: 2026-08-25

## 문제

1. **카메라 프리뷰 목업 노출** — 싱글룸 세션 시작 직후, 카메라 스트림이 뜨기 전에
   사선 밴드와 `[ 전 면 카 메 라 프 리 뷰 ]` 라벨(개발용 목업 서피스)이 잠깐 사용자에게
   노출된다. 카메라 전환 중에도 같은 깜빡임이 있다. 소셜룸에서는 관측되지 않는다.
2. **스트림 일시정지/재개 버튼 노출** — 싱글룸·소셜룸 모두에서 세션 영상 위에 iOS
   네이티브 미디어 컨트롤(중앙 ⏸/▶ 원형 버튼)이 잠깐 떴다 사라진다. 소셜룸 상대 영상에서
   관측된 스크린샷 기준이며, 앱이 그리는 버튼이 아니다.

## 원인

1. `CameraPreviewSurface`는 `isRunning`이 false인 동안 목업 브랜치를 렌더한다.
   세션 화면은 카메라 어댑터가 스트림을 여는 비동기 구간(약 1초)보다 먼저 마운트되므로
   그 구간 동안 목업이 그대로 보인다. 카메라 전환 중에도 `isRunning`이 잠깐 false가 되어
   `<video>`가 언마운트됐다가 다시 마운트된다.
2. 세션 영상 4곳(싱글룸 프리뷰, 소셜룸 셀프뷰, 상대 영상, 카메라 켜기 모달 미리보기)이
   전부 `autoPlay` 속성에만 의존하고 프로그램적으로 `play()`를 호출하지 않는다.
   iOS 저전력 모드에서는 `autoplay` 속성이 무시되어 영상이 재생 대기 상태로 시작하고,
   그때 iOS가 네이티브 재생/일시정지 오버레이를 띄운다. 재생이 시작되면 사라지므로
   "잠깐 떴다 사라진다"는 관측과 일치한다(관측 기기의 배터리 표시가 저전력 모드였다).
   소셜룸에서는 화면 탭이 영상 엘리먼트에 직접 닿는 것도 컨트롤을 띄우는 별도 트리거다
   (싱글룸은 심플 모드 전환 버튼이 전체 화면을 덮어 탭이 영상에 닿지 않는다).

## 수정

### 1. 목업 브랜치 삭제 + `<video>` 상시 마운트

`CameraPreviewSurface`에서 `isRunning` 분기와 목업 브랜치(사선 밴드 + 라벨)를 삭제하고
`<video>`를 항상 렌더한다. 스트림이 없는 동안은 기존 배경색(`--session-camera-base`)만
보인다. 권한 거부·기기 점유로 카메라를 못 여는 상태에서도 민무늬 어두운 배경이 된다
(2026-08-25 승인된 트레이드오프).

부수 효과: 카메라 전환 중 `<video>` 언마운트로 생기던 `videoRef.current === null` 구간이
사라져 추론 프레임 공백이 줄어든다. `isRunning` prop은 사용처가 없어지면 제거한다.

### 2. 네이티브 미디어 컨트롤 제거 — 핵심은 `autoplay` 속성 제거

**확정된 원인(2026-08-25 실기기 검증)**: iOS 저전력 모드는 `autoplay` 속성이 달린 영상
위에 네이티브 재생/일시정지 컨트롤을 강제로 띄운다. WebKit이 의도한 동작이며 페이지
CSS·JS로는 숨길 수 없다(WebKit 버그 219889, Won't Fix — 닫힌 UA 섀도 루트).
영상을 `:paused`에서 투명하게 하는 마스크로도 숨겨지지 않는 것을 실기기에서 확인했다.

**해결**: 세션 영상 4곳에서 `autoplay` 속성을 제거해 컨트롤 발동 조건 자체를 없애고,
재생 시작을 전적으로 코드가 맡는다. 방어는 다음 조합이며 서로 한 세트다.

| 수정                               | 역할                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoplay` 속성 제거               | 저전력 모드 강제 컨트롤의 발동 조건 제거. **핵심 수정**                                                                                                    |
| `startVideoPlayback` 킥            | `srcObject` 부착 직후 `play()`를 직접 호출, 실패는 조용히 삼킨다                                                                                           |
| `VIDEO_PLAYBACK_KICK_PROPS`        | `loadedmetadata`·`suspend`·`pause` 신호마다 재생을 다시 건다 — 첫 호출 거부·중간 정지에 대비. 코드가 `pause()`를 부르는 곳이 없어 무조건 재개해도 안전하다 |
| `pointer-events-none`              | 탭이 영상에 닿지 않게 해 탭 트리거 컨트롤을 차단. 탭은 아래 레이어로 통과한다                                                                              |
| `:paused` 투명화 (`session-video`) | 재생 대기 중 영상 프레임 깜빡임 방어. 저전력 모드 강제 컨트롤은 이것으로 숨겨지지 않는다(실기기 확인)                                                      |
| WebKit 컨트롤 CSS                  | `::-webkit-media-controls` 계열 숨김 — 구형 경로 잔여 방어                                                                                                 |

`play()`는 jsdom(테스트 환경)이 미구현이라 던질 수 있으므로 호출을 감싸 실패를 무시한다.
소셜룸의 "화면 아무 곳 탭 → 컨트롤 바 복귀" 동작은 탭이 영상 아래 타일/메인으로 통과해
그대로 유지된다.

## 영향 파일

- `apps/web/src/features/study-session/components/CameraPreviewSurface.tsx` — 목업 삭제,
  video 상시 마운트, `isRunning` prop 제거, play() 호출, `pointer-events-none`
- `apps/web/src/routes/RoomPage.tsx` — `isRunning` prop 전달 제거
- `apps/web/src/features/live-room/LiveRoomSession.tsx` — 셀프뷰 play() 호출,
  `pointer-events-none`
- `apps/web/src/features/live-room/components/RemoteVideo.tsx` — play() 호출,
  `pointer-events-none`
- `apps/web/src/features/live-room/components/ClonedTrackPreview.tsx` — play() 호출,
  `pointer-events-none`
- `apps/web/src/index.css` — WebKit 미디어 컨트롤 숨김 규칙
- 관련 테스트: `CameraPreviewSurface.test.tsx`(목업 케이스 제거·상시 마운트 검증),
  RoomPage·LiveRoom 테스트 중 목업/`isRunning`을 참조하는 케이스

## 테스트

- `CameraPreviewSurface`: 스트림이 없어도 `<video>`가 마운트된다 / 목업 라벨이 렌더되지
  않는다 / `srcObject` 부착 시 `play()`가 호출된다 / 기존 미러링·object-fit·`hidden` 계약 유지
- `startVideoPlayback` 단위 테스트: `play()`의 Promise 거부·동기 예외·Promise 미반환이
  모두 호출부로 전파되지 않는다
- `RemoteVideo`·`ClonedTrackPreview`·소셜룸 셀프뷰: `play()` 호출과 `pointer-events-none`
  클래스 존재
- 소셜룸 탭 상호작용(컨트롤 바 복귀)이 깨지지 않는지 기존 테스트로 확인. 탭이 영상 위
  좌표에서 아래 레이어로 통과하는 히트테스팅은 jsdom에 레이아웃이 없어 자동 검증이
  불가능하다 — 실기기 검증 항목으로 대체한다

## 실기기 검증

Expo Go 실기기에서 저전력 모드를 켠 상태로 싱글룸·소셜룸에 진입해 두 증상이 사라졌는지
확인한다. 저전력 모드를 꺼도 회귀가 없는지 함께 본다. 소셜룸에서 상대/셀프 영상 위
좌표를 직접 탭해 컨트롤 바 복귀가 동작하는지도 확인한다(pointer-events 통과의 실기기
검증 — jsdom 자동 테스트 불가 항목).

**검증 결과 (2026-08-25, iOS 실기기 · cloudflared 터널 경유)**

- 목업 노출: 세션 시작 시 목업 화면이 더 이상 보이지 않음 — 통과
- 영상 탭 통과: 영상 위 탭이 컨트롤 바 복귀로 전달되고, 네이티브 버튼을 눌러도 스트림이
  멈추지 않음 — 통과
- 저전력 모드 회귀 없음 — 통과
- 네이티브 컨트롤: `play()` 킥·재시도·`:paused` 마스크만으로는 저전력 모드에서 1~2초
  깜빡임이 남았고, `autoplay` 속성 제거 후 완전히 사라짐 — 통과 (재생도 정상)
