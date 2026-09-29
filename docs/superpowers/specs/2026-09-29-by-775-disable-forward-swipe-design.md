# BY-775 iOS 웹뷰 앞으로가기 스와이프 제거 설계

## 목표

- iOS 탭 웹뷰에서 앞으로가기 가장자리 스와이프가 반응하지 않는다.
- 뒤로가기 스와이프와 이전 화면 미리보기(내비게이션 스냅샷)는 지금처럼 동작한다.

## 배경

- WKWebView의 `allowsBackForwardNavigationGestures`는 뒤로가기·앞으로가기 스와이프를 함께 켜고, 끄면 내비게이션 스냅샷 기록도 멈춘다(BY-680 실기기 확인).
- 그래서 스위치는 켜 둔 채 앞으로가기 쪽 가장자리 제스처 인식기만 끈다.

## 확정한 결정

| 항목              | 결정                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 위치         | 기존 `patches/react-native-webview@13.15.0.patch`를 확장한다. 앱 네이티브 모듈은 JS 호출 타이밍과 뷰 탐색 코드가 더해져 택하지 않았다 |
| 적용 범위         | 앱의 모든 웹뷰에 항상 적용한다. 앞으로가기가 필요한 화면이 없고 웹뷰는 `RemoteWebViewHost` 하나라 prop을 만들지 않는다                |
| 웹 `historyGuard` | 유지한다. 이 빌드 이전 앱과 브라우저 앞으로 버튼 대비다                                                                               |
| 방향              | `effectiveUserInterfaceLayoutDirection`이 RTL이면 왼쪽, 아니면 오른쪽 가장자리를 앞으로가기로 본다                                    |

## 구성

### 스파이크

- 패치에 임시 로그를 넣어 스위치를 켠 직후 WKWebView의 `gestureRecognizers`를 클래스와 `edges`로 찍는다.
- 통과 조건은 왼쪽과 오른쪽 가장자리 인식기가 따로 보이는 것이다.
- 통과하지 못하면 구현하지 않고 범위부터 다시 정한다.

### `RNCWebViewImpl.m` (패치)

- 앞으로가기 쪽 `UIScreenEdgePanGestureRecognizer`만 `enabled = NO`로 두는 함수를 추가한다.
- 웹뷰 생성 시 `allowsBackForwardNavigationGestures`를 넣은 직후와 `setAllowsBackForwardNavigationGestures:` 안에서 호출한다. 스위치를 다시 켤 때 WebKit이 인식기를 새로 만들기 때문이다.
- 인식기를 찾지 못하면 아무것도 바꾸지 않는다.

## 검증

- `webviewPatch.test.ts`에 패치가 앞으로가기 인식기 비활성화를 담고 있다는 단언을 추가한다.
- iOS 실기기에서 소셜 → 방 만들기 → 뒤로, 설정 → 프로필 → 뒤로 뒤의 앞으로가기 스와이프가 반응하지 않는지 본다.
- 같은 기기에서 뒤로 스와이프와 이전 화면 미리보기, 온보딩 가이드 잠금이 그대로인지 본다.
- 앱 빌드가 필요하고 BY-680 네이티브 수정과 같은 다음 빌드에 실린다.

## 결과

- 스파이크(iPhone 13 mini, iOS 26.6.1): `_webView.gestureRecognizers`에 `_UIParallaxTransitionPanGestureRecognizer`가 `edges=2`(왼쪽)와 `edges=8`(오른쪽)로 하나씩 붙어 있었다. `UIScreenEdgePanGestureRecognizer`의 하위 클래스라 공개 타입 검사로 잡힌다.
- 두 호출 시점에서 `enabled` 값이 0과 1로 달랐다. 시스템이 이 값을 바꿀 수 있어, 이동을 여러 번 반복한 뒤에도 앞으로가기가 꺼져 있는지 실기기에서 따로 확인했다.
- 실기기에서 소셜·설정 하위 화면을 오간 뒤의 앞으로가기 스와이프가 반복 후에도 반응하지 않았다. 뒤로 스와이프와 이전 화면 미리보기, 온보딩 가이드 잠금은 그대로였다.
