# BY-890 타임랩스 인스타그램 릴스·카카오톡 바로 공유 설계

- 티켓: BY-890 (상위 BY-822, 선행 BY-898·BY-899)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §7·§8
- 브랜치: `feature/BY-890-timelapse-direct-share` (base `dev` 0bc1848d)
- 설명 페이지: https://claude.ai/artifact/QamFwGd88Zap8gy4xfatFf

## 목표

공유 시트의 `인스타그램`·`카카오톡` 버튼을 누르면 휴대폰 공유 목록을 거치지 않고 그 앱이 바로 열려 영상을 받는다. 지금은 두 버튼 모두 `더 보기`와 같은 공유 목록을 연다.

## 사용자 결정 (2026-10-10)

| 항목          | 결정                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- |
| 인스타그램    | iOS·Android 모두 릴스 편집 화면으로 바로 보낸다. 스토리·피드·메시지는 `더 보기`로 간다         |
| 카카오톡      | Android만 바로 보낸다. iOS는 지금처럼 공유 목록을 연다                                         |
| 설치 링크     | Android 카카오톡을 연 뒤에 공유 본문 전체를 클립보드에 복사한다. 인스타그램은 못 붙인다        |
| 열 수 없을 때 | 앱이 없으면 안내 없이 공유 목록을 연다. 인스타그램 릴스만 3초 미만 영상도 공유 목록으로 보낸다 |
| 만드는 방식   | 로컬 Expo 모듈 하나. 새 라이브러리는 도입하지 않는다                                           |
| 티켓          | BY-890 하나로 진행한다                                                                         |

## 방식 고르기

| 안                                                   | 판단                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 로컬 Expo 모듈 (채택)                                | iOS 릴스는 붙여넣기 보관함에 인스타그램 전용 항목을 넣어야 하고, Android 카카오톡은 영상을 `Uri` 추가값으로 넘겨야 한다. 둘 다 설치된 도구로는 안 된다 |
| react-native-share 패치                              | 라이브러리를 올릴 때마다 패치를 다시 맞춰야 하고 남의 코드 내부 구조에 의존한다                                                                        |
| `expo-intent-launcher`(주간 약 41만)                 | 추가값을 글자로만 넣어 카카오톡이 받을 `Uri`를 못 넘긴다. 릴스는 `EXTRA_STREAM` 없이 받아 주는지 알 수 없다                                            |
| `expo-clipboard`·`@react-native-clipboard/clipboard` | 글자와 이미지만 복사해 iOS 릴스 항목을 못 넣는다. 링크 복사는 Kotlin 한 줄로 충분하다                                                                  |
| 인스타그램 스토리                                    | 공식 한도가 20초라 40분 넘게 찍은 영상(최대 30초)이 한도를 넘는다                                                                                      |
| Kakao SDK                                            | 카카오톡 공유 API는 템플릿만 보내고 영상 파일을 보낼 수 없다                                                                                           |

## 흐름

```
웹 run("instagram" | "kakao" | "more")
  └ sendTimelapse → shareTimelapse(route, video, startedAtMs, target)
      └ shareVideoNatively(blob, target)
          └ { type: "video-share", id, chunks, text, target? }
앱 webBridge: target이 아는 값일 때만 싣는다
  └ nativeBridgeHandler → shareVideo(id, chunks, text, title, target)
      └ finish 안에서 바로 공유를 먼저 시도한다
          instagram + Meta 앱 ID 있음 → DirectShare.shareToInstagramReels(uri, appId)
          kakao + Android            → DirectShare.shareToKakaoTalk(contentUri, text)
          true면 "shared"
          그 밖은 지금의 Share.open
```

