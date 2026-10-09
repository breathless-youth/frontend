# BY-899 타임랩스 영상 저장·공유 네이티브 브리지 설계

- 티켓: BY-899 (BY-889에서 분할, 상위 BY-822, 선행 BY-897, 후속 BY-898·BY-890)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §8
- 브랜치: `feature/BY-899-timelapse-share-bridge` (base `dev`)

## 목표

웹이 만든 타임랩스 mp4를 앱이 받아 사진 앱에 저장하거나 OS 공유 시트로 보낸다. 공유할 때는 설치 링크 본문을 함께 넘긴다. 버튼·안내 같은 화면은 BY-898에서 만든다.

## 사용자 결정 (2026-10-08)

| 항목          | 결정                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 파일 전달     | base64 조각으로 나눠 보낸다. 원본 384KB(base64 512KB)씩, 앱이 캐시 파일에 이어 쓴다                                                                                                                             |
| OS 공유       | react-native-share. 두 플랫폼 모두 파일과 본문을 함께 넘긴다                                                                                                                                                    |
| 사진 앱 저장  | expo-media-library `saveToLibraryAsync`, iOS는 사진 추가(write-only) 권한                                                                                                                                       |
| 권한 거부     | 앱은 `denied`만 돌려준다. 안내와 "설정 열기"(기존 `open-settings`)는 BY-898 다이얼로그가 맡는다                                                                                                                 |
| 공유 본문     | `포커스 메이커스와 함께한 공부 모습이에요` + 줄바꿈 + 설치 링크                                                                                                                                                 |
| 설치 링크     | `{origin}/download?utm_source=timelapse&utm_medium=share&utm_campaign=timelapse_share` (BY-891)                                                                                                                 |
| 구 버전 앱    | 쿼리 플래그 `videoShare=1`. 웹은 모듈을 읽을 때 한 번 판정해 보관한다. 플래그가 없을 때의 화면 처리는 BY-898이 정한다                                                                                           |
| 결과 대기     | 저장은 120초까지 기다린다(권한 창 포함, 화면을 막지 않는 안전장치). 공유는 시트가 닫힐 때까지 기다린다                                                                                                          |
| iOS 권한 문구 | `NSPhotoLibraryAddUsageDescription`: `타임랩스 영상을 사진 앱에 저장하려면 사진 추가 권한이 필요해요`. `NSPhotoLibraryUsageDescription`: `타임랩스 영상을 사진 앱에 저장할 때 사용해요`                         |
| Android 권한  | 저장용 `WRITE_EXTERNAL_STORAGE`는 expo-media-library가 Android 12 이하에서 저장 전에 런타임으로 요청하므로 유지한다. Play의 사진·영상 권한 정책이 보는 `READ_MEDIA_*` 읽기 권한은 `blockedPermissions`로 막는다 |
| 문서          | ADR 0014(웹뷰→앱 파일 전달과 새 네이티브 모듈), `docs/architecture.md` 브리지 절. 위키 앱 심사 체크리스트는 위키 PR로 따로                                                                                      |
| 검증          | 로컬 Dev Client를 다시 빌드해 iPhone과 A23에서 저장·공유·권한 거부를 확인한다                                                                                                                                   |

## 방식 고르기

