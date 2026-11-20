# BY-1335 세션 공간 시트가 서버 목록을 읽기 설계

- Jira: BY-1335 (스토리 BY-1331 하위). 먼저 끝나야 하는 작업: 공간 감시 모드와 분류 하위 작업(backend·infra·.ai)
- 관련 명세: .ai `product/specs/BY-1331-공간-애셋.md`, `product/specs/BY-1306-세션-공간-작은-카메라-창.md`
- 날짜: 2026-11-20

## 왜

세션 공간 시트는 공간 목록을 앱 코드에 직접 넣어 두고 있어서, 공간 하나를 추가할 때마다 웹을 배포해야 한다. BY-1332~1334로 공간 파일 경로, 상품의 공간 정보, 업로드 스크립트, 감독관 상품 행이 준비됐다. 이 작업은 앱이 그 서버 목록을 읽고, 고른 공간을 서버에 저장해 기기를 바꿔도 이어지게 하고, 닫아 둔 영상 탭(BY-1320)을 다시 연다.

## 용어

| 말 | 뜻 |
|---|---|
| 공간 | 세션 화면 뒤에 까는 배경. 서버 카탈로그의 타이머 배경 상품, `내 사진`, `심플`이 있다 |
| 종류 (`assetType`) | `VIDEO` 또는 `IMAGE` |
| 영상 방식 (`videoMode`) | 영상 공간만 가진다. `LOOP`은 반복 영상 하나를 계속 돌리고, `WATCH`(감시)는 비집중이 이어지면 캐릭터가 들어와 지켜보다 다시 집중하면 나간다 |
| 감시 컨셉 | 감시 방식으로 그리는 공간 하나하나. 독서실 감독관이 첫 컨셉이다 |
| 분류 (`tags`) | 서버가 내려주는 화면 분류(자연, 카페 등). 공간 페이지의 섹션과 칩을 만든다. 감시는 분류가 아니라 영상 방식이다 |
| `전체` | 서버 분류가 아니라 앱이 만드는 보기. 거르지 않고 모든 섹션을 한꺼번에 보인다 |

## 결정 사항

| # | 질문 | 결정 |
|---|---|---|
| 1 | 세션은 공간 목록을 어떻게 받나 | 공간 기능에 작은 전용 조회를 둔다. HTTP 함수는 기존 `getShopItems`·`getDecorations`·`putTimerBackground`를 쓴다. 상점 기능 켜짐(`points=1`)과 상관없이 동작한다 |
| 2 | 기기 값과 서버 값이 다르면 | `내 사진`만 기기 우선이고 나머지는 서버 우선이다. 기기 값으로 먼저 그리고, 회원이면 서버 답이 온 뒤 맞춘다 |
| 3 | 감시를 무엇으로 알아보나 | 영상 공간의 `videoMode`(`LOOP`·`WATCH`)로 알아본다. 상품 코드나 분류는 보지 않는다 |
| 4 | 그 서버 작업은 어디서 | BY-1331 아래 새 하위 작업에서 한다. 이 작업을 막는다 |
| 5 | 반복 영상·그림 재생기 | 이번에 만든다 |
| 6 | 파일을 받지 못하면 | 영상은 포스터, 그다음 심플이다. 그림은 심플이다. 고른 값은 지우지 않고 Sentry에만 남긴다. 미리보기에서는 안내 문구를 보인다 |
| 7 | 무료 공간이 상점에 보이나 | 보이지 않는다. 공간 페이지에서만 고른다 |
| 8 | 서버 저장이 실패하면 | 바로 바꾸고, 실패하면 이전 공간으로 되돌리고 기존 실패 문구를 보인다 |
| 9 | 웹 배포물의 감독관 파일 | `public/spaces/`를 삭제하고 Vite 개발 서버에 `/spaces` 프록시를 둔다 |
| 10 | 분석 이벤트 | `kind`는 `simple`·`photo`·`space`다. `item_code`·`video_mode` 속성을 더한다 |
| 11 | 분류 | 서버 분류 테이블이 정한다. 앱에 분류 목록을 두지 않는다 |
| 11-1 | `감시` 칩과 섹션 | 영상 방식(`videoMode = WATCH`)으로 만든다. 서버 분류에 `WATCH`를 두지 않는다. 감시 공간이 많아지면 감시 공간에도 서버 분류를 붙여 감시 안을 다시 나눈다 |
| 11-2 | 이미지 탭의 `내 사진`·`심플` | 칩과 상관없이 늘 보인다. 서버 그림 공간이 생기면 분류 섹션이 뒤에 붙고, 그때부터 칩이 나타난다 |
| 11-3 | 영상 탭의 다른 분류 | 두 탭 모두 같은 규칙이다. 분류가 붙은 반복 영상이 있으면 그 분류의 섹션과 칩이 생긴다 |
| 12 | 기존 `tag` 칸과 앱 매핑표 | 처음부터 설계하는 것으로 보고 삭제한다. 응답은 `tags`만 쓴다 |
| 13 | 안 가진 공간 | 공간 페이지에는 가진 공간만 보인다 |
| 15 | 감시 장면 구성 | 들어오기(`enter`)·머무르기(`loop-b`)·나가기(`exit`)와 다가옴·들어옴·나감 소리는 반드시 있다. 머무르기 `loop-a`는 선택이다. 소리는 감시 대상이 사람만은 아니어서 공간마다 따로 둔다 |
| 16 | 새 영상 방식 | 감시에 넣기 애매한 형식(예: 평소엔 그림, 집중·비집중을 감지하면 반복 영상)은 분류가 아니라 `videoMode`의 새 값으로 만든다. 새 방식은 폴더 규칙·재생기·스크립트를 함께 정의할 때만 추가하고, 앱 배포가 한 번 필요하다 |
| 17 | 감시 장면 4벌 생성 | 이번에는 사람이 만든 기기·방향별 4벌을 그대로 올린다. 가로 한 벌로 스크립트가 4벌을 만드는 일은 다음 감시 컨셉을 만들 때 한다 |
| 14 | 카드 썸네일 비율 | 4:3을 유지한다. 세로(9:16)와 가로(16:9)의 중간이라 두 방향 모습을 비슷하게 짐작하게 한다. Figma 시안을 4:3으로 고친다 |

