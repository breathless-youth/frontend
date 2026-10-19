# 0017. Android 방해 앱 잠금은 로컬 Expo 모듈의 포그라운드 서비스와 오버레이로 한다

- Status: Accepted
- Date: 2026-10-18
- Relates to: [BY-746 Android 방해 앱 잠금 구현 설계](../superpowers/specs/2026-10-18-by-746-android-app-lock-design.md), [ADR 0016](./0016-app-lock-react-native-device-activity.md), [ADR 0015](./0015-timelapse-direct-share-local-module.md), 위키 `product/screen-time/decisions.md` ST-D16

## 배경

Android에는 iOS 스크린타임처럼 다른 앱을 막는 공개 API가 없다. 위키 ST-D16은 사용정보 접근, 다른 앱 위에 표시, 포그라운드 서비스로 0.5초마다 앞에 뜬 앱을 확인하는 방식을 정했다. 이 방식을 감싼 라이브러리 `expo-app-blocker`는 0.1.x라 실기기 검증 사례가 없고, 루트 `CLAUDE.md`는 검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 않게 한다. iOS 쪽은 ADR 0016으로 웹 화면과 브리지 `app-lock-*` 규칙을 이미 정했다.

## 결정

- `apps/mobile/modules/app-lock`에 Android 전용 로컬 Expo 모듈 `AppLock`을 두고 Kotlin으로 권한 확인, 설정 화면 열기, 런처 앱 목록, 선택 저장, 잠금 서비스 시작·정지를 만든다.
- JS는 `requireOptionalNativeModule`로 불러와 iOS, Jest, 모듈이 없는 옛 Dev Client에서는 null로 받는다.
- 웹 화면과 브리지 메시지는 iOS와 같게 두고, `apps/mobile/lib/appLock/appLock.ts`가 플랫폼에 따라 RNDA와 이 모듈로 나눈다. 릴레이는 바꾸지 않는다.
- Android 8(API 26) 이상에서만 켤 수 있게 한다. 오버레이 창 종류 `TYPE_APPLICATION_OVERLAY`가 26부터 있다.
- 두 권한(사용정보 접근, 다른 앱 위에 표시)이 모두 있어야 허용으로 본다. OS 권한 창이 없어서 RN 고지 화면이 설정을 열고, 앱으로 돌아올 때마다 다시 확인한다.
- 잠금은 `specialUse` 포그라운드 서비스가 맡는다. 서비스는 앱과 같은 프로세스에서 돌고 `stopWithTask`라서, 앱이 죽거나 최근 앱에서 지워지면 함께 끝난다. 그래서 iOS 같은 안전 해제 예약은 두지 않고 서비스 안에 6시간 마감만 둔다(iOS 안전 해제와 같은 값, 2026-10-20 12시간에서 줄임). 마감은 기기가 잠든 시간까지 세는 시계로 잰다.
- 잠금 해제는 `stopService`로 바로 내리지 않고 `startService`로 서비스에 해제 명령을 보낸다. 시작 직후 해제가 오면 서비스가 `startForeground`를 부르기 전에 내려가 Android가 앱을 죽이기 때문이다. 시작 명령은 맨 앞에서 `startForeground`를 부르고, 서비스는 명령마다 앱 프로세스에 하나 있는 요청 상태를 보고 계속 돌지 정한다.
- 앱 목록은 `QUERY_ALL_PACKAGES` 대신 `<queries>`의 런처 인텐트로만 조회한다. 기본 홈 앱과 포메는 목록에서 빼고 잠그지도 않는다. 홈 앱을 알아내려고 홈 인텐트도 `<queries>`에 둔다. 접근성 서비스는 쓰지 않는다.
- 배터리 최적화 예외는 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`를 쓰지 않고 이 앱의 앱 정보 화면(`ACTION_APPLICATION_DETAILS_SETTINGS`)만 연다. 그 화면이 없는 기기면 배터리 최적화 목록 화면을 연다.

## 검토한 대안

- **`expo-app-blocker`**: 같은 방식을 감쌌지만 0.1.x이고 SDK 57·New Architecture 실기기 확인이 없다.
- **접근성 서비스**: 앞 앱 감지가 즉시 되고 제조사 종료에 강하지만 Play 접근성 신고서가 필요하고 Android 17 고급 보호 모드에서 권한을 잃는다(ST-D16).
- **잠금 화면을 RN 화면으로 그리기**: 다른 앱 위에 띄울 창에서 React 화면을 돌리려면 별도 React 루트가 필요해서, 문구 몇 줄짜리 화면은 Kotlin 뷰로 그린다.

## 결과와 제약

- 고른 앱 목록(패키지 이름)은 기기의 앱 저장소에만 있고, 자동 백업과 기기 이전에서 빠지는 자리(`noBackupFilesDir`)에 둔다. 앱 이름과 아이콘은 RN 고르기 화면 안에서만 쓰고, 브리지·로그·분석 이벤트·서버에는 고른 앱 개수만 오간다. 사용 기록은 앞에 뜬 앱을 확인하는 데만 읽고 저장하지 않는다.
- 삼성·샤오미처럼 배터리를 아끼려고 앱을 멈추는 기기에서는 서비스가 멈추면 공부 중에도 잠금이 풀린다. 처음 켤 때 한 번 예외 설정을 안내하고, 풀리는 비율은 출시 뒤에 측정한다(ST-D16).
- Android 13 이상은 알림 권한이 없으면 서비스 알림이 알림창에 보이지 않는다. `POST_NOTIFICATIONS`는 firebase-messaging이 이미 매니페스트에 넣지만, 앱 어디에서도 요청하지 않는다(RNFB의 Android `requestPermission`은 묻지 않고 허용으로 답한다). 그래서 사용자가 알림을 직접 켜기 전까지 "공부 중 · 방해 앱 N개 잠김" 알림은 작업 관리자에서만 보이고, 잠금 동작에는 영향이 없다. 요청은 앱 전체 알림 권한 정책과 함께 정한다.
- 시각 변경, 재부팅, 분할 화면 감지(ST-D20)는 아직 없다. 재부팅하면 서비스가 끝나 잠금이 풀리고, 권한을 끄면 다음 조회 때 `revoked`로 처리한다.
- Play Console에 `specialUse` 포그라운드 서비스 신고(설명, 중단될 때의 영향, 시연 영상)를 내야 한다(BY-747).
- 네이티브 코드가 들어가 Dev Client와 스토어 빌드를 다시 만들어야 켜진다.
