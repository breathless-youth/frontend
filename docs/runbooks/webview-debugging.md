# 웹뷰 디버깅 런북

모바일 앱은 모든 화면을 원격 URL 웹뷰로 연다([ADR 0001](../adr/0001-webview-based-study-room-architecture.md)). 화면 안은 결국 웹이라 웹 개발자가 쓰던 도구를 그대로 쓰는 것이 가장 빠르다. 이 문서는 웹뷰에서 문제를 발견했을 때 어디부터 보는지 순서대로 설명한다.

## 먼저 문제를 웹과 브리지·네이티브로 가른다

웹뷰가 여는 주소를 데스크톱 브라우저에서 그대로 연다. 거기서 재현되면 웹 자체 문제이고, 안 되면 브리지나 네이티브 문제다. 웹 dev 서버를 띄우는 절차는 [device-web-dev-server 런북](./device-web-dev-server.md)에 있다.

`getUserMedia`는 secure context를 요구한다. iOS 실기기는 https, Android는 localhost일 때만 http가 인정된다. 이 조건이 안 맞으면 카메라가 안 켜진다.

## 인스펙터로 실제 웹뷰에 붙는다

개발 빌드는 `webviewDebuggingEnabled={__DEV__}`가 켜져 있어 실제 웹뷰에 데스크톱 개발자 도구를 붙일 수 있다.

> 콘솔·네트워크·요소·중단점을 모두 사용 가능하다.

- iOS: Mac Safari의 개발자 메뉴에서 연결된 기기의 WKWebView를 고른다. iOS 16.4 이상은 웹뷰가 인스펙터 대상이어야 목록에 뜨는데, 개발 빌드는 위 prop으로 켜져 있다.
- Android: 데스크톱 Chrome 주소창에 `chrome://inspect/#devices`를 열어 USB로 연결된 WebView의 inspect를 누른다.

> 운영 빌드에서는 인스펙터가 붙지 않는다. 운영 이슈는 Sentry(에러·세션 리플레이, 카메라 차단)와 Amplitude 이벤트로 뒤에서 추적한다.

## 브리지 개발 로그를 읽는다

개발 빌드에서 나가는 메시지를 `[webview-bridge]` 접두사로 찍는다.

- 네이티브 로그는 Metro 콘솔에서 본다. iOS는 Xcode 콘솔, Android는 `adb logcat`에서도 보인다.
- 웹 로그는 위 인스펙터의 콘솔에서 본다.
- 파싱하지 못해 버린 메시지는 `파싱하지 못해 버린 메시지`와 원문이 함께 찍힌다. 웹과 네이티브의 메시지 타입 정의가 어긋났는지 여기서 알 수 있다.
- 처리 case가 없는 타입은 `처리 case가 없는 type`으로 찍힌다 (파싱은 됐는데 반응 switch에 case가 없을 때다).

## 프로덕션 빌드로 재현한다

Vite dev는 HMR로 CSS를 주입하는 방식이 실제 빌드와 다르다. 첫 페인트나 테마 번쩍임 같은 문제는 dev 서버에서 재현되지 않는다. 이런 문제는 `pnpm --filter web build` 산출물이나 EAS 빌드로 확인한다.

## 참고 사항

- 웹뷰가 실제로 보내는 TLS 트래픽까지 보려면 Proxyman이나 Charles를 시스템 프록시로 걸고 기기에 CA를 신뢰하게 한다.
- 데스크톱을 붙일 수 없는 환경에서는 `eruda`나 `vConsole`을 개발 빌드에만 주입해 화면 안에 콘솔을 띄운다. 인스펙터가 붙을 때는 쓰지 않는다.
- 웹뷰 밖 React Native 자바스크립트는 Metro에서 `j`로 여는 React Native DevTools로 본다. 이건 웹뷰 컨텐츠가 아니라 셸을 본다.