상점 배경 화면은 사용자가 따로 설계한다. 이번에는 응답 타입이 바뀌어 꼭 필요한 수정과 무료 상품 거르기만 하고, 그 화면의 UI와 분류 칩은 바꾸지 않는다.

## 서버 응답 (하위 작업이 만든다)

```jsonc
// GET /api/shop/items 의 공간 한 줄
{
  "id": 41, "code": "SPACE_PROCTOR", "category": "TIMER_BACKGROUND",
  "name": "독서실 감독관", "owned": true, "inUse": false,
  "price": null, "storeProductId": null, "unlock": null,
  "assetKey": "watcher/9c8d9f19", "assetType": "VIDEO", "videoMode": "WATCH",
  "tags": []                // 감시는 videoMode로 알아보므로 분류를 붙이지 않는다
}
// 반복 영상 예: "videoMode": "LOOP", "tags": [{ "code": "NATURE", "name": "자연" }]
// GET /api/decorations 의 timerBackground 에도 assetKey·assetType·videoMode 가 온다
// PUT /api/decorations/timer-background {itemId | null}: 안 가졌으면 409, 비회원이면 403 MEMBER_ONLY
```

앱 타입은 이 응답과 Swagger에 있는 필드만 쓴다.

## 앱 구조

| 단위 | 위치 | 하는 일 |
|---|---|---|
| 상품 타입 | `features/points/gateway/pointsApiTypes.ts`, `packages/types/src/mascotAppearance.ts` | `assetKey`·`assetType`·`videoMode`·`tags`를 더하고 `tag`를 뺀다 |
| 데이터 변환 | `features/points/gateway/fromApi.ts` | 얻는 방법이 없는 상품을 `{ type: "free" }`로 알아본다. 상점 목록에서는 무료를 거른다. `BACKGROUND_CATEGORY_BY_TAG`를 삭제한다 |
| 공간 조회 | `features/timer-background/spaceCatalogQuery.ts` (새 파일) | 타이머 배경이고, 가졌고, `assetKey`가 있고, 앱이 그릴 수 있는 상품만 고른다 |
| 파일 주소 | `features/timer-background/spaceFiles.ts` (새 파일) | `assetKey`와 화면 크기로 주소를 만든다 |
| 선택 값 | `features/timer-background/timerBackground.ts` | 선택 값 모양, 기기 저장, 옛 값 처리, `resolveSpace` |
| 그리기 | `features/timer-background/` 아래 `LoopVideoSpace`·`ImageSpace` (새 파일), `watcher/` | 반복 영상과 그림을 그린다. 감시 재생기는 `assetKey`를 받는다 |
| 공간 페이지 | `features/timer-background/components/SessionSpacePage.tsx` | 서버 공간, 내 사진, 심플을 타일로 보인다. 칩, 고르기, 계측 |
| 세션 화면 | `routes/RoomPage.tsx` | 처음 그릴 값, 서버 값 맞추기, 고를 때 저장과 되돌리기 |
| 웹 배포물 | `apps/web/public/spaces/`, `vite.config.ts`, `.github/workflows/deploy-web.yml`, `lib/__tests__/publicAssetHashes.test.ts` | 감독관 사본을 삭제하고 `/spaces` 프록시를 둔다. 배포 규칙과 해시 검사의 공간 부분을 정리한다 |

