# BY-584 카톡 공유 프리뷰 중복 제거

2026-09-03 승인. 카톡으로 초대를 공유하면 메시지가 3개로 전송되고 지연되는 문제의 설계다.

## 문제

카톡 공유 시 OG 프리뷰 2개와 텍스트 1개, 모두 3개 말풍선이 지연되어 전송됐다. 원인은 공유 페이로드가 같은 링크를 두 곳에 실어서다. `text` 본문 안(`inviteShareText`)에 링크가 박혀 있고 카톡이 이를 자동 링크로 인식해 프리뷰를 만들며, 별도 `url` 필드의 같은 링크로 프리뷰를 하나 더 만든다.

## 플랫폼 비대칭

이 중복은 iOS 특정이다. 모바일 브리지 핸들러(`apps/mobile/lib/nativeBridgeHandler.ts`)의 주석대로, Android의 RN `Share.share`는 `message`만 쓰고 `url` 필드를 무시한다. 그래서 Android는 링크가 `text`에 한 개만 있어 프리뷰가 하나뿐이고 중복이 없다. iOS는 `navigator.share`가 `text`와 `url`을 둘 다 넘겨 카톡이 프리뷰를 두 개 만든다.

## 해법

iOS 경로에서만 `text`에서 링크를 빼고 `url` 필드가 프리뷰 카드를 담당하게 한다. Android와 클립보드 경로는 그대로 둔다.

### 변경: `apps/web/src/features/social-room/shareInvite.ts`

- 새 헬퍼 `inviteShareBody(code)`를 추가한다. `그룹 스터디에 초대받았어요!\n\n초대코드: NNNN` 형식으로, 링크를 넣지 않는다.
- `navigator.share` 호출의 `text`를 `inviteShareText`에서 `inviteShareBody`로 바꾼다. `url`은 그대로 `inviteLink`를 싣는다. 링크는 `url` 필드가 카드로 렌더하므로 수신자는 탭할 수 있고, 본문에 링크가 없어 카톡이 프리뷰를 두 번 만들지 않는다. BY-427이 넣은 썸네일 카드는 `url` 필드가 그대로 그린다.
- 브리지(Android) 경로의 `text`는 `inviteShareText`(링크 포함)를 그대로 유지한다. Android는 `url`을 무시하므로 링크가 본문에 있어야 탭할 수 있고, 이 경로는 이미 중복이 없다.
- 클립보드 폴백은 `inviteShareText`(링크 포함)를 그대로 유지한다. `url` 필드가 없는 경로라 링크가 본문에 있어야 한다.

## 결과

- iOS 카톡: 프리뷰 카드 하나와 텍스트 하나로 2개. 중복과 지연이 사라진다. 링크는 카드로 탭 가능하다.
- Android 카톡: 기존과 동일하게 프리뷰 하나와 텍스트. 링크는 본문에서 탭 가능하다.
- 어느 경로에서도 수신자가 4자리 코드를 직접 입력하지 않는다. 링크가 항상 탭 가능하다.
- BY-427의 공유시트 썸네일 카드가 유지된다.

## 테스트

- `inviteShareBody`가 링크 없이 인사와 초대코드만 담는지.
- `navigator.share`가 `text`로 `inviteShareBody`, `url`로 `inviteLink`를 싣는지(링크가 본문에 없는지 함께 확인).
- 브리지 경로가 `text`로 `inviteShareText`(링크 포함), `url`로 `inviteLink`를 그대로 싣는지.
- 클립보드 폴백이 `inviteShareText`(링크 포함)를 복사하는지.

## 범위 밖

- 인앱 브라우저에서 앱 열기(스킴 브리지)는 BY-583이다.
- 재입장 시 이전 코드 잔존은 BY-581이다.