- `target`은 `"instagram" | "kakao"`만 둔다. `더 보기`는 칸을 비워 보내고 지금 메시지와 같다.
- 웹은 누른 버튼만 넘기고 바로 열 수 있는지는 앱이 판단한다.
- 브라우저 경로(`navigator.share`)는 `target`을 쓰지 않는다.
- 바로 열면 결과는 `shared`다. 인스타그램과 카카오톡은 실제로 올렸는지 돌려주지 않으므로 그 앱에 넘겼다는 뜻이다. 시트 안내는 지금처럼 띄우지 않는다.
- 공유 목록으로 돌아가는 경우: 앱 없음, 릴스에 보낼 3초 미만 영상, Meta 앱 ID 없음, 모듈이 없는 옛 Dev Client, 모듈 throw, iOS 카카오톡, `target` 없음.

## 네이티브 모듈 `DirectShare`

위치는 `apps/mobile/modules/direct-share/`다. Expo 로컬 모듈 구조를 따르고 autolinking이 찾는다. JS 래퍼는 `requireOptionalNativeModule`로 불러와 모듈이 없으면 `false`를 돌려준다(`orientation.ts`와 같은 방식).

### `shareToInstagramReels(uri, appId): Promise<boolean>`

iOS는 `file://` 주소를 받는다.

1. `canOpenURL("instagram-reels://share")`가 거짓이면 `false`.
2. `AVURLAsset`으로 길이를 읽어 3초 미만이면 `false`.
3. `UIPasteboard.general.setItems`에 `com.instagram.sharedSticker.backgroundVideo`(영상 `Data`)와 `com.instagram.sharedSticker.appID`를 넣는다. 옵션은 `.localOnly`와 5분 뒤 만료다.
4. `open`의 성공 여부를 돌려준다. 열지 못하면 보관함을 비우고 `false`를 돌려준다.

Android는 `contentUri`를 받는다.

1. `MediaMetadataRetriever`로 길이를 읽어 3초 미만이면 `false`.
2. `ADD_TO_REEL` 요청에 `setDataAndType(uri, "video/*")`, `EXTRA_STREAM`, `com.instagram.platform.extra.APPLICATION_ID`, `setPackage("com.instagram.android")`, `FLAG_GRANT_READ_URI_PERMISSION`을 넣고 `grantUriPermission`도 부른다.
3. `resolveActivity`가 없으면 `false`, 있으면 실행하고 `true`.

### `shareToKakaoTalk(uri, text): Promise<boolean>` (Android만)

1. `ACTION_SEND`에 `video/mp4`, `EXTRA_STREAM`, `EXTRA_TEXT`, `setPackage("com.kakao.talk")`, 읽기 권한 부여를 넣는다.
2. `resolveActivity`가 없으면 클립보드를 건드리지 않고 `false`.
3. 실행한 뒤 공유 본문을 클립보드에 넣고 `true`.

`EXTRA_TEXT`를 같이 넣는 이유: 카카오톡이 파일과 함께 온 글을 버린다는 답변은 이미지 기준이다. 영상에서 글이 살아남으면 그대로 쓰이고 버려져도 클립보드가 남는다.

Android 릴스 함수는 `Coroutine` 본문이라 모듈 큐에서 영상 길이를 확인하고, 인텐트는 `withContext(Dispatchers.Main)` 안에서 실행한다. 카카오톡 함수는 길이를 보지 않아 `runOnQueue(Queues.MAIN)`으로 메인 큐에서 실행한다. 설치된 expo-modules-core 57.0.20에서 `Queues`와 `Coroutine`은 `expo.modules.kotlin.functions`에서 가져오고, kotlinx-coroutines는 expo-modules-core가 `api`로 노출한다.

### 앱 JS (`videoTransfer.ts`)

- `shareVideo`에 `target`을 더하고 `finish` 안에서 `Share.open`보다 먼저 바로 공유를 시도한다.
- iOS는 `file.uri`, Android는 `expo-file-system`의 `contentUri`를 넘긴다.
- Meta 앱 ID는 `metaAppIdFromConfig()`로 읽고 없으면 모듈을 부르지 않는다.
- 모듈이 throw하면 경고 로그를 남기고 `Share.open`으로 간다.
- 공유 파일은 지금 규칙대로 다음 전달이나 앱 시작 때 지운다. Android 인스타그램·카카오톡은 넘어간 뒤에 파일을 읽는다.

## 설정과 호환

