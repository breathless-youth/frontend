# BY-1059 Android 프로필 사진 네이티브 선택기 설계

- 티켓: BY-1059 (스토리 BY-1031)
- 선행: BY-1037 웹 업로드(frontend#372)
- 위키: `.ai/product/specs/BY-404-룸-참여.md` "프로필 사진"

## 목표

Android 앱 안에서 `사진 바꾸기`를 누르면 Android 시스템 사진 선택기를 열고, 앱이 고른 사진을 512px JPEG로 줄여 웹에 넘긴다. 웹은 받은 JPEG를 BY-1037 업로드 흐름으로 그대로 올린다.

## 배경

A23(Android 14, WebView 156)에서 카메라로 찍은 사진(약 15MB, 8160×6120)은 웹뷰의 파일 입력으로 받은 `File`을 어떤 방법으로도 읽지 못했다(`NotReadableError`). 웹 코드로 우회할 수 없어 네이티브에서 사진을 읽는다.

## 결정

| 항목      | 결정                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 방식 | `modules/app-lock`처럼 Android 전용 로컬 Expo 모듈을 만든다. 새 의존성은 없고 iOS 빌드는 바뀌지 않는다                                              |
| 사진 읽기 | 원본 크기를 먼저 읽고 `inSampleSize`로 줄여 디코드한다. 50MP 사진을 원본 그대로 디코드하면 약 200MB라 메모리 부족으로 앱이 죽을 수 있다             |
| 선택기    | Android 시스템 사진 선택기(`PickVisualMedia`, 이미지만)만 연다. 카메라를 바로 켜는 메뉴는 없다. 권한이 필요 없어 `blockedPermissions`를 그대로 둔다 |
| 전달      | 512px JPEG를 base64 문자열로 바꿔 메시지 하나로 보낸다. 요청 `id`로 요청과 응답을 짝짓는다                                                          |
| 옛 앱     | 앱이 `profilePhotoPicker=1` 기능 플래그를 보낸다. 플래그가 없으면(옛 Android 앱, iOS, 브라우저) 지금처럼 웹 파일 선택기를 쓴다                      |
| 진행 표시 | 선택기를 연 순간부터 응답이 올 때까지 아바타 진행 표시를 띄운다. 대기 시간 제한은 두지 않는다                                                       |
| 취소      | 아무 일도 일어나지 않는다. 토스트와 분석 이벤트도 남기지 않는다                                                                                     |
| 실패      | `이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요` 토스트, `profile_image_upload_failed`의 `reason`은 `unusable`                                     |
| 출시      | Android 앱 새 버전을 EAS 클라우드로 빌드해 출시한다. iOS는 다시 빌드하지 않는다                                                                     |

## 브리지 메시지

`packages/types/src/bridge.ts`에 추가한다.

```ts
// web → native
{ type: "pick-profile-photo"; id: string }

// native → web
| { type: "profile-photo-result"; id: string; status: "picked"; data: string } // base64 JPEG
| { type: "profile-photo-result"; id: string; status: "cancelled" | "failed" }
```

- 앱 `parseToNativeMessage`와 웹 `parseToWebMessage`는 화이트리스트라 두 메시지를 각각 추가한다.
- 앱과 웹의 `forLog`에서 `data`를 길이만 남기고 가린다.

## 앱 (`apps/mobile`)

### `modules/profile-photo-picker`

- `expo-module.config.json`의 `platforms`는 `["android"]`다.
- `index.ts`는 `requireOptionalNativeModule("ProfilePhotoPicker")`로 불러 iOS, Jest, 옛 Dev Client에서는 `null`이다.
- 함수 하나만 둔다: `pick(): Promise<string | null>`. 고르면 base64 JPEG, 취소하면 `null`, 실패하면 reject한다.
- Kotlin 처리 순서:
  1. `PickVisualMedia(ImageOnly)` 결과 URI를 받는다. 취소면 `null`이다.
  2. `inJustDecodeBounds`로 크기만 읽고, 짧은 변이 512 이상으로 남는 가장 큰 2의 거듭제곱을 `inSampleSize`로 정한다.
  3. 줄여서 디코드한다.
  4. `ExifInterface`의 방향 값으로 회전·뒤집기를 적용한다.
  5. 가운데 정사각형을 잘라 512×512로 맞춘다.
  6. JPEG 품질 85로 압축해 `Base64.NO_WRAP` 문자열로 돌려준다.
- 디코드와 압축은 메인 스레드 밖에서 한다.
- 샘플 크기 계산은 순수 함수로 빼서 `AppLockRulesTest`처럼 JVM 단위 테스트를 둔다.

### 연결

- `remoteQueryParams.ts`: `Platform.OS === "android"`이고 모듈이 있을 때만 `profilePhotoPicker=1`을 붙인다.
- `nativeBridgeHandler.ts`: `pick-profile-photo`를 받으면 `pick()`을 부르고 결과를 `profile-photo-result`로 답한다. 모듈이 없거나 reject되면 `failed`로 답한다.

## 웹 (`apps/web`)

### `lib/nativeProfilePhoto.ts`

- `canUseNativeProfilePhoto()`: 처음 불렸을 때 URL의 `profilePhotoPicker` 플래그를 읽어 모듈 안에 저장한다. 앱 안에서 화면을 이동하면 쿼리가 사라지기 때문이며, `nativeVideo.ts`의 `canUseNativeVideo`와 같은 방식이다.
- `pickNativeProfilePhoto(): Promise<Blob | null>`: 먼저 구독하고 요청을 보낸 뒤 같은 `id`의 응답을 기다린다. `picked`면 `image/jpeg` Blob, `cancelled`면 `null`이다. `failed`면 `UnusablePhotoError`를 `throw`한다.

### 프로필 사진 흐름

- `useProfilePhotoMutations`의 올리기 입력을 `File` 또는 "앱에서 고르기"로 받는다.
  - `File`이면 지금처럼 `prepareProfilePhoto`를 거친다.
  - 앱에서 고르기면 `pickNativeProfilePhoto()`의 Blob을 줄이는 단계 없이 쓴다.
  - 그다음 `requestUploadUrl(blob.size)`, `uploadPhoto`, `registerProfileImage`는 같다.
  - 취소는 결과 `null`로 끝내고 캐시, 토스트, 분석 이벤트를 건드리지 않는다.
- 선택기를 기다리는 시간도 mutation 안이라 `busy`가 그동안 켜져 진행 표시가 보인다.
- `ProfilePhotoButton`의 `사진 바꾸기`는 `canUseNativeProfilePhoto()`면 앱에서 고르기로 올리기를 시작하고, 아니면 지금처럼 파일 입력을 연다.

## 테스트

- 웹(vitest)
  - `parseToWebMessage`가 `profile-photo-result` 세 상태를 받고 모양이 틀린 메시지는 버린다.
  - `pickNativeProfilePhoto`: `picked`는 JPEG Blob, `cancelled`는 `null`, `failed`는 `UnusablePhotoError`, 다른 `id`의 응답은 무시한다.
  - `canUseNativeProfilePhoto`: 플래그가 있을 때만 참이고 쿼리가 사라진 뒤에도 유지된다.
  - 올리기: 앱에서 고른 Blob은 `prepareProfilePhoto`를 거치지 않고 업로드되며, 취소면 API를 부르지 않고 토스트도 없다.
  - 버튼: 플래그가 있으면 `사진 바꾸기`가 파일 입력 대신 앱 선택기를 부른다.
- 앱(jest)
  - `parseToNativeMessage`가 `pick-profile-photo`를 받는다.
  - 핸들러가 `pick()` 결과를 세 상태로 답하고, 모듈이 없으면 `failed`다.
  - `profilePhotoPicker` 플래그는 Android에서 모듈이 있을 때만 붙는다.
- Kotlin: 샘플 크기 계산 단위 테스트
- 실기기(A23, 로컬 Dev Client 빌드): 카메라로 방금 찍은 사진, 갤러리 사진, 스크린샷, 세로·가로 사진의 방향, 취소, 같은 사진 다시 고르기. iPhone은 웹 파일 선택기가 그대로인지 확인한다.

## 범위 밖

- iOS 네이티브 선택기
- 자르는 위치를 고르는 편집
- Android 앱 출시 절차 자체(릴리즈 작업에서 한다)