### 선택 값

```ts
type TimerBackgroundSelection =
  | { kind: "simple" }
  | { kind: "photo"; photoId: string }
  | {
      kind: "space";
      itemId: number;
      code: string;                 // 계측용. 그리는 방법은 고르지 않는다
      assetKey: string;
      assetType: "VIDEO" | "IMAGE";
      videoMode: "LOOP" | "WATCH" | null;
    };
```

- 기기 저장 키는 지금과 같은 `focusmakers.timerBackground`다.
- 예전에 저장된 `{ kind: "proctor" }`는 읽을 때 `심플`로 바꾸고 감시 파일 사본을 지운다. 영상 탭을 닫은 뒤로 지금도 같은 처리를 한다.
- `space` 값은 서버 공간을 그리는 데 필요한 것을 모두 들고 있어서, 서버 답이 오기 전에도 기기 값만으로 그릴 수 있다.

### 무엇을 그릴지

```ts
function resolveSpace(local, server /* undefined: 응답 전·실패·비회원 */) {
  if (local.kind === "photo" && photoExists(local.photoId)) return local;
  if (server === undefined) return local;
  if (server === null) return SIMPLE;
  return toSpaceSelection(server);
}
```

- 세션 화면은 기기 값으로 먼저 그린다.
- 회원이면 `GET /api/decorations`의 `timerBackground`가 온 뒤 이 규칙으로 한 번 맞춘다. 결과가 기기 값과 다르면 기기 값도 고친다.
- 서버가 알려 준 공간이 판매를 멈춘 공간이어도, 서버가 적용해 둔 값으로 주면 그대로 그린다(BY-1333 규칙: 적용해 둔 사람은 바꾸기 전까지 그대로 쓴다).
- 비회원은 서버에 묻지 않는다.

### 그리기

```tsx
function SpaceLayer({ space }) {
  if (space.assetType === "IMAGE") return <ImageSpace assetKey={space.assetKey} />;
  return space.videoMode === "WATCH"
    ? <WatchSpace assetKey={space.assetKey} />
    : <LoopVideoSpace assetKey={space.assetKey} />;
}
```

- 앱이 모르는 종류나 방식은 공간 조회에서 뺀다. 서버가 먼저 새 값을 넣어도 옛 앱이 깨진 타일을 보이지 않는다.
- `WatchSpace`는 지금의 `WatcherBackground`이고, 들어오기·머무르기·나가기와 소리 동작은 바꾸지 않는다.
- `loop-a`가 없는 감시 공간도 그린다. 감시 파일을 미리 받아 둘 때 `loop-a`가 403이면 "없음"으로 기록하고, 재생기는 머무르기를 `loop-b`만으로 반복한다. 서버 응답에는 장면 구성을 싣지 않는다.
- 앱이 모르는 영상 방식은 공간 조회에서 뺀다. 새 방식은 그 방식의 재생기와 섹션을 앱에 더할 때 보이기 시작한다.

### 파일 주소

| 공간 | 주소 |
|---|---|
| 반복 영상 | `/spaces/<assetKey>/loop/<화면>.mp4`, 포스터 `/spaces/<assetKey>/poster/<화면>.webp` |
| 그림 | `/spaces/<assetKey>/image/<화면>.webp` |
| 반복 영상·그림 타일 | `/spaces/<assetKey>/thumb.webp` (4:3) |
| 감시 | `/spaces/<assetKey>/{enter,exit,loop-a,loop-b}/<기기>_<방향>.mp4`, 포스터 `/spaces/<assetKey>/poster/<기기>_<방향>.jpg`, 소리 `/spaces/<assetKey>/sound/{approach,enter,exit}.m4a` |
| 감시 타일 | `/spaces/<assetKey>/poster/phone_portrait.jpg` |