- `app.json`의 react-native-share 플러그인 옵션에 `ios: ["instagram-reels"]`, `android: ["com.instagram.android", "com.kakao.talk"]`를 넣는다. 플러그인 위치는 ADR 0014대로 `expo-build-properties` 뒤다.
- `expo config --type introspect`와 `expo prebuild --clean`으로 Info.plist의 `LSApplicationQueriesSchemes`에 `instagram-reels`가, Manifest `<queries>`에 두 패키지가 들어가는 것을 확인했다. Meta 설정이 있는 빌드에서 `fbapi`와 함께 남는 것은 `expo config`로만 확인했고 실기기 빌드에서 다시 본다.
- 루트 `.gitignore`가 이름이 `ios/`·`android/`인 폴더를 전부 무시해서 `apps/mobile/modules/*/ios/`와 `apps/mobile/modules/*/android/`를 다시 포함하는 두 줄을 더했다. 앞으로 만드는 로컬 모듈도 이 줄로 네이티브 소스가 커밋된다.
- 옛 앱 파서는 아는 칸만 골라 담아 `target`을 버리므로 기능 표시 쿼리를 새로 붙이지 않는다.
- 새 Dev Client와 스토어 빌드가 나가야 켜진다. 로컬에서 인스타그램 경로를 보려면 빌드할 때 `META_APP_ID`·`META_CLIENT_TOKEN`이 있어야 한다.
- 릴스 공유는 Meta 앱이 Live 모드여야 사용자가 쓸 수 있다.

## 개인정보

- iOS 릴스 공유는 Meta가 정한 방식대로 영상을 붙여넣기 보관함에 넣는다. ADR 0013·0014가 정한 IndexedDB·앱 캐시 밖에 생기는 세 번째 사본이다.
- 보관함 항목은 `.localOnly`로 다른 기기와 동기화하지 않고 5분 뒤 사라진다. 사용자가 공유 버튼을 눌렀을 때만 생기고 서버로 가지 않는다.
- Android는 지금처럼 앱 캐시 파일의 읽기 권한만 인스타그램·카카오톡에 준다.
- ADR 0015, 그리고 루트와 `apps/mobile`의 `CLAUDE.md` 타임랩스 예외 문장에 보관함 사본을 더한다.

## 분석 이벤트

`trackTimelapseShareTapped`의 속성은 유지하고 주석만 고친다. 인스타그램과 Android 카카오톡은 그 앱을 바로 열고 이때 `shared`는 그 앱에 넘겼다는 뜻이다. 못 열면 공유 목록으로 가므로 `button`이 채널별 공유 수와 같지는 않다.

## 문서

- 위키 BY-822 명세의 공유 시트 절, 체크리스트, 결정 표, 남은 일을 고치고 변경 이력을 남긴다. 위키 워크트리 `.ai-BY-890`, 브랜치 `docs/BY-890-direct-share`.
- ADR 0015: 저장소의 첫 로컬 네이티브 모듈. 라이브러리 주간 다운로드 조사(2026-10-10)도 여기에 남긴다.
- `docs/architecture.md` 영상 파일 전달 절에 `target`과 되돌아가는 경로를 더한다.
- 화면이 바뀌지 않아 Figma는 고치지 않는다.

## 테스트와 검증

- 앱 jest: 파서의 `target`, `shareVideo`의 바로 공유와 되돌아가는 경로, 핸들러의 `target` 전달.
- 웹 vitest: 공유 메시지의 `target`, `더 보기`와 브라우저 경로가 그대로인지.
- Swift·Kotlin은 실기기로 본다. iPhone·Android 각각 인스타그램 있음·없음, 3초 미만, Android 카카오톡 있음·없음.
- 실기기에는 인스타그램이 깔린 iPhone·Android와 카카오톡이 깔린 Android가 필요하다.

## 범위 밖

- 인스타그램 스토리·피드·메시지 바로 보내기
- iOS 카카오톡 바로 보내기, Kakao SDK
- 인스타그램으로 설치 링크 보내기
- 바로 공유와 되돌아간 공유를 분석 이벤트에서 가르는 속성
