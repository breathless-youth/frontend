# 웹뷰 디버깅 기반: 브리지·로드 수명 개발 로그와 디버깅 절차 문서

## 배경

- 브리지 파서가 모르는 메시지를 아무 흔적 없이 버린다. 네이티브 `parseToNativeMessage`와 웹 `parseToWebMessage`가 JSON 오류·모르는 type·필드 미달을 전부 `null`로 돌려주고, 호스트는 `null`이면 그냥 넘어간다. 개발 중에도 스펙 어긋남이 보이지 않는다.
- BY-623 조사에서 효과가 있던 방법(색 실험, `onLayout` 측정, 터널 경유 Metro, 브라우저 단독 재현)이 문서로 남지 않고 대화에만 있었다.
- 인스펙터 연결(`webviewDebuggingEnabled={__DEV__}`)은 BY-616에서 이미 들어가 있어 이 티켓 범위가 아니다.

## 결정

- 개발 빌드 전용 로그만 넣는다. 네이티브는 `__DEV__`, 웹은 `import.meta.env.DEV`로 가른다. 운영 빌드에는 로그가 없다.
- 버려지는 메시지는 파서 안이 아니라 호스트 경계에서 찍는다. 파서(`parseToNativeMessage`, `parseToWebMessage`)는 순수 함수로 두고 단위 테스트가 조용해야 한다. 원문이 있는 곳은 호출부다.
- 네이티브→웹 발신은 `injectJavaScript(injectMessageScript(...))` 호출부 여섯 곳을 작은 헬퍼 하나로 모아 거기서 찍는다.
- 문서는 `docs/runbooks/webview-debugging.md`에 쓰고 apps/mobile/CLAUDE.md에 링크 한 줄. BY-629가 유지한 `docs/runbooks/` 관례를 따른다.
- 우아한형제들식 CDP 캡처·재구성 툴은 만들지 않는다. 규모가 다르고, 운영 세션 재구성은 Sentry Session Replay가 이미 하며, iOS WKWebView는 CDP를 말하지 않고, 화면 통째 업로드는 카메라 개인정보 원칙과 부딪친다.

## 로드 수명 콜백 결정

- 티켓이 요구한 `onLoadStart`·`onLoadProgress`·`onNavigationStateChange`를 개발 빌드에서만 연결해 로그만 찍는다. 운영 빌드에서는 `__DEV__`가 false라 prop이 `undefined`이고 동작이 지금과 같다.
- 이 세 콜백을 지금 연결하지 않는 것은 스타일이 아니라 동작 불변식이다. Android는 SPA `pushState`에도 `onLoadStart`를 쏘고 짝이 되는 `onLoadEnd`가 없어서, 스플래시·복구·회전이 이 콜백에 의존하면 되잠기거나 스플래시가 안 걷힌다(BY-436·BY-443 실기기).
- 로그 전용 핸들러는 상태를 바꾸지 않으므로 그 불변식을 깨지 않는다. 기존 가드 테스트는 "onLoadStart을 연결하지 않는다"에서 "개발 빌드에서 발화해도 복구·회전을 건드리지 않고, 운영 빌드에서는 연결하지 않는다"로 더 강하게 바꾼다.

## 변경

### apps/mobile/components/RemoteWebViewHost.tsx

- `handleMessage`의 `message === null` 분기에서 원문(`event.nativeEvent.data`)을 개발 로그로 찍는다.
- `injectJavaScript(injectMessageScript(...))` 호출부를 로컬 헬퍼 하나로 모아 개발 중 나가는 메시지를 찍는다.
- 연결된 로드 콜백(`handleLoadEnd`·`handleError`·`handleHttpError`·`handleContentProcessDidTerminate`·`handleRenderProcessGone`)에 개발 로그 한 줄씩 넣는다.
- `onLoadStart`·`onLoadProgress`·`onNavigationStateChange`를 `__DEV__`일 때만 연결해 로그만 찍는다.

### apps/mobile/lib/nativeBridgeHandler.ts

- `handleBridgeMessage`의 switch에 `default`를 더해 개발 중 처리 case가 없는 type을 찍는다.

### apps/web/src/lib/bridge.ts

- `subscribeToNativeMessages`의 전역 수신 함수 `null` 분기에서 원문을 개발 로그로 찍는다.
- `postToNative`가 보내기 직전 개발 중 나가는 메시지를 찍는다. 기존 `try/catch`는 그대로 둔다.

### docs/runbooks/webview-debugging.md (신규)

- 인스펙터 연결: iOS Safari 웹 인스펙터, Android `chrome://inspect`.
- 브라우저 단독 모드로 웹 문제와 브리지·네이티브 문제를 가른다.
- 브리지 개발 로그 읽는 법: 버려진 메시지 원문을 Metro·logcat·웹 콘솔에서 본다.
- 색 실험과 `onLayout` 높이 측정으로 레이아웃·프레임 문제를 좁힌다.
- 프로덕션 빌드로 재현한다. Vite dev는 CSS 주입 방식이 달라 첫 페인트가 다르다.
- AP isolation에서는 cloudflared로 Vite·Metro를 태운다.
- 더 깊이 볼 때: Proxyman·Charles로 네트워크, Xcode View Debugger·Android Layout Inspector로 뷰 계층, eruda·vConsole로 인페이지 콘솔.
- 카메라 secure context 주의: iOS 실기기 https, Android localhost http.

### apps/mobile/CLAUDE.md

- 위 런북으로 가는 링크 한 줄.

## 테스트

- 네이티브: 모르는 메시지가 오면 개발 빌드에서 원문이 로그에 남고, 운영 빌드(`__DEV__` false)에서는 안 남는다.
- 네이티브: `onLoadStart`이 개발 빌드에서 발화해도 복구·회전을 건드리지 않고, 운영 빌드에서는 prop이 `undefined`다.
- 네이티브: `handleBridgeMessage`가 처리 case 없는 type을 개발 빌드에서 찍는다.
- 웹: 전역 수신 함수가 모르는 원문을 개발 빌드에서 찍고 운영에서는 안 찍는다.
- 웹: `postToNative`가 개발 빌드에서 나가는 메시지를 찍고 운영에서는 안 찍는다.

## 완료 조건

- 개발 빌드에서 브리지 메시지가 버려지면 Metro 로그와 웹 콘솔에 원문이 남는다.
- 운영 빌드에는 추가 로그가 없다.
- 디버깅 절차 문서가 있고 apps/mobile/CLAUDE.md에 링크 한 줄이 있다.
- lint, typecheck, test가 통과한다.
