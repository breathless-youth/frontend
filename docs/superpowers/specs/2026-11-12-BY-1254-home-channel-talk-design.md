# BY-1254 홈 하단 문의하기와 채널톡 상담 화면

- 티켓: BY-1254 (상위 BY-1252, 선행 BY-1253)
- 마스코트 원본: Figma V3 `nmpEKUAgMwMtLdxIIXGFUB` 노드 `10132:246`(형태), `10052:449`(웃는 표정)
- 레퍼런스: 왼쪽 원형 마스코트와 오른쪽 말풍선 버튼이 붙은 챗봇 진입 버튼

## 목표

사용자가 불편을 느낀 순간 홈에서 바로 문의하고, 팀은 새 상담을 슬랙 `서비스문의` 채널에서 바로 확인해 실시간으로 답한다.
지금 문의 경로는 설정 안쪽의 구글폼뿐이고, 앰플리튜드 설문은 공부 결과 제출 때만 뜬다.

## 결정

| 항목                | 결정                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 상담 도구           | 채널톡 웹 SDK. 네이티브 SDK는 무료 플랜에서 쓸 수 없고 Expo 지원이 없다                                                     |
| 화면 위치           | `/contact/chat` 문서 단위 라우트. 홈에서 `hardNavigate`로 연다                                                              |
| SDK 불러오기        | 공식 스니펫을 모듈에 넣고 쓰는 함수 4개만 타입을 적는다. npm 로더는 쓰지 않는다                                             |
| 사용자 식별         | 익명 boot. 프로필에 `userId`(참고값), 앱 버전, 플랫폼, 언어만 담는다. 이메일·전화번호는 넣지 않는다                         |
| 회원 식별           | 범위 밖. 익명 ID가 재설치 외 이유로 초기화되거나 계정 확인이 필요한 문의가 잦아지면 `memberHash` 후속 티켓을 만든다         |
| 언어                | 앱 언어가 ko·en·ja면 그대로, 그 밖(zh-Hant)은 en                                                                            |
| 테마                | `<html data-theme>`가 `light`·`dark`면 그 값, 없으면 `system`                                                               |
| 홈 입구             | 새 홈 맨 아래 `HomeContactBubble`. 마스코트 원형 + 말풍선 `불편한 점이 있으면 바로 알려 주세요 ›`, 접근성 이름 `문의하기`   |
| 상담창 안 외부 링크 | 범위 밖. 앱 셸이 외부 이동을 막아 앱에서는 열리지 않는다. 상담원은 링크 대신 글로 안내하고, 앱 셸 수정은 후속 티켓으로 둔다 |
| 설정 > 문의하기     | 구글폼 그대로                                                                                                               |
| 옛 홈               | 링크를 붙이지 않는다                                                                                                        |
| 플러그인 키         | `VITE_CHANNEL_PLUGIN_KEY`. `deploy-web.yml`이 `PROD_`/`STAGING_` 변수로 주입하고 필수 변수 목록에 넣는다                    |

## COEP 제약

웹은 `/contact*`·`/interview*`를 뺀 모든 경로에 COOP `same-origin`과 COEP `require-corp`를 보낸다.
세션의 MediaPipe가 SharedArrayBuffer를 쓰려면 교차 출처 격리가 필요하기 때문이다.
채널톡 스크립트(`cdn.channel.io`)는 CORP·CORS 헤더를 보내지 않는다.

2026-11-12 Playwright로 같은 페이지에 헤더만 바꿔 채널톡 로더를 불러 본 결과는 아래와 같다.

| COEP             | Chromium                                                                       | WebKit                                          |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| 없음             | 로드됨                                                                         | 로드됨                                          |
| `require-corp`   | 차단 (`ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`) | 차단 (CORP 위반으로 취소)                       |
| `credentialless` | 로드됨, 격리 유지                                                              | 로드됨, 격리 풀림 (`crossOriginIsolated=false`) |

`credentialless`로 바꾸면 iOS에서 세션 격리가 풀리므로 쓸 수 없다.
그래서 상담 화면을 이미 COEP 예외인 `/contact*` 경로에 두고 문서 단위로 열고 닫는다.
이 문서 안에서 SPA로 다른 라우트에 가면 COEP 없음이 승계되므로 이탈도 하드 내비게이션으로만 한다.

## 구조

### 홈 입구

- `HomeV3Content`의 `HomeUtilityShortcuts` 아래에 `HomeContactBubble`을 둔다.
- 버튼 하나가 마스코트와 말풍선을 감싸고, 터치 영역은 44px 이상이다.
- 마스코트 이미지는 장식이라 `alt=""`다. 말풍선 문구는 화면에 보이고, 버튼의 접근성 이름은 `문의하기`다.
- 누르면 `home_shortcut_tapped {target: "contact"}`를 남기고 `hardNavigate("/contact/chat" + location.search)`로 연다. 쿼리의 `userId`·`appVersion`을 그대로 넘긴다.
- 마스코트는 Figma에서 형태 노드에 웃는 표정을 합쳐 PNG 2x·3x로 내보낸다.

### 상담 화면 `ContactChatPage`