- `<기기>`는 화면의 짧은 변이 태블릿 기준(`TABLET_SHORT_SIDE_PX`) 이상이면 `tablet`, 아니면 `phone`이다. 방향은 가로가 길면 `landscape`, 아니면 `portrait`다.
- 반복 영상과 그림은 PC 크기 화면(가로 1200px 이상이고 가로가 긴 화면)에서 `desktop`을 쓴다. 감시는 PC 파일이 없어 태블릿 가로를 쓴다.
- 반복 영상은 화면 크기가 바뀌면 다음에 그릴 때부터 새 파일을 쓴다. 감시는 지금처럼 다음 장면부터 새 방향을 쓴다.
- 공간 페이지의 미리보기도 실제 배경과 같은 규칙(창 전체 크기)으로 파일을 고른다. 세로와 가로 사본을 한꺼번에 받지 않고, 미리보기 칸에는 그 사본을 가운데 잘라(`object-cover`) 보인다. 그래서 미리보기에서 받은 파일을 적용할 때 그대로 다시 쓴다.
- 카드 썸네일은 4:3이다. 감시 카드는 폰 세로 포스터를 4:3 카드에 가운데 잘라 보인다.

## 동작 규칙

### 공간 페이지

- 대분류는 탭이다. 영상 탭에는 가진 영상 공간을, 이미지 탭에는 가진 그림 공간과 내 사진, `심플`을 보인다.
- 목록은 섹션(제목 + 2열 카드)으로 묶는다. Figma S1e(`11456:20145`) 구조를 따른다.
- 영상 탭 섹션은 `감시`(영상 방식이 `WATCH`인 공간)가 먼저이고, 그 뒤로 반복 영상에 붙은 서버 분류 섹션이 서버 순서대로 온다. 분류가 없는 반복 영상은 맨 아래 제목 없는 묶음이다.
- 이미지 탭 섹션은 `내 사진`, `심플`이 먼저이고, 그 뒤로 그림 공간에 붙은 서버 분류 섹션이 온다. 분류가 없는 그림 공간은 맨 아래 제목 없는 묶음이다.
- 한 공간에 분류가 여러 개면 그 분류 섹션마다 보인다.
- 칩은 `전체`와 그 탭에 있는 섹션의 이름이다. `전체`는 모든 섹션을 보이고, 다른 칩은 그 섹션만 남긴다. 영상 탭은 섹션이 하나여도 칩을 보인다(시안). 이미지 탭은 서버 분류 섹션이 하나 이상 있을 때만 칩을 보인다(시안에는 칩이 없다).
- 이미지 탭의 `내 사진`·`심플` 섹션은 어떤 칩을 골라도 보인다.
- 칩을 만드는 함수는 "지금 고른 범위 안의 공간에 붙은 분류를 모은다"는 모양으로 둔다. 감시 안을 다시 나누는 두 번째 칩 줄이 필요해지면 같은 함수를 감시 공간에 한 번 더 쓴다.
- 공간 목록을 받지 못하면 영상 탭은 비어 있다는 안내(`space.empty`)를, 이미지 탭은 내 사진과 심플만 보인다.
- 영상 탭을 연다. `VIDEO_SPACES_OPEN`과 "곧 만나볼 수 있어요" 안내를 삭제한다.
- 공간 이름은 서버가 언어에 맞춰 준 `name`을 쓴다. `내 사진`과 `심플`은 지금처럼 앱 문구를 쓴다.

### 고를 때

| 고른 것 | 회원 | 비회원 |
|---|---|---|
| 서버 공간 | 화면과 기기 값을 바로 바꾸고 `PUT {itemId}` | 화면과 기기 값만 바꾼다 |
| `심플` | 화면과 기기 값을 바로 바꾸고 `PUT null` | 화면과 기기 값만 바꾼다 |
| `내 사진` | 화면과 기기 값을 바로 바꾸고 `PUT null`. 사진은 보내지 않는다 | 화면과 기기 값만 바꾼다 |

- 회원의 `PUT`이 실패하면 이전 공간으로 되돌리고 `space.applyFailed`를 토스트로 보인다.
- 감시 공간을 고르면 지금처럼 그 기기에 맞는 감시 파일을 IndexedDB에 받아 두고, 다른 것을 고르면 지운다. 받아 둘 주소는 `assetKey`로 만든다.

### 그리다가 실패할 때

- 반복 영상을 받지 못하면 포스터를, 포스터도 받지 못하면 심플을 그린다.
- 그림을 받지 못하면 심플을 그린다.
- 감시는 지금의 재시도(1초 간격 3번) 뒤 빈 방 포스터 동작을 그대로 둔다.
- 기기와 서버의 선택 값은 그대로 두고, `reportHandled`로 Sentry에만 남긴다. 공부 중에는 토스트를 보이지 않는다.
- 공간 페이지의 미리보기에서 실패하면 미리보기 안에 짧은 안내 문구를 보인다.

