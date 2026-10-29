# BY-1037 프로필 사진 업로드와 표시 설계

- 티켓: BY-1037 (스토리 BY-1031)
- 선행: BY-1035 백엔드(backend#106), BY-1036 공용 Avatar, BY-1033 시안
- 위키: `.ai/product/specs/BY-404-룸-참여.md` "프로필 사진", `BY-819-랭킹.md`

## 목표

프로필 수정 화면에서 사진을 올리고 삭제할 수 있게 하고, 프로필·소셜룸·랭킹 아바타에 사진을 보여 준다.

## 결정

| 항목           | 결정                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 메뉴           | `사진 바꾸기`, 사진이 있을 때만 `사진 삭제`. 삭제는 확인 없이 바로 처리한다                                                 |
| 용량 안내      | 숫자를 보여 주지 않는다. 원본 20MB 초과, 읽을 수 없는 형식, 화질을 낮춰도 1MB 초과는 모두 "쓸 수 없는 사진" 하나로 안내한다 |
| 옛 도메인      | `web.sunqstudio.kr`은 손대지 않는다. 그 도메인에서는 사진 대신 이니셜이 보이고, 편집 가능 여부는 아래 토큰 규칙을 따른다    |
| 토큰 없는 문서 | 옛 앱 셸이나 브라우저 단독처럼 토큰이 없는 문서에서는 업로드가 401로 실패하므로 아바타만 보이고 편집 배지와 메뉴를 숨긴다   |
| 앱             | mobile 코드는 바꾸지 않는다. 실기기에서 웹뷰 파일 선택기가 열리는지 확인하고, 안 열리면 다시 상의한다                       |
| 이미지 처리    | 메인 스레드에서 한다. 한 번에 한 장이라 Worker는 두지 않는다                                                                |

## 토스트 문구

모두 `showCtaToast`로 하단 `저장하기` 버튼 위에 띄운다.

| 상황               | 문구                                            |
| ------------------ | ----------------------------------------------- |
| 올리기 성공        | 프로필 사진을 바꿨어요                          |
| 삭제 성공          | 프로필 사진을 삭제했어요                        |
| 네트워크·서버 실패 | 사진을 올리지 못했어요. 다시 시도해 주세요      |
| 쓸 수 없는 사진    | 이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요 |
| 삭제 실패          | 잠시 후 다시 시도해 주세요                      |

## API

세 경로 모두 `API-Version: 1`이다.

| 이름                    | 요청                                                              | 응답                            |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------- |
| `profileImageUploadUrl` | `POST /api/users/me/profile-image/upload-url` `{ contentLength }` | `{ uploadUrl, key, expiresAt }` |
| `profileImage`          | `PUT /api/users/me/profile-image` `{ key }`                       | `ProfileResponse`               |
| `profileImage`          | `DELETE /api/users/me/profile-image`                              | `ProfileResponse`               |

- S3 업로드는 `apiFetch`가 아니라 `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })`로 한다. `apiFetch`는 `API-Version` 헤더를 붙이는데, 이 헤더는 서명에 없어 S3가 요청을 거부할 수 있다.
- 서명에 `Content-Length`가 들어 있으므로 `contentLength`에는 올릴 Blob의 `size`를 그대로 보낸다.

## 타입

- `API_ENDPOINTS`에 `profileImageUploadUrl`, `profileImage`를 버전 `"1"`로 추가한다.
- `ProfileResponse`, `RoomMember`, `RankingEntry`, `RankingNeighbor`, `RankingDayGroup`에 `profileImageUrl?: string | null`을 추가한다.

## 사진 준비 (`features/profile/prepareProfilePhoto.ts`)

```ts
export class UnusablePhotoError extends Error {}
export async function prepareProfilePhoto(file: File): Promise<Blob>;
```

1. `file.size`가 20MB를 넘으면 읽지 않고 `UnusablePhotoError`.
2. `createImageBitmap(file, { imageOrientation: "from-image" })`로 읽는다. 실패하면 `UnusablePhotoError`.
3. 짧은 변 기준으로 가운데 정사각형을 잘라 512×512 canvas에 그린다.
4. JPEG 품질 0.85로 만든다. 1MB를 넘으면 0.7로 한 번 더 만들고, 그래도 넘으면 `UnusablePhotoError`.

## 화면

### `ProfilePhotoButton`

- 72px 아바타와 편집 배지를 담은 버튼이다. 터치 영역은 44px 이상이고 `aria-label`은 `프로필 사진 변경`이다.
- 숨긴 `<input type="file" accept="image/*">`를 품는다. 같은 파일을 다시 고를 수 있게 고른 뒤 `value`를 비운다.
- 올리는 동안 아바타 위에 스피너를 보이고 버튼을 비활성화한다.

### `ProfilePhotoSheet`

- Base UI Drawer를 lazy 모듈로 불러오는 기존 관례(`lazyWithPreload`)를 따른다.
- 제목은 `프로필 사진`, 항목은 `사진 바꾸기`와 사진이 있을 때만 보이는 `사진 삭제`다.
- `사진 바꾸기`는 시트를 닫고 파일 입력을 연다. 파일 입력은 사용자 탭 안에서 `click()`해야 하므로 시트 항목의 클릭 핸들러에서 바로 부른다.

### `useProfilePhotoMutations`

- 올리기: `prepareProfilePhoto` → `requestUploadUrl(blob.size)` → `uploadPhoto` → `registerProfileImage(key)`.
- 삭제: `deleteProfileImage()`.
- 성공하면 프로필 캐시를 `setQueryData(profileKeys.detail(userId), prev => ({ ...prev, profileImageUrl }))`로 갱신한다. 프로필 폼의 입력 중인 값은 건드리지 않는다.
- 실패 분류는 `UnusablePhotoError`면 `unusable`, `fetch`가 던지면 `network`, 그 밖의 응답 오류는 `server`다.

### 사진 표시

- `ProfileAvatar`, `RankAvatar`, `RoomAvatarFallback`에 `imageUrl?: string | null`을 받고, 값이 있으면 `AvatarImage`를 그린다. 불러오지 못하면 이니셜이 남는다.
- 랭킹은 시상대(`PodiumRow` 생성 두 곳에 필드 추가)와 주변 목록에 보인다. 일수 판 목록은 지금도 아바타가 없어 그대로 둔다.
- 소셜룸은 카메라를 끈 타일(`RoomTile`의 `RoomAvatarFallback`)에 보인다.

## 1036에서 넘어온 일

- `AvatarImage`가 `alt`를 받지 않고 항상 `alt=""`를 쓴다.
- `avatar.test.tsx`의 실패 테스트를 `waitFor`로 보강한다.
- `RankAvatar`의 "사진은 오지 않아" 주석을 고친다.

## 개발 환경

- `vite.config.ts`의 `devApiProxy()`에 `/avatars`를 `https://web-dev.focusmakers.app`으로 넘기는 항목을 더한다. `DEV_API_PROXY_TARGET`이 있을 때만 켜진다.

## 분석 이벤트

| 이벤트                        | 시점        | 속성                                        |
| ----------------------------- | ----------- | ------------------------------------------- |
| `profile_image_upload`        | 등록 성공   | 없음                                        |
| `profile_image_remove`        | 삭제 성공   | 없음                                        |
| `profile_image_upload_failed` | 올리기 실패 | `reason`: `unusable` · `network` · `server` |

## 함께 고칠 문서

- Figma 메뉴 시트(라이트·다크)의 `기본 이미지로`를 `사진 삭제`로 바꾼다.
- 위키 `BY-404-룸-참여.md`의 "`기본 이미지로`를 고르면" 문장을 "사진을 삭제하면"으로 고친다(별도 위키 PR).
- Jira BY-1037 본문을 이 설계에 맞춘다.

## 범위 밖

- 웹뷰 파일 선택기가 안 열릴 때의 `expo-image-picker` 대체.
- 앱 안 신고(BY-1039), 미등록 업로드 정리(BY-1050).
- 일수 판 목록 아바타.

## 검증

- 단위·컴포넌트 테스트(vitest, jsdom).
- 실기기(iPhone, A23) Dev Client로 파일 선택기, 올리기, 삭제, 토스트, 랭킹·소셜룸 표시를 확인한다. 실제 업로드는 스테이징 권한이 들어간 뒤 확인한다.