| 안                                | 판단                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 조각 전달 (채택)                  | 한 번에 13MB 문자열을 웹·네이티브·JS에 동시에 띄우지 않는다. expo-file-system(이미 설치됨) `File.write(..., { encoding: "base64", append: true })`로 이어 쓴다                                                                                                                                                          |
| 한 번에 전달                      | 코드는 가장 짧지만 저사양 기기에서 큰 문자열이 메모리를 압박한다                                                                                                                                                                                                                                                        |
| Android는 expo-sharing으로 파일만 | 새 의존성이 Expo 공식 모듈뿐이지만 Android에서 설치 링크 본문이 빠진다                                                                                                                                                                                                                                                  |
| react-native-share (채택)         | 12.3.1, TurboModule 사양 포함, SDK 57 prebuild는 `newArchEnabled=true`. 자체 `FileProvider`로 Android 파일 공유 설정이 필요 없고 `EXTRA_TEXT`로 본문을 붙인다. Instagram 공유 코드가 사진 보관함 API를 참조해 iOS에 `NSPhotoLibraryUsageDescription`이 필요하다(이슈 #1783). BY-890에서 `shareSingle`을 다시 쓸 수 있다 |

## 브리지 계약 (`packages/types/src/bridge.ts`)

웹→앱:

- `video-chunk`: `{ id: string; seq: number; data: string /* base64 */; atMs }`
- `video-save`: `{ id: string; chunks: number; atMs }`
- `video-share`: `{ id: string; chunks: number; text: string; title?: string; atMs }`

앱→웹:

- `video-result`: `{ id: string; action: "save" | "share"; status: "saved" | "shared" | "dismissed" | "denied" | "failed"; atMs }`

`id`는 웹이 한 번의 저장·공유마다 새로 만든다. 상관 id 없이 타입으로만 응답을 구분하는 기존 패턴(카메라 확인)과 달리, 같은 다이얼로그에서 저장과 공유가 겹칠 수 있어 id를 둔다.

## 앱 (`apps/mobile`)

- 네이티브 SDK는 `lib/videoTransfer.ts` 어댑터에서만 import한다(저장소 규칙).
- `video-chunk`: `seq === 0`이면 `Paths.cache/timelapse-{id}.mp4`를 새로 만들고, 그 뒤 조각은 이어 쓴다. 순서가 어긋나면(`seq`가 기대값과 다르면) 그 id를 실패로 표시한다.
- `video-save` / `video-share`: 받은 조각 수가 `chunks`와 다르거나 실패로 표시된 id면 `failed`를 돌려준다.
  - 저장: `requestPermissionsAsync(true)`(write-only). 허용되지 않으면 `denied`, 허용되면 `saveToLibraryAsync(uri)` 뒤 `saved`.
  - 공유: `Share.open({ url: uri, type: "video/mp4", message: text, title, failOnCancel: false })`. 사용자가 취소하면 `dismissed`, 아니면 `shared`.
  - 저장은 끝나면 성공·실패와 관계없이 임시 파일을 바로 지운다. 공유는 바로 지우지 않는다. Android에서 react-native-share가 사용자가 대상 앱을 고른 순간 resolve하므로, 그때 파일을 지우면 받는 앱이 파일을 읽지 못한다. 대신 새 전달이 시작될 때(`seq === 0`) 캐시에 남은 다른 id의 `timelapse-*.mp4`를 지운다. 조각만 오다 멈춰 요청이 오지 않은 id도 마지막 조각 뒤 2분이 지났으면 이때 파일과 순번 기록을 함께 지운다.
- 동시에 여러 id가 오면 id별로 따로 관리한다. 앱 실행 중 남은 임시 파일은 다음 같은 id가 없으므로 앱 캐시 정리에 맡긴다.
- `remoteQueryParams`에 `videoShare: "1"`을 더한다.
- `app.json`
  - plugins: `["expo-media-library", { photosPermission, savePhotosPermission, granularPermissions: [] }]`, `"react-native-share"`(플러그인 옵션 없음 — `shareSingle`을 쓰지 않는다).
  - `ios.infoPlist`에 두 권한 문구(플러그인 기본 영문 문구를 덮는다).
  - `android.blockedPermissions`에 `READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`를 더한다. `WRITE_EXTERNAL_STORAGE`는 막지 않는다. expo-media-library가 Android 12 이하에서 저장 전에 요청하므로 `maxSdkVersion`을 28로 낮추면 Android 10~12에서 저장이 깨진다.
  - `permissionCopy.test.ts`의 고정값을 함께 고친다.

## 웹 (`apps/web/src/lib/nativeVideo.ts`)

- `canUseNativeVideo()`: 브리지가 있고 모듈을 읽을 때의 URL에 `videoShare=1`이 있으면 참.
- `saveVideoNatively(blob)` / `shareVideoNatively(blob)`: `crypto.randomUUID()`로 id를 만들고, Blob을 384KB씩 잘라 base64로 바꿔 `video-chunk`로 차례로 보낸 뒤 `video-save` / `video-share`를 보낸다. `video-result`(같은 id)를 기다려 `status`를 돌려준다.
  - 저장은 120초가 지나면 `failed`로 끝낸다. 공유는 시간 제한을 두지 않는다.
  - 결과를 기다리는 동안 화면을 막지 않는다. 호출한 쪽이 결과를 버려도 된다.
- 공유 본문은 `timelapseShareText(origin)`로 만든다. 설치 링크의 UTM 값은 `features/social-room/storeLink.ts`의 `InstallUtm` 형태를 쓴다.
- `parseToWebMessage`에 `video-result`를 더한다.

## 문서

- ADR 0014: 웹뷰→앱 파일 전달(base64 조각)과 react-native-share·expo-media-library 도입, 사진 읽기 권한 문구가 필요한 이유.
- `docs/architecture.md` 브리지 절: 새 메시지와 `videoShare` 플래그.
- 위키 `product/app-review-checklist.md`: 사진 추가 권한 문구, "사진 및 동영상 수집하지 않음" 문장을 사용자가 직접 저장·공유하는 경우와 구분. 위키 PR로 따로 올린다.

## 테스트

- `packages/types` 계약은 앱 `webBridge.test.ts`(파싱)와 웹 `bridge` 테스트로 검증한다: 필드 누락·타입 오류면 버린다.
- 앱 `videoTransfer` (expo-file-system·expo-media-library·react-native-share mock)
  - 조각을 순서대로 이어 쓰고, 순서가 어긋나면 `failed`
  - 조각 수가 맞지 않으면 `failed`
  - 저장: 권한 거부 → `denied`, 허용 → `saveToLibraryAsync` 호출 후 `saved`
  - 공유: 파일·본문을 넘기고 취소면 `dismissed`, 아니면 `shared`
  - 끝나면 임시 파일을 지운다
- `nativeBridgeHandler`: 세 메시지가 `videoTransfer`로 가고 결과가 `reply`로 나간다
- `remoteQueryParams`: `videoShare=1`
- `permissionCopy`: 새 iOS 문구와 Android 권한 목록
- 웹 `nativeVideo`
  - 플래그와 브리지가 있을 때만 `canUseNativeVideo()`가 참
  - Blob을 384KB씩 잘라 순서대로 보내고, 마지막에 조각 수와 함께 동작 메시지를 보낸다
  - 같은 id의 `video-result`로 끝나고, 다른 id는 무시한다
  - 저장은 120초가 지나면 `failed`
  - 공유 본문에 UTM이 붙은 설치 링크가 들어간다
- 실기기: 로컬 Dev Client로 iPhone·A23에서 저장(첫 권한 창 포함)·공유·권한 거부를 확인하고, 10MB 영상의 전달 시간을 잰다.

## 범위 밖

- 공유 다이얼로그·공유 시트 화면, 진행 표시, 거부 안내 문구 → BY-898
- 인스타그램·카카오톡 바로 공유 → BY-890
