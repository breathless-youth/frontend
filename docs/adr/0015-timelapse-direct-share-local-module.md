# 0015. 타임랩스 바로 공유는 로컬 Expo 모듈로 대상 앱을 연다

- Status: Accepted
- Date: 2026-10-10
- Relates to: [타임랩스 인스타그램 릴스·카카오톡 바로 공유 설계](../superpowers/specs/2026-10-10-BY-890-timelapse-direct-share-design.md), [ADR 0013](./0013-timelapse-photo-storage-exception.md), [ADR 0014](./0014-webview-video-transfer-to-native.md), 위키 `product/specs/BY-822-타임랩스.md`

## 배경

타임랩스 공유 다이얼로그의 `인스타그램`·`카카오톡` 버튼은 `더 보기`와 같은 OS 공유 시트를 열어서, 사용자가 시트에서 그 앱을 한 번 더 찾아야 했다. 인스타그램 릴스 편집 화면을 바로 열려면 iOS에서는 붙여넣기 보관함에 인스타그램 전용 항목을 넣어야 했고, Android 카카오톡에 영상을 넘기려면 인텐트에 `Uri` 추가값을 실어야 했다. 이미 쓰고 있던 react-native-share 12.3.1은 인스타그램 스토리만 대상으로 두고 릴스와 카카오톡은 다루지 않았다.

## 결정

- 저장소의 첫 로컬 Expo 모듈인 `apps/mobile/modules/direct-share`를 두고, autolinking이 찾는 `DirectShare` 모듈에 `shareToInstagramReels`와 `shareToKakaoTalk`을 둔다.
- 웹은 `video-share`의 선택 필드 `target`에 누른 버튼(`instagram`·`kakao`)만 싣고, 바로 열 수 있는지는 앱이 판단한다.
- 앱은 `Share.open`보다 먼저 대상 앱을 열어 보고, 열지 못하면 기존 `Share.open` 공유 시트로 돌아간다.
- 대상 앱이 없거나 영상이 3초보다 짧으면 공유 시트로 돌아간다.
- Meta 앱 ID 없이 만든 빌드와 이 모듈이 없는 옛 Dev Client도 공유 시트로 돌아간다.
- 모듈이 throw할 때와 iOS에서 카카오톡을 골랐을 때도 공유 시트로 돌아간다.
- iOS 릴스는 `com.instagram.sharedSticker.backgroundVideo`와 `com.instagram.sharedSticker.appID`를 붙여넣기 보관함에 넣고 `instagram-reels://share`를 연다.
- Android 릴스는 `com.instagram.share.ADD_TO_REEL` 인텐트에 `content://` 주소와 Meta 앱 ID를 싣고 인스타그램에 읽기 권한을 준다.
- Android 카카오톡은 `ACTION_SEND` 인텐트를 `com.kakao.talk`으로 보내고, 열기 직전에 설치 링크가 든 공유 본문을 클립보드에 복사한다.
- JS 래퍼는 `requireOptionalNativeModule`로 모듈을 불러와서, 모듈이 없으면 throw하지 않고 `false`를 돌려준다.
- 옛 앱 파서는 아는 칸만 골라 담아 모르는 `target`을 버리고 공유 시트를 열기 때문에 `target`에는 기능 표시 쿼리를 붙이지 않는다.
- 대상 앱 조회에 필요한 iOS 스킴 `instagram-reels`와 Android 패키지 `com.instagram.android`·`com.kakao.talk`은 react-native-share 플러그인 옵션으로 등록한다.

## 검토한 대안

- **react-native-share 패치**: 릴스와 카카오톡을 더할 수는 있지만 라이브러리를 올릴 때마다 패치를 다시 맞춰야 하고 남의 코드 내부 구조에 의존하게 된다.
- **`expo-intent-launcher`**: 추가값을 글자로만 넣을 수 있어 카카오톡이 받을 `Uri`를 넘기지 못한다.
- **`expo-clipboard`·`@react-native-clipboard/clipboard`**: 글자와 이미지만 복사해서 iOS 릴스가 읽는 인스타그램 전용 보관함 항목을 넣지 못한다.
- **`expo-sharing`**: OS 공유 시트만 열어 대상 앱을 정할 수 없다.
- **인스타그램 스토리**: 공식 한도가 20초라 40분 넘게 찍어 최대 30초가 된 타임랩스는 한도를 넘는다.
- **Kakao SDK**: 카카오톡 공유 API는 메시지 템플릿만 보내고 영상 파일은 보낼 수 없다.

