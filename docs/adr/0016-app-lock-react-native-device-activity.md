# 0016. 방해 앱 잠금은 react-native-device-activity를 어댑터 뒤에 둔다

- Status: Accepted
- Date: 2026-10-17
- Relates to: [ADR 0017 Android 방해 앱 잠금](./0017-android-app-lock-local-module.md), [BY-745 iOS 방해 앱 잠금 구현 설계](../superpowers/specs/2026-10-17-by-745-ios-app-lock-design.md), [BY-743 iOS 스크린타임 스파이크](../superpowers/specs/2026-10-13-by-743-ios-screen-time-spike-design.md), 위키 `product/screen-time/`

## 배경

공부하는 동안 사용자가 고른 앱을 잠그려면 iOS 스크린타임 API(FamilyControls, ManagedSettings, DeviceActivity)와 앱 확장 3개(DeviceActivityMonitor, ShieldConfiguration, ShieldAction)가 필요하다. 웹뷰는 이 API를 부를 수 없어서 네이티브가 맡아야 한다. BY-743 스파이크에서 react-native-device-activity(이하 RNDA) 0.6.1을 지금 앱 구성(Expo SDK 57, New Architecture, CNG)에 붙여 실기기로 권한 요청, 앱 고르기, 잠그기·풀기, 강제 종료 뒤 예약 해제, 재실행 정리, 권한 꺼짐 감지를 모두 확인했다.

## 결정

- RNDA 0.6.1을 버전 고정으로 쓰고, 라이브러리를 불러오는 곳은 `apps/mobile/lib/appLock/rnda.ts` 한 파일로 둔다.
- 그 파일은 `requireOptionalNativeModule`로 네이티브 모듈을 확인한 뒤에만 `require`해서 Android와 Jest, 모듈이 없는 옛 Dev Client에서 throw하지 않는다.
- 언제 잠글지는 세션을 가진 웹이 정하고, 네이티브는 브리지 `app-lock-*` 메시지를 받아 실행한다. 가속도 센서와 같은 경로다.
- 웹은 셸이 웹뷰 주소에 싣는 `appLock=1`이 있을 때만 설정 행을 보이고 잠금을 요청한다.
- iOS 18 이상에서만 켤 수 있게 한다. config plugin이 확장 3개를 iOS 18.0으로 만들어서, 그 아래 기기에서는 잠금만 걸리고 안전 해제 예약이 돌지 않을 수 있다.
- 잠글 때는 12시간 뒤 끝나는 안전 해제 예약을 먼저 걸고 잠근다. 예약이 실패하면 잠그지 않는다.
- 앱 프로세스가 새로 시작되면 남은 잠금과 예약을 지운다. 새 프로세스에는 진행 중인 공부가 없다.
- 권한은 `approved`일 때만 허용으로 보고, 처음 허용받을 때 기기 보안 저장소에 기록을 남겨 설정에서 끈 경우를 가른다. iOS는 끈 권한을 거부가 아니라 미결정으로 되돌린다.
- App Group은 번들 id를 따라 `group.com.breathlessyouth.mobile{,.staging,.dev}`로 나눈다.
- config plugin이 prebuild마다 다시 복사하는 `apps/mobile/targets/`는 커밋하지 않는다.

## 검토한 대안

- **로컬 Expo 모듈 + `@bacons/apple-targets`**: 라이브러리 관리 상태에 기대지 않아도 되지만 확장 3개와 선택 화면을 직접 만들어야 하고, SDK 57 지원은 2026-10 기준 초안 PR이었다.
- **`expo-app-blocker`**: 반년 된 신생 라이브러리라 실기기 검증 사례가 없다.
- **앱 최소 iOS를 18.0으로 올리기**: 잠금을 쓰지 않는 iOS 16·17 사용자가 앱을 받을 수 없게 된다.
- **확장 최소 iOS를 16.4로 낮추기**: iOS 16·17 실기기에서 잠금·예약·잠금 화면을 다시 확인해야 하고 그 기기가 없다.

## 결과와 제약

- 고른 앱의 선택 토큰은 기기 App Group 안에만 있다. 브리지, 로그, 분석 이벤트, 서버에는 앱 개수와 카테고리 개수만 오간다.
- 네이티브 코드와 확장이 들어가 Dev Client와 스토어 빌드를 다시 만들어야 켜진다.
- App Group은 명령줄 자동 서명이 만들지 않아서 Apple Developer에 환경마다 직접 등록하고 앱과 확장 App ID에 배정해야 한다. 확장 App ID마다 Family Controls (Distribution)도 필요하다.
- RNDA는 0.6.1 이후 갱신이 없다. 문제가 생기면 `rnda.ts`만 로컬 모듈로 바꾼다.
- 예약 끝 신호가 오지 않았다는 포럼 보고가 있어서 재실행 정리는 대비책이 아니라 필수 경로다.
- 12시간 안전 해제는 12시간보다 긴 공부에서도 잠금을 끝낸다. 강제 종료 뒤 잠금이 남지 않는 쪽을 택한 결과다(ST-D13).

## 업그레이드 때 확인할 것

- 라이브러리에 선택을 지우는 함수가 없어서 `appLock.ts`의 선택 지우기가 App Group 키 `familyActivitySelectionIds`를 직접 고친다. RNDA를 올릴 때는 이 키 이름과 저장 형식이 그대로인지 실기기에서 확인한다.