- 위에 `ScreenBackHeader`(`문의하기`), 가운데에 상태 문구를 둔다. 모바일에서는 채널톡 상담창이 화면 전체를 덮는다.
- 상태는 `loading` → `open` 또는 `failed(reason)`이다.
- 순서는 스니펫 로드 → `boot` → `openChat()`이다.
- boot 옵션은 `pluginKey`, `hideChannelButtonOnBoot: true`, `language`, `appearance`, `profile`이다.
- `onShowMessenger`에서 `contact_chat_opened`를 남긴다.
- `onHideMessenger`에서 이전 문서로 돌아간다.
- 화면을 벗어날 때 `shutdown`을 부른다.
- 실패하면 `상담창을 불러오지 못했어요`, `네트워크 상태를 확인하고 다시 시도해 주세요.`, `다시 시도` 버튼을 보이고 `contact_chat_load_failed {reason}`을 남긴다.
- `reason`은 `script`(스크립트 로드 실패), `boot`(boot 콜백 오류), `no_key`(플러그인 키 없음)다. `no_key`면 다시 시도 버튼을 숨긴다.
- 다시 시도는 `error_retry_pressed {screen: "contact_chat"}`를 남기고 스니펫부터 다시 부른다.

### 공용 이탈 함수

`GoogleFormPage` 안의 `exitToPreviousDocument`를 `lib/hardNavigation.ts`의 함수로 빼서 두 화면이 같이 쓴다.
같은 출처에서 넘어왔고 뒤로 갈 항목이 있으면 `history.back()`, 아니면 `hardReplace(fallbackPath + search)`다. 동작은 바꾸지 않는다.

## 문구

| 키                             | ko                                  |
| ------------------------------ | ----------------------------------- |
| `home:v3.contact.bubble`       | 불편한 점이 있으면 바로 알려 주세요 |
| `home:v3.contact.label`        | 문의하기                            |
| `settings:contactChat.loading` | 상담창을 불러오는 중                |
| `settings:contactChat.failure` | 상담창을 불러오지 못했어요          |

헤더 제목은 기존 `settings:rows.contact`, 실패 본문은 기존 `interview:googleForm.failureBody`를 쓴다.
en·ja·zh-Hant는 업계에서 실제로 쓰는 표현인지 확인한 뒤 넣는다.

## 계측

| 이벤트                                         | 시점                                   |
| ---------------------------------------------- | -------------------------------------- |
| `home_shortcut_tapped {target: "contact"}`     | 홈 문의 버블 누름                      |
| `contact_chat_opened`                          | 채널톡 `onShowMessenger`               |
| `contact_chat_load_failed {reason}`            | 스크립트 로드 실패, boot 실패, 키 없음 |
| `error_retry_pressed {screen: "contact_chat"}` | 실패 화면 다시 시도                    |

상담 전송은 채널톡 iframe 안이라 계측하지 않고 채널톡 통계의 상담 수로 대신한다.

## 보안

- 프로필의 `userId`는 표시용이라 상담 내역 조회에 쓰이지 않는다. 위조할 수 있으므로 상담원은 이 값만으로 계정 변경 요청을 처리하지 않는다(BY-1253 운영 규칙).
- 채널톡 스크립트는 같은 출처 iframe에서 실행된다. 웹 저장소에는 토큰이 없고 refresh 토큰은 네이티브에만 있다. 메모리의 access 토큰은 같은 문서의 스크립트가 브리지로 요청하면 받을 수 있어, 외부 SDK 수준의 신뢰를 받아들인다.
- 채널톡은 `/contact/chat` 문서에서만 불러온다.

## 테스트

- 언어 매핑: ko·en·ja는 그대로, zh-Hant는 en이다.
- 테마 매핑: `data-theme`의 light·dark는 그대로, 없으면 system이다.
- 프로필: `userId`, 앱 버전, 플랫폼, 언어가 담기고 다른 필드는 없다.
- 상담 화면은 SDK를 가짜로 바꿔 검사한다.
  - 키가 없으면 실패 화면이 보이고 다시 시도 버튼이 없으며 `no_key`가 남는다.
  - boot가 성공하면 `openChat`이 불리고, 열림 콜백에서 `contact_chat_opened`가 남는다.
  - boot가 실패하면 실패 화면과 `boot`가 남고, 다시 시도하면 다시 부른다.
  - 닫힘 콜백에서 이전 문서로 이탈한다.
- 홈 버블: 누르면 `home_shortcut_tapped {target: "contact"}`가 남고 `/contact/chat`과 지금 쿼리로 하드 내비게이션한다. 접근성 이름이 `문의하기`다.
- COEP: 운영과 같은 헤더를 붙인 빌드 결과물에서 홈은 격리되고 `/contact/chat`은 채널톡이 뜨는지 Playwright로 확인한다.
- 실기기(플러그인 키 발급 뒤): iOS·Android에서 상담 열기, 닫고 홈 복귀, 사진 첨부를 확인한다.

## 범위 밖

- 답장 푸시, 회원 식별(`memberHash`), 네이티브 SDK
- 상담창 안 외부 링크 열기(앱 셸 수정과 스토어 배포 필요)
- 설정 > 문의하기 변경, 옛 홈
