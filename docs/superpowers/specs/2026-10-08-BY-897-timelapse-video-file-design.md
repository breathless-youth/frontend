# BY-897 타임랩스 공유용 영상 파일 설계

- 티켓: BY-897 (BY-889에서 분할, 상위 BY-822, 후속 BY-898)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §6·§8, "영상 파일 만들기 (FE 제안)"
- 브랜치: `feature/BY-897-timelapse-video-file` (base `dev`)

## 목표

타임랩스를 공유·저장할 수 있는 mp4 파일로 한 번 만들어 기기에 보관한다. 화면의 재생기와 같은 함수로 그려 파일과 화면이 같다.

## 사용자 결정 (2026-10-08)

| 항목                | 결정                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 해상도              | 720×1280 (16:9는 1280×720). 저장된 사진의 긴 변 1280과 같다                                                                    |
| mp4 묶기            | `mediabunny` 새 의존성. 동적 import로 따로 묶는다                                                                              |
| 측정 이벤트         | 만들기 성공·실패를 Amplitude로 보낸다. 사진·영상 내용과 식별자는 싣지 않는다                                                   |
| 만드는 위치         | 메인 스레드. 결과 화면이 버벅이는 게 측정되면 워커로 옮긴다                                                                    |
| 시작 시점           | 결과 화면 카드에서 D-Day·연속일을 레코드에 남긴 직후                                                                           |
| 만드는 중 화면 이탈 | 앱의 세션 웹뷰는 문서가 닫혀 작업이 끊기고 저장하지 않는다. 브라우저처럼 같은 문서 안에서 화면을 옮기면 끝까지 만들어 보관한다 |
| 둘 다 안 되는 기기  | 실패로 끝낸다. 안내 문구는 BY-898에서 정한다                                                                                   |
| 영상 끝             | 마지막 장면을 붙잡지 않는다. 길이는 사진 수 ÷ 12초                                                                             |

## 방식 고르기

| 안                        | 판단                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| 메인 스레드 (채택)        | 문서에 이미 로드된 Pretendard와 `drawTimelapseFrame`을 그대로 쓴다. 녹화 폴백도 같은 캔버스로 된다 |
| 워커                      | 워커에는 문서 글꼴이 없어 따로 불러와야 하고, 녹화(`MediaRecorder`)는 워커에서 쓸 수 없다          |
| 영상을 레코드에 함께 저장 | 홈 목록의 `listReady()`가 매번 영상 7개(약 60MB)를 같이 읽는다                                     |

## 만들기 (`features/timelapse/timelapseVideo.ts`)

- `buildTimelapseVideo(startedAtMs, deps)`가 레코드와 사진을 저장소에서 직접 읽는다. 결과 화면이 아닌 곳(BY-898 홈 목록 다이얼로그)에서도 부를 수 있다.
- 오버레이는 레코드의 `settings.info`, `overlayTextFor(record, { ddayLabel: record.ddayLabel ?? null, streakDays: record.streakDays ?? null })`, `flowSegmentsFor(record)`로 만든다. 재생기와 같은 값이다.
- 그리기 전에 `document.fonts.load`로 오버레이 글자를 받아 둔다. 실패해도 시스템 글꼴로 계속 만든다.
- 화면에 붙이지 않은 캔버스(`canvasSizeFor`와 같은 비율, 짧은 변 720)에 사진 한 장씩 `drawTimelapseFrame`으로 그린다. `progress`는 재생기와 같이 `i / max(1, n - 1)`이다.
- 사진은 한 장씩 디코드하고 그린 뒤 바로 `close()`한다. 디코드에 실패한 장은 재생기처럼 건너뛴다. 모두 실패하면 실패로 끝낸다.
- 진행률(0~1)은 장면 하나를 넣을 때마다 `onProgress`로 알린다.

### 인코딩 경로

1. `canEncodeVideo("avc", { width, height, bitrate })`가 참이면 WebCodecs 경로다.
   - mediabunny `Output` + `Mp4OutputFormat({ fastStart: "in-memory" })` + `BufferTarget`, `CanvasSource(canvas, { codec: "avc", quality: new Quality({ bitrate: 2_500_000 }) })` (`bitrate` 옵션은 1.61에서 deprecated).
   - 장면마다 `await source.add(i / 12, 1 / 12)`로 인코더 대기를 지킨다. 실시간보다 빠르다.
2. 아니면 `MediaRecorder.isTypeSupported("video/mp4")`를 확인해 녹화 경로로 간다.
   - `canvas.captureStream(0)` 트랙에 장면을 그릴 때마다 `requestFrame()`을 부르고 1/12초씩 기다린다. 30초 영상이면 30초 걸린다.
   - iOS 15.1~16.3(WebCodecs 인코더 없음)이 이 경로를 탄다.
3. 둘 다 안 되면 `unsupported`로 실패한다.

- 비트레이트 2.5Mbps, 12fps. 30초 영상이 약 9MB로 명세 추정(5~10MB) 안이다.
- 소리 트랙은 넣지 않는다.

