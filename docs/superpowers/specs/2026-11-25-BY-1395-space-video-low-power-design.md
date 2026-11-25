# BY-1395 저전력 모드에서 공간 영상 재생 버튼 숨기기

## 문제

iOS 저전력 모드는 사용자 탭 없이 스크립트로 건 `play()`를 막는다. 반복 영상 공간(`LoopVideoSpace`)은 화면을 돌릴 때마다 `key={screen}`으로 영상 요소를 새로 만들고, 새 요소는 처음부터 보이는 상태라서 iOS가 막은 영상의 재생 버튼이 공간 가운데에 드러난다. 비집중 장면 영상(`DistractSpace`)도 드러나는 순간 `play()`가 막히면 같은 일이 생긴다.

감독관 영상(`WatcherBackground`)은 같은 상황에서 버튼이 보이지 않는다. 영상 요소를 `onPlaying`까지 `opacity-0`으로 두고, 아래에 `<picture>` 포스터를 깔아 두기 때문이다.

PR #633 리뷰에서 비집중 장면 파일을 받지 못하면 화면은 집중 장면인데 소리만 비집중 장면으로 바뀌는 문제도 나왔다(결정 1-A로 이 티켓에 포함).

## 결정

| 항목            | 결정                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| 탭 재생         | A. `kickVideoPlayback`이 `data-play-on-tap` 표시가 있는 멈춘 영상도 재생한다 |
| 1초 재시도      | 가. 공간 영상에는 넣지 않는다. 탭·화면 복귀·회전 때 다시 재생을 건다         |
| `pause` 때 숨김 | 가. `pause`가 오면 다시 투명하게 해 아래 포스터를 보인다                     |

## 설계

### 재생 전까지 투명한 공간 영상 (`SpaceLayers.tsx`)

- `LoopVideoSpace`와 `DistractSpace`의 영상 단계는 같은 화면용 포스터 `<img>`를 아래에 깔고 그 위에 영상을 둔다.
- 영상은 `playing`에서 보이고 `pause`에서 다시 투명해진다.
- 두 곳의 모양이 같아 파일 안 내부 컴포넌트 하나로 묶는다. `key={screen}`은 이 컴포넌트에 걸어 돌릴 때 포스터와 영상이 함께 바뀌고 보임 상태도 처음으로 돌아간다.
- 영상의 `poster` 속성은 빼고 아래 그림이 그 역할을 한다.
- `LoopVideoSpace`의 `onReady`는 포스터 `<img>`의 `onLoad`와 영상의 `onLoadedData`로 알린다. 지금의 `new Image()` effect는 지운다.
- 포스터 단계(동작 줄이기, 영상 오류 뒤)와 그림 공간은 지금과 같다.

### 탭하면 공간 영상도 다시 재생 (`videoPlayback.ts`)

- `kickVideoPlayback`은 `srcObject`가 있거나 `data-play-on-tap` 표시가 있는 멈춘 영상에 `play()`를 건다.
- `LoopVideoSpace` 영상은 늘 표시를 단다.
- `DistractSpace` 영상은 드러나 있는 동안(`shown`)에만 단다. 숨긴 채 받아 두는 영상은 재생하지 않는다.
- 감독관 영상은 표시를 달지 않아 지금과 같다.
- 회전 다시 그리기(`rotationRepaint`)도 같은 함수를 쓰므로 회전 뒤에도 공간 영상에 재생을 다시 건다.

### 비집중 파일을 받지 못하면 화면과 소리 모두 집중 장면 (`RoomPage.tsx`)

- `DistractSpace`에 `onUnavailable`을 더하고, 파일 오류에서 Sentry에 남긴 뒤 부른다.
- `RoomPage`는 `failedSpaceKey`처럼 비집중 장면이 실패한 공간 키를 기억한다.
- 그 공간이면 `useDistractScene`에 `assetKey: null`을 넘긴다. 비집중 장면이 없는 공간처럼 화면 층이 빠지고 반복 소리 크기는 1로 남으며 예고·신호 소리도 나지 않는다.
- 다른 공간을 고르면 키가 달라 다시 비집중 장면을 쓴다.

## 범위 밖

- 감독관 영상
- 저전력 모드 감지와 안내 UI

## 테스트

- `SpaceLayers.test.tsx`: 반복 영상과 비집중 영상이 `playing` 전에는 투명하고 아래 포스터가 보이며, `playing` 뒤 보이고 `pause` 뒤 다시 투명하다. `data-play-on-tap`은 반복 영상에 늘 있고 비집중 영상에는 드러난 동안만 있다.
- `videoPlayback` 테스트: 표시가 있는 멈춘 영상은 재생되고, 표시도 `srcObject`도 없는 영상은 재생되지 않는다.
- `RoomPage.space.test.tsx`: 비집중 영상 오류 뒤 비집중 층이 사라지고, 딴짓이 이어져도 집중 반복 소리 크기가 1로 남는다.
- 실기기: iPhone 13 mini 저전력 모드에서 세로·가로를 돌려 재생 버튼이 보이지 않고, 탭하면 영상이 움직인다.