2026-10-10에 npm 지난주 다운로드 수가 5만 이상인 후보를 조사했다.

| 라이브러리                          | 주간 다운로드 | 쓰지 않은 이유                               |
| ----------------------------------- | ------------- | -------------------------------------------- |
| `expo-sharing`                      | 3,112,720     | 대상 앱을 정할 수 없다                       |
| `expo-clipboard`                    | 2,989,143     | 인스타그램 전용 보관함 항목을 넣지 못한다    |
| `@react-native-clipboard/clipboard` | 752,890       | 인스타그램 전용 보관함 항목을 넣지 못한다    |
| `react-native-share`                | 637,890       | 이미 쓰고 있지만 릴스와 카카오톡 대상이 없다 |
| `expo-intent-launcher`              | 406,782       | 추가값이 글자뿐이라 `Uri`를 넘기지 못한다    |

`@react-native-kakao/share`는 주간 8,044회, `react-native-instagram-reels`는 41회라 기준에 못 미쳐 표에서 뺐다.

## 결과와 제약

- 네이티브 코드가 새로 들어가 Dev Client와 스토어 빌드를 다시 만들어야 켜진다.
- 이 모듈을 넣어 다시 만들기 전의 빌드는 공유 시트로 돌아간다.
- 로컬에서 인스타그램 경로를 보려면 빌드할 때 `META_APP_ID`·`META_CLIENT_TOKEN`이 있어야 한다.
- Meta가 정한 릴스 요건은 3초에서 60초 사이 영상이고, 앱은 3초 하한만 검사한다.
- Meta 앱이 Live 모드여야 일반 사용자가 릴스 공유를 쓸 수 있다.
- iOS 릴스 공유는 영상을 붙여넣기 보관함에 넣으므로, ADR 0013의 IndexedDB와 ADR 0014의 앱 캐시 밖에 세 번째 사본이 생긴다.
- 보관함 항목은 `.localOnly`라 다른 기기와 동기화되지 않고 5분 뒤 사라진다.
- 인스타그램을 열지 못하면 보관함을 바로 비운다.
- 이 사본은 사용자가 공유 버튼을 눌렀을 때만 생기고 서버로 가지 않는다.
- 그래서 이 ADR이 0013·0014의 보관 위치를 iOS 붙여넣기 보관함까지 넓힌다.
- Android는 기존 공유 시트 경로와 같이 앱 캐시 파일의 읽기 권한만 인스타그램·카카오톡에 준다.
- 인스타그램과 카카오톡은 실제로 올렸는지 돌려주지 않아서, 바로 열었을 때의 `shared`는 그 앱에 넘겼다는 뜻이다.
- Android 13 이상은 카카오톡을 열기 직전 클립보드에 복사할 때 시스템 복사 알림이 뜬다.
- Android의 두 함수는 `runOnQueue(Queues.MAIN)`으로 메인 큐에서 인텐트를 실행한다.
- 영상 길이 확인은 릴스 함수만 하고 이것도 메인 큐에서 돈다.
- 메인 큐의 길이 확인이 화면을 버벅이게 하는지는 실기기에서 확인한다.
- 설치된 expo-modules-core 57.0.20에서 `Queues`는 `expo.modules.kotlin.functions.Queues`로 가져온다.
- 루트 `.gitignore`가 이름이 `ios/`·`android/`인 폴더를 전부 무시해서 `apps/mobile/modules/*/ios/`와 `apps/mobile/modules/*/android/`를 다시 포함하는 두 줄을 더했다.
- 앞으로 만드는 로컬 모듈의 네이티브 소스도 이 두 줄 덕분에 커밋 대상에 들어간다.
- Swift·Kotlin 코드는 단위 테스트가 없어 iPhone·Android 실기기로 검증한다.
