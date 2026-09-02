# BY-583 인앱 브라우저 스킴 브리지

2026-09-03 승인. 카카오톡·인스타그램 등 인앱 브라우저에서 초대 링크를 탭해도 앱이 열리게 하는 설계다.

## 문제

유니버설 링크(iOS)와 App Links(Android)는 인앱 브라우저 웹뷰 안에서는 발동하지 않는다. OS 정책이라 구현으로 우회할 수 없고, 카카오톡이 주 공유 채널이라 초대 링크를 눌러도 앱으로 넘어가지 못하는 공백이 생긴다. 또한 웹 `/social/join`의 "앱에서 참여하기" 버튼은 지금 앱 시도 없이 곧장 스토어로 보내서, 앱이 설치된 사용자도 스토어로 가버린다.

## 해법

웹이 커스텀 스킴 `focusmakers://`로 앱을 먼저 시도하고, 앱이 열리지 않으면 스토어로 폴백한다. 웹은 앱 설치 여부를 조회할 수 없으므로 "일단 앱을 열어 보고 실패하면 스토어" 패턴을 쓴다. BY-582에서 네이티브 스킴을 `["focusmakers", "focuson"]`로 확장해 두었으므로 웹 작업만으로 된다.

### 새 모듈: `apps/web/src/features/social-room/appHandoff.ts`

스킴 핸드오프를 한곳에 모은다.

- `appSchemeUrl(code)`는 `focusmakers://social/join?code=NNNN`을 만든다.
- `androidIntentUrl(code)`는 `intent://social/join?code=NNNN#Intent;scheme=focusmakers;package=com.breathlessyouth.mobile;S.browser_fallback_url=<스토어 링크>;end`를 만든다. Android는 이 문법이 설치 시 앱 실행, 미설치 시 `browser_fallback_url`로 이동을 브라우저가 알아서 처리하므로 타이머가 필요 없다. 폴백 URL은 기존 `storeLink("android", code)`를 쓴다(Install Referrer로 초대코드 유지).
- `openInApp(platform, code)`는 플랫폼별로 앱을 연다. Android는 `androidIntentUrl`로 이동한다. iOS는 `appSchemeUrl`로 이동한 뒤 1.5초 타이머를 걸고, 타이머가 끝날 때까지 페이지가 살아 있으면(앱 전환이 없었으면) `storeLink("ios", code)`로 보낸다. 앱으로 전환되면 `visibilitychange`나 `pagehide`가 먼저 발생하므로 그때 타이머를 취소해 앱과 스토어가 겹쳐 열리는 것을 막는다.
- `isInAppBrowser(userAgent)`는 카카오톡, 인스타그램, 네이버, 라인, 페이스북 등 주요 인앱 브라우저의 UA 토큰을 감지한다.

### `InviteCodeJoinPage` 변경

- 자동 발사: 네이티브 브리지가 없고, 인앱 브라우저이고, URL에 `code`가 있을 때, 첫 로드에 한 번만 `openInApp`을 실행한다. 미설치로 앱이 안 열려도 페이지는 그대로 남아 기존 코드 입력 흐름이 유지된다.
- "앱에서 참여하기" 버튼: 지금의 `<a href={스토어}>`를 버튼으로 바꿔 누르면 `openInApp`을 부른다. 어느 브라우저에서 왔든 스킴을 먼저 시도하고 실패 시 스토어로 폴백한다. 스킴에 실을 코드는 기존 버튼과 같은 규칙으로 고른다(입력이 4자리면 그 코드, 아니면 빈 값).
- 앱 안(네이티브 브리지 있음)에서는 지금처럼 이 버튼과 자동 발사 모두 동작하지 않는다. 변화 없다.

## 확정한 결정

- iOS 폴백 대기는 1.5초다. 너무 짧으면 느린 기기에서 앱이 뜨는 도중에 스토어로 새고, 너무 길면 미설치 사용자가 오래 기다린다.
- 자동 발사는 URL에 `code`가 있을 때만 한다. 코드 없이 `/social/join`을 직접 여는 경우에는 앱을 강제로 열지 않는다.
- 자동 발사는 첫 로드에 한 번만 한다. 앱 열기 확인창을 취소한 사용자에게 다시 쏘지 않는다.
- 인앱 브라우저 감지에 실패해도 버튼 경로는 그대로 동작하므로 자동 발사만 생략된다.

## 테스트

- 유닛: `appSchemeUrl`과 `androidIntentUrl`이 만드는 문자열, `isInAppBrowser`의 UA 케이스(카톡·인스타 등 참, 일반 Safari·Chrome 거짓), `openInApp`의 iOS 타이머 폴백과 전환 시 취소(가짜 타이머), 버튼 클릭이 스킴 경로를 타는지.
- 실기기: 카톡 인앱에서 초대 링크 자동 진입(설치), 미설치 시 스토어 폴백, 버튼 동작. BY-582 스킴이 포함된 새 빌드 이후에 검증한다(묶음 릴리즈 계획).

## 범위 밖

- 네이티브 스킴 등록은 BY-582에서 완료했다.
- 공기계 autoVerify 문제는 BY-549에서 추적하며 원인인 이전 앱 서명 키 지문은 BY-582의 assetlinks 수정에 포함됐다.
- 카톡 공유 3중 전송은 BY-584다.