### 접근성과 기기 부담

- 동작 줄이기 설정이면 반복 영상은 포스터만 보인다. 감시는 지금 동작(캐릭터가 들어오지 않는다)을 그대로 둔다.
- 화면이 숨으면 반복 영상을 멈추고, 다시 보이면 이어서 재생한다.
- 배경 영상은 소리가 없고 `aria-hidden`이다.

### 계측

| 이벤트 | 바뀌는 것 |
|---|---|
| `timer_background_applied` | `kind`: `simple`·`photo`·`space`. `space`이면 `item_code`, `video_mode`를 더한다. `category`는 고른 칩 코드다 |
| `session_space_preview_opened` | `kind`를 같은 값으로 바꾸고 `item_code`를 더한다 |
| `study_session_ended` | `space_kind`를 같은 값으로 바꾸고 `space_item_code`, `space_video_mode`를 더한다 |

- `timer_background_applied`는 회원은 `PUT`이 성공한 뒤, 비회원은 기기에 저장한 뒤 보낸다.
- 이미 적용 중인 공간을 다시 누르거나, 서버 값으로 맞출 때는 보내지 않는다.
- 이렇게 하면 `item_code`로 묶어 많이 적용된 공간 순위를 볼 수 있다.

## 웹 배포물 정리

- `apps/web/public/spaces/`를 삭제한다. 운영과 staging은 CloudFront가 `/spaces/*`를 공간 버킷으로 보내서 이미 이 사본을 쓰지 않는다.
- Vite 개발 서버에 `/spaces` 프록시를 두고 대상은 `https://web-dev.focusmakers.app`로 한다.
- 배포 워크플로의 `public/spaces` 캐시 규칙과 `publicAssetHashes.test.ts`의 공간 검사를 삭제한다.
- infra 런북과 selftest가 frontend의 감독관 폴더를 쓰는 부분은 서버 하위 작업에서 R2 완성본을 받는 방식으로 바꾼다.

## 검증

### 단위 테스트

- `spaceFiles`: 반복 영상·그림·감시의 기기와 방향별 주소, PC 크기 규칙, 감시의 PC 대체
- `resolveSpace`: 사진 유지, 사진이 지워진 경우, 서버 응답 전, `null`, 서버 공간
- `spaceCatalogQuery`: 가진 것만, 공간 정보 없는 상품 제외, 모르는 종류·방식 제외
- `fromApi`: 무료 상품 인식, 상점 목록에서 무료 제외, `tags` 변환
- `timerBackground`: 옛 `proctor` 값을 심플로, `space` 값 저장과 읽기
- `SessionSpacePage`: 서버 목록 타일, 칩, 회원 `PUT` 성공과 실패 되돌림, 비회원 기기 저장, 계측 시점
- 그리기: 반복 영상 실패 단계, 그림 실패, 동작 줄이기, 화면 숨김
- `RoomPage`: 기기 값으로 먼저 그리고 서버 값으로 맞추기

### 화면 확인

- 업로드 스크립트 `--dry-run`으로 반복 영상과 그림 시험 사본을 만들어 로컬 dev 서버가 받을 수 있게 두고, 로컬 백엔드에 시험 행을 넣어 공간 페이지와 세션 화면에서 본다. 시험 사본과 행은 커밋하지 않는다.
- 서버 하위 작업이 dev에 들어간 뒤, dev 서버와 실기기에서 감독관 감시 동작과 두 기기 사이의 이어짐을 확인한다.
- 라이트·다크, 동작 줄이기, 44px 터치 영역, aria를 확인한다.

### Figma

- 영상 탭을 다시 열고 공간 타일이 서버 목록에서 오는 모습을 반영한다. BY-1320에서 만든 "곧 만나볼 수 있어요" 섹션을 되돌린다.
- S1e 카드 썸네일을 16:9에서 4:3으로 고쳐 코드와 맞춘다.

## 범위 밖

- 상점 배경 화면의 설계와 분류 칩 (사용자가 따로 설계한다)
- 상점의 타이머 배경 판매 켜기(`TIMER_BACKGROUNDS_ON_SALE`)
- 유료 공간과 잠금 타일, 공간 페이지에서 상점으로 가는 길
- PC 화면에서 공간을 어떻게 배치할지 (BY-1193)
- 서버 저장에 실패한 선택을 나중에 다시 보내는 일