## 보관 (`timelapseStore.ts`)

- DB 버전을 2로 올리고 `videos` 저장소(키 `startedAtMs`)를 만든다. `upgrade(db, oldVersion)`에서 `oldVersion < 1`이면 기존 두 저장소를, `oldVersion < 2`면 `videos`를 만든다. 기존 사진과 레코드는 그대로 남는다.
- 값은 `{ startedAtMs, bytes: ArrayBuffer, mimeType }`이다. 사진과 같은 이유(옛 iOS WebKit의 IndexedDB Blob 유실, jsdom 테스트)로 Blob이 아니라 ArrayBuffer로 둔다.
- `putVideo(video)`, `getVideo(startedAtMs)`를 더한다. `putVideo`는 목록에 올린(ready) 기록이 있을 때만 넣는다. 만드는 동안 사용자가 그 타임랩스를 지웠으면 영상만 남지 않게 한다.
- `sweep`·`remove`가 레코드와 사진을 지울 때 영상도 같은 트랜잭션에서 지운다. 보관 기한(7일·7개)이 사진과 같아진다. `discard`와 `finalize`는 촬영 중 기록만 다루는데 영상은 ready 기록에만 생기므로 고치지 않는다.

## 조회와 시작

- `timelapseVideoQuery(startedAtMs, store)` (`timelapseQueries.ts`)
  - 키 `["timelapse", startedAtMs, "video"]`, `staleTime: Infinity`.
  - `queryFn`은 `getVideo`가 있으면 Blob으로 돌려주고, 없으면 만들어 `putVideo` 뒤 돌려준다.
  - 같은 키로 동시에 요청하면 TanStack Query가 한 번만 실행한다.
  - 진행률은 `["timelapse", startedAtMs, "video-progress"]`에 `setQueryData`로 올린다. BY-898 다이얼로그가 이 키를 읽는다.
  - 전체 목록 삭제의 `removeQueries({ queryKey: ["timelapse", startedAtMs] })`가 두 키를 함께 치운다.
- `ResultTimelapseCard`
  - D-Day·연속일 조회가 모두 끝나면(성공이든 실패든, 신원이 없으면 바로) `annotate`를 기다린 뒤 `prefetchQuery(timelapseVideoQuery(...))`를 부른다. 영상에 그날 D-Day가 들어가야 하기 때문이다.
  - `annotate`가 실패해도 영상은 만든다. 그 값이 빠질 뿐이다.
  - 앱은 세션 웹뷰 문서가 닫혀 작업이 끊기고 저장하지 않는다. 저장 전에 끊기므로 반쯤 만든 파일은 남지 않는다.
  - 브라우저처럼 같은 문서 안에서 화면을 옮기면 끝까지 만들어 보관한다. 그사이 지운 타임랩스는 `putVideo`가 막는다.

## 측정 (`lib/amplitude.ts`)

- `timelapse_video_created`: `method`(`webcodecs`·`recorder`), `duration_ms`, `bytes`, `frames`, `aspect`
- `timelapse_video_failed`: `method`(`webcodecs`·`recorder`·`none`), `stage`(`unsupported`·`decode`·`encode`·`store`)
- 플랫폼은 SDK의 `os_name`으로 가른다. 사진·영상 내용과 식별자는 싣지 않는다.

## 문서

- ADR 0013 "결정"에 공유용 영상 파일도 기기 안에만 두고 사진과 같은 기한으로 지운다고 더한다.

## 테스트

- 저장소(fake-indexeddb)
  - `putVideo`·`getVideo` 왕복
  - `sweep`·`remove`가 영상도 지운다, 기록이 없거나 촬영 중이면 `putVideo`가 넣지 않는다
  - 버전 1로 만든 DB를 열면 레코드와 사진이 남고 `videos`가 생긴다
- 만들기(`buildTimelapseVideo`, 인코더·디코드·캔버스를 주입)
  - 사진마다 한 번씩 그리고 `progress`가 0에서 1로 간다
  - 오버레이에 레코드의 D-Day·연속일이 들어간다
  - 디코드에 실패한 장은 건너뛰고, 그린 장면은 모두 `close()`된다
  - WebCodecs가 되면 그 경로, 안 되고 mp4 녹화가 되면 녹화, 둘 다 안 되면 `unsupported`
  - 진행률이 장면마다 올라간다
- 조회: 저장된 영상이 있으면 만들지 않는다, 없으면 만들어 저장한다, 동시에 두 번 불러도 한 번 만든다
- `ResultTimelapseCard`: D-Day·연속일 기록 뒤 영상 만들기를 시작한다, 기록 전에는 시작하지 않는다
- 실제 인코딩 결과물(재생 가능 여부·크기·걸린 시간)은 iOS·Android 실기기와 Chromium에서 확인한다.

## 범위 밖

- 공유 다이얼로그와 진행률 표시 → BY-898
- 기기 저장·OS 공유 → BY-899
