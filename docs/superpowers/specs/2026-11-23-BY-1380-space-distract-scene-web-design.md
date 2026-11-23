# BY-1380 공간 비집중 장면 웹 설계

- Jira: BY-1380 (상위 BY-1377)
- 관련: infra BY-1379(업로드 스크립트와 매니페스트 v2, infra#26 머지), .ai BY-1378(위키 명세와 ADR)
- 날짜: 2026-11-23

## 배경

반복 영상 공간은 공부하는 내내 같은 화면과 반복 소리만 냈다. 딴짓에 반응하는 공간은 감독관 전용 재생기로만 만들 수 있었다. BY-1379로 업로드 스크립트가 비집중 장면 재료와 매니페스트 v2를 올리게 됐다. 이번에 웹이 매니페스트 v2를 읽고, 딴짓이 이어지면 비집중 장면으로 바꾸고, 다시 집중하면 돌아오게 한다.

## 결정 사항

| # | 항목 | 결정 |
|---|---|---|
| 접근 | 구조 | 지금 부품을 넓혀 쓴다. 매니페스트가 v2를 읽고, 감독관 시간 계산이 시간을 인자로 받고, `LoopVideoSpace` 위에 비집중 층을 겹치고, 감독관 소리 재생기를 소리 주소를 받게 일반화한다 |
| H1 | 비집중 파일 받기 | 딴짓이 시작될 때 받기 시작한다. 바뀌는 순간까지 영상을 다 받지 못했으면 비집중 포스터를 먼저 보인다 |
| H2 | 장면 전환 | 0.6초 동안 겹쳐 바꾼다 |
| H3 | 반복 소리 교체(`own`) | 두 반복 소리를 1초 동안 겹쳐 바꾼다 |
| H4 | 반복 소리 끄기(`none`) | 집중 반복 소리를 1초 동안 줄여 끄고, 돌아오면 다시 키운다 |
| H5 | 예고 소리 | 장면이 바뀌는 순간에 끝나도록 시작한다. 그 전에 다시 집중하면 서서히 줄여 끈다. 아직 받지 못했으면 건너뛴다 |
| H6 | 신호 소리 | 비집중 장면에 들어서는 순간 한 번 낸다. 돌아올 때는 내지 않는다 |
| H7 | 시간 계산 | `useWatcherPresence`가 비집중까지 시간, 돌아오기 시간, 예고 길이를 인자로 받는다. 감독관은 지금 값(9초, 3초, 7초)을 넘긴다 |
| H8 | 소리 재생기 | `watcherSound`를 소리 주소를 받게 일반화해 감독관과 비집중 장면이 함께 쓴다 |
| H9 | 음량 | 비집중 장면 소리도 "공간 음량"을 따른다 |
| H10 | 계측 | `space_distract_scene_entered`(`item_code`, `trigger`)와 `space_distract_scene_left`(`item_code`, `duration_sec`). 비집중 장면이 있는 공간에서만 보낸다 |
| H11 | 동작 줄이기 | 비집중 장면도 포스터나 그림으로 보이고, 겹쳐 바꾸지 않고 바로 바꾼다 |

## 매니페스트 읽기

`SpaceScenes`는 아래 모양이 된다.

```ts
interface SpaceScenes {
  readonly timing: { readonly distractAfterMs: number; readonly returnAfterMs: number };
  readonly focus: { readonly loopSound: boolean };
  readonly distract: DistractScene | null;
}
interface DistractScene {
  readonly visual: "video" | "image" | null;
  readonly loop: "own" | "keep" | "none";
  readonly cue: boolean;
  readonly approach: boolean;
}
```

- v1은 지금처럼 읽고, `timing`은 기본값(9초, 3초), `distract`는 `null`이다.
- v2는 `timing`, `focus`, `distract`의 필드를 모두 확인한다. 하나라도 형식이 틀리면 소리 없는 집중 장면(`SILENT_SCENES`)으로 본다.
- v2의 `distractAfterSec`은 3~60, `returnAfterSec`은 1~30 정수만 받는다. 스크립트와 같은 범위다.
- 모르는 필드는 무시한다. 3단계에서 필드가 늘어도 v2 웹이 깨지지 않는다.
- 1, 2가 아닌 버전은 지금처럼 소리 없는 집중 장면으로 본다.
- 받지 못했을 때의 규칙(5xx는 캐시하지 않고 실패, 4xx와 깨진 JSON은 소리 없음)은 바꾸지 않는다.

## 파일 주소

`spaceFiles.ts`에 비집중 주소를 더한다.

| 함수 | 주소 |
|---|---|
| `distractVideoUrl(key, screen)` | `/spaces/<key>/distract/loop/<screen>.mp4` |
| `distractPosterUrl(key, screen)` | `/spaces/<key>/distract/poster/<screen>.webp` |
| `distractImageUrl(key, screen)` | `/spaces/<key>/distract/image/<screen>.webp` |
| `distractSoundUrl(key, name)` | `/spaces/<key>/distract/sound/<name>.m4a` (`loop`, `cue`, `approach`) |

## 언제 바뀌는가

- `useWatcherPresence(trigger, thresholds, options)`의 `options`에 `leaveMs`와 `approachLeadMs`를 더한다. 기본값은 지금 상수다.
- 비집중 장면은 `thresholds`를 모든 원인에 `distractAfterMs`로, `leaveMs`를 `returnAfterMs`로 넘긴다.
- `approachLeadMs`는 받은 예고 소리의 길이다. 아직 받지 못했으면 0을 넘겨 예고를 건너뛴다.
- `present`가 참이면 비집중 장면, 거짓이면 집중 장면이다. 일시정지는 지금처럼 집중으로 본다.
- 이 계산은 반복 영상 공간이면서 매니페스트에 비집중 장면이 있을 때만 돈다. 감독 공간은 지금처럼 따로 돈다.
- 카메라 없는 공부는 딴짓 판정이 나오지 않아 집중 장면만 보인다. 따로 막지 않는다.

## 화면

- `SpaceLayers.tsx`에 `DistractSpace`를 더하고, `RoomPage`가 `LoopVideoSpace` 위에 겹쳐 그린다.
- 딴짓이 시작되면 `DistractSpace`를 그린다. 영상이면 `preload="auto"`로 받고 멈춰 둔다.
- `present`가 되면 영상을 재생하고 0.6초 동안 불투명도를 0에서 1로 올린다. 돌아오면 0.6초 동안 내리고 끝나면 멈춘다.
- 영상이 아직 재생할 수 없으면 비집중 포스터를 먼저 보이고, 영상이 준비되면 바꾼다.
- 그림이면 `<img>`로 같은 방식으로 겹친다. `visual`이 `null`이면 화면은 바꾸지 않는다.
- 회전은 `useSpaceScreen()`으로 집중 장면과 같은 화면 파일을 고른다. 영상 위치는 `LoopVideoSpace`처럼 이어 간다.
- 화면이 숨으면 영상을 멈춘다.
- 동작 줄이기 설정이면 비집중 포스터나 그림을 쓰고, 불투명도 전환 없이 바로 바꾼다.
- 비집중 파일을 받지 못하면 Sentry에 남기고 화면은 집중 장면으로 둔다. 소리 전환은 그대로 한다.

## 소리

- 집중 반복 소리는 지금처럼 `useSpaceLoopSound`가 맡는다.
- `own`이면 비집중 반복 소리를 하나 더 만든다. `present`가 되면 집중 소리를 1초 동안 줄이고 비집중 소리를 1초 동안 키운다. 돌아오면 반대로 한다.
- `none`이면 `present` 동안 집중 소리를 1초 동안 줄여 끄고, 돌아오면 키운다.
- `keep`이면 반복 소리를 바꾸지 않는다.
- 비집중 반복 소리는 딴짓이 시작될 때 받기 시작한다.
- 신호·예고 소리는 일반화한 소리 재생기(지금 `watcherSound`)로 낸다. 감독관은 `approach`, `enter`, `exit` 주소를, 비집중 장면은 `approach`, `cue` 주소를 넘긴다.
- 예고 소리는 `approaching`이 참이 되면 튼다. `approaching`이 거짓이 되었는데 `present`가 아니면 서서히 줄여 끈다.
- 신호 소리는 `present`가 거짓에서 참이 되는 순간 한 번 낸다.
- 모든 비집중 소리는 공간 음량(`watcherLevel`)을 따르고, 화면이 숨으면 내지 않는다. iOS 무음 스위치 처리(무음 루프)도 지금 재생기의 방식을 쓴다.

## 계측

| 이벤트 | 보낼 때 | 속성 |
|---|---|---|
| `space_distract_scene_entered` | `present`가 거짓에서 참이 될 때 | `item_code`, `trigger`(AWAY, PHONE, DEVICE, SLEEP) |
| `space_distract_scene_left` | `present`가 참에서 거짓이 될 때, 또는 비집중 장면인 채로 세션이 끝날 때 | `item_code`, `duration_sec` |

- 실제로 장면이 바뀔 때만 보낸다.
- 식별자나 자유 문자열은 싣지 않는다.
- 어느 공간을 골랐는지는 지금처럼 `timer_background_applied`의 `item_code`와 `study_session_ended`의 `space_item_code`로 본다.

## 시험

- `spaceManifest`: v2 정상값, 필드 누락, 범위 밖 시간, 모르는 필드 무시, v1 기본 시간.
- `useWatcherPresence`: 새 인자로 비집중까지 시간, 돌아오기 시간, 예고 시작 시점이 바뀌고, 인자를 주지 않으면 지금과 같다.
- `DistractSpace`: 딴짓 시작 시 받기 시작, `present`에 맞춘 재생과 불투명도, 포스터 대체, 동작 줄이기, 숨은 화면.
- 소리: `own`, `keep`, `none`별로 반복 소리의 목표 음량, 예고 소리 시작과 끄기, 신호 소리 한 번.
- 감독관: 일반화한 소리 재생기로 바꾼 뒤에도 기존 시험이 그대로 통과한다.
- 계측: 장면이 실제로 바뀔 때만 이벤트가 한 번씩 나가고 `item_code`가 실린다.
- 실기기(iPhone)에서 staging 시험 공간(기내)으로 확인한다.

## 함께 고칠 것

- infra 런북 `space-generate.md` 10절의 "두 화면은 섞지 않고 바로 잘라 붙여 바뀐다"를 "0.6초 동안 겹쳐 바뀐다"로 고친다. 이 PR과 별도로 infra에 작은 문서 PR을 올린다.

## 범위 밖

- 집중으로 돌아올 때의 신호 소리, 장면 사이 연결 영상, 감독 공간을 v2로 옮기는 일은 3단계에서 한다.
- 이미지 공간과 감독 공간의 비집중 장면은 다루지 않는다.
