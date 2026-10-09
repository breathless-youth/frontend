# 0014. 웹뷰가 만든 영상은 조각으로 앱에 넘겨 저장·공유한다

- Status: Accepted
- Date: 2026-10-08
- Relates to: [타임랩스 영상 저장·공유 브리지 설계](../superpowers/specs/2026-10-08-BY-899-timelapse-video-bridge-design.md), [ADR 0013](./0013-timelapse-photo-storage-exception.md), 위키 `product/specs/BY-822-타임랩스.md`

## 배경

타임랩스 mp4는 웹이 만들어 IndexedDB에 둔다(BY-897). 사진 앱에 저장하는 일은 웹뷰가 할 수 없고, Android 웹뷰에는 `navigator.share`가 없어 파일 공유도 앱이 맡아야 한다. 브리지는 문자열만 오가므로 영상 바이트를 base64로 바꿔 넘겨야 하는데, 10MB 영상은 13MB 문자열이 된다.

## 결정

- 웹은 영상을 원본 384KB씩 잘라 base64로 바꾼 `video-chunk`를 `seq` 0부터 차례로 보낸다.
- 앱은 조각을 `Paths.cache`의 `timelapse-{id}.mp4`에 이어 쓴다(expo-file-system).
- 웹은 마지막에 `video-save` 또는 `video-share`로 조각 수를 알리고, 앱은 같은 `id`를 담은 `video-result`로 답한다.
- 조각 순서가 어긋나거나 받은 조각 수가 다르면 앱은 저장·공유를 시도하지 않고 `failed`로 답한다.
- 저장은 끝나면 결과와 관계없이 임시 파일을 바로 지운다.
- 공유는 끝나도 임시 파일을 바로 지우지 않는다. Android의 공유 시트는 사용자가 대상 앱을 고른 순간 결과를 돌려주므로, 그때 지우면 대상 앱이 파일을 읽지 못한다.
- 공유가 남긴 파일은 다음 전달의 첫 조각이 올 때 지운다. 이때 진행 중인 `id`의 파일은 남기고 다른 `id`의 `timelapse-*.mp4`만 지운다.
- 앱이 시작할 때도 같은 정리를 한 번 돌린다. 시작 시점에는 진행 중인 `id`가 없어 지난 실행이 남긴 사본이 모두 지워진다.
- 사진 앱 저장은 expo-media-library의 `saveToLibraryAsync`를 쓰고 iOS에서는 사진 추가(write-only) 권한만 묻는다.
- OS 공유는 react-native-share 12.3.1의 `Share.open`으로 파일과 설치 링크 본문을 함께 넘긴다.
- 권한 거부는 `denied`로만 알리고 안내와 설정 열기는 웹 다이얼로그가 맡는다.
- 웹은 저장·공유 모두 시간 제한 없이 앱의 결과를 기다린다. 앱은 실패해도 `failed`로 답한다.
- 조각이나 요청을 브리지에 넘기지 못하면 웹은 기다리지 않고 바로 `failed`로 끝낸다.
- 앱은 웹뷰 URL에 `videoShare=1`을 붙이고, 웹은 이 표시가 있을 때만 이 경로를 쓴다.

## 검토한 대안

- **한 번에 전달**: 코드는 가장 짧지만 13MB 문자열이 웹·네이티브·JS에 동시에 떠 저사양 기기에서 메모리를 압박한다.
- **Android는 expo-sharing으로 파일만 공유**: 새 의존성이 Expo 공식 모듈뿐이지만 Android에서 설치 링크 본문이 빠진다.
- **공유 뒤에도 임시 파일을 바로 지우기**: 코드는 저장과 같아지지만 Android에서 대상 앱이 파일을 읽기 전에 사라진다.

## 결과와 제약

- 새 네이티브 모듈 두 개(expo-media-library, react-native-share)가 들어가 Dev Client와 스토어 빌드를 다시 만들어야 한다.
- expo-media-library 57은 패키지 루트에서 가져온 `saveToLibraryAsync` 같은 옛 함수가 실행 중에 throw하므로 `expo-media-library/legacy`에서 불러온다.
- react-native-share는 불러오는 순간 네이티브 모듈을 찾으므로 앱은 공유할 때만 이 패키지를 불러온다.
- react-native-share의 인스타그램 공유 코드가 사진 보관함 API를 참조해, 읽기 권한을 요청하지 않아도 iOS에 `NSPhotoLibraryUsageDescription`이 있어야 한다(react-native-share 이슈 #1783).
- react-native-share 플러그인은 옵션이 없어도 빈 객체를 넘겨야 한다(문자열만 적으면 `props.android`를 읽다 `TypeError`가 난다). 이 플러그인은 안에서 expo-build-properties를 다시 부르므로 우리 `expo-build-properties` 항목보다 뒤에 둔다.
- expo-media-library 플러그인이 넣는 사진·영상 읽기 권한은 `android.blockedPermissions`로 막고 저장용 `WRITE_EXTERNAL_STORAGE`만 남긴다. 같은 플러그인이 `android:requestLegacyExternalStorage="true"`도 넣는다.
- expo-media-library는 Android 12 이하에서 저장 전에 `WRITE_EXTERNAL_STORAGE`를 런타임에 요청하므로 이 권한은 유지하고, Play의 사진·영상 권한 정책이 보는 `READ_MEDIA_*` 읽기 권한만 막는다.
- `id`는 캐시 파일 이름에 그대로 들어가므로 앱 파서는 `crypto.randomUUID()` 모양만 받고 나머지는 버린다.
- 앱이 도중에 꺼져 남은 임시 파일은 다음 앱 시작이나 다음 전달의 첫 조각 때 지워진다. 웹 쪽에서 중단된 전달(조각 읽기 실패나 문서 재로드로 `video-save`·`video-share`가 끝내 오지 않는 `id`)도 같은 경로로 정리한다. 조각은 초 단위로 이어 오므로 마지막 조각 뒤 2분이 지난 `id`는 중단된 것으로 보고 다음 전달의 첫 조각에서 파일과 순번 기록을 함께 지운다. 요청이 들어온 `id`는 공유 시트가 오래 열려 있어도 이 판정에서 빠진다.
- 캐시의 `timelapse-{id}.mp4`는 ADR 0013이 정한 IndexedDB 밖에 생기는 두 번째 사본이라, 이 ADR이 0013의 보관 위치를 앱 캐시까지 넓힌다.
- 이 사본은 앱 샌드박스 안에만 있고 서버로 가지 않는다.
- 저장 사본은 끝나는 즉시 지워지지만 공유 사본은 다음 앱 시작이나 다음 전달의 첫 조각 때까지 남아 ADR 0013의 7일 기한이 적용되지 않는다.
- 그래서 처리방침과 앱 심사 소명에 영상이 IndexedDB에만 있다고 적지 않는다.
