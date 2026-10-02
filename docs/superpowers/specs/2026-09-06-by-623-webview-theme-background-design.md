# BY-623 웹뷰 배경 테마 정합 설계

- 대상: `apps/mobile`, `apps/web`, 루트 `patches/`
- 관련 티켓: BY-623
- 작성일: 2026-09-06

## 배경과 원인

### 증상

- 2026-09-06 iOS staging·dev 앱에서 홈·소셜·설정 탭의 탭 바 위에 흰 줄이 보였다.
- 같은 빌드의 기록 탭에는 탭 바 경계선(`border-t`, 다크 `#333d4b`)만 보였고 흰 줄은 없었다.
- App Store 출시본 1.0.1에서는 흰 줄이 보이지 않았다.
- 2026-09-04 웹뷰 셸 검토에서 다크 모드로 탭을 전환할 때 흰 화면이 잠깐 번쩍이는 문제를 함께 짚었다.

### 색 실험

- 웹뷰 뒤 네이티브 배경을 빨강으로 바꿔도 흰 줄은 그대로였다.
- 웹 문서 배경(`html`·`body`)을 연두로 바꿔도 흰 줄은 그대로였다.
- 탭 바 경계선을 파랑으로 바꾸자 기록 탭의 선만 파랗게 변했고 다른 탭의 흰 줄은 흰색으로 남았다.
- 세 실험을 합치면 흰 줄은 네이티브 배경도 문서 배경도 경계선도 아닌 WKWebView 자신의 흰 바탕이었다.

### 흰 줄의 정체

- `onLayout` 측정값은 iPhone 375×812, 기기 글자 크기 "작게", `PixelRatio.getFontScale() = 0.882` 조건에서 탭 라벨 높이 `12.667`, 탭 바 `85.667`, 웹뷰 `726.333`이었다.
- WKWebView는 CSS 뷰포트를 정수로 잡으므로 웹뷰 맨 아래 1/3pt, 즉 3배율 화면의 물리 픽셀 한 줄이 문서 밖에 남고 그 자리에서 웹뷰의 흰 바탕이 드러난다.
- 문서가 뷰포트보다 긴 기록 탭은 스크롤 콘텐츠가 그 줄까지 덮어 흰 줄이 보이지 않았다.
- 라벨에 `allowFontScaling={false}`와 `lineHeight: 14`를 주자 탭 바 88, 웹뷰 724가 되면서 줄이 사라졌지만, 이 기기의 증상만 없애고 소수점이 다른 경로로 생기면 재발하므로 채택하지 않았다.

### Fabric 래퍼가 배경색을 전달하지 않음

- New Architecture(Fabric)에서 `react-native-webview` 13.15.0의 `apple/RNCWebView.mm`은 `updateProps`에서 `backgroundColor`를 `RNCWebViewImpl`로 전달하지 않는다.
- `RCTViewComponentView`가 래퍼 뷰에만 색을 칠하고 `RNCWebViewImpl`의 `_savedBackgroundColor`는 비어 있어, WKWebView는 기본 흰 바탕으로 만들어진다.
- 세션 화면이 넘기던 `backgroundColor="#0B0F14"`도 래퍼 뷰에만 칠해지고 있었다.

### 다크 모드 번쩍임

- `@react-navigation/bottom-tabs`는 `detachInactiveScreens` 기본값이 true라 react-native-screens가 비활성 탭을 계층에서 떼었다가 다시 붙인다.
- 다시 붙은 웹뷰가 첫 프레임을 그릴 때까지 뒤에 있는 네비게이터 배경이 비친다.
- expo-router가 테마를 넘기지 않아 그 배경은 React Navigation DefaultTheme의 `rgb(242,242,242)`다.
- 원인이 "웹뷰 배경이 테마 색이 아니다"로 흰 줄과 같으므로 한 번에 해결된다.

### Android

- `react-native-webview`의 `RNCWebViewWrapper`가 WebView를 `Color.TRANSPARENT`로 두므로 `style.backgroundColor`는 래퍼 뷰에 칠해지고 그것이 그대로 비친다.
- 그래서 Android는 패치 없이도 셸이 색을 넘기기만 하면 같은 결과가 나온다.

### 부수 발견

- NativeWind v4의 rem 기본값이 14라 `TabBar.tsx`의 `min-h-11`이 38.5, `px-6`이 21로 계산된다.
- 이 값 정정은 이 문서 범위 밖이며 사실만 기록한다.

## 검토한 대안과 선택

- A(선택): RNW Fabric 래퍼를 패치해 `backgroundColor`를 WKWebView까지 전달하고, `RemoteWebViewHost`가 테마 색을 항상 웹뷰에 넘긴다.
- A를 고른 이유는 원인을 한 곳에서 막고 iOS와 Android가 같은 경로를 타기 때문이다.
- B(기각): 탭 라벨 글자 스케일 고정은 이 기기의 소수점만 없애고 다른 소수점 원인에서 재발한다.
- B는 글자 크기를 키운 사용자에게 탭 라벨만 커지지 않는 접근성 절충도 함께 온다.
- C(기각): A에 더해 `RemoteScreen` 루트 `View`의 배경 토큰과 `_layout.tsx`의 `ThemeProvider`를 넣는 안이다.
- C는 웹뷰가 불투명한 테마 색이면 실제로 비칠 자리가 없어 지금은 픽셀을 바꾸지 않는 코드가 되므로, 네비게이터 배경이 비치는 화면이 생길 때 넣는다.

## 설계

### 네이티브 패치 `patches/react-native-webview@13.15.0.patch`

- `apple/RNCWebView.mm`의 `updateProps`에 `oldViewProps.backgroundColor != newViewProps.backgroundColor`일 때 `[_view setBackgroundColor:RCTUIColorFromSharedColor(newViewProps.backgroundColor)]`를 호출하는 블록을 더한다.
- `RCTUIColorFromSharedColor`는 `React/RCTConversions.h`에 있다.
- `RNCWebViewImpl`의 `setBackgroundColor:`는 WKWebView가 아직 없으면 `_savedBackgroundColor`에 저장했다가 `didMoveToWindow`에서 생성 직후 적용하므로 첫 마운트도 덮인다.
- 알파가 1이면 `opaque = YES`가 되어 WKWebView와 그 스크롤뷰 배경이 지정한 색이 된다.
- 생성 절차는 `pnpm patch react-native-webview@13.15.0`으로 임시 디렉터리를 받아 수정하고 `pnpm patch-commit <디렉터리>`로 확정하는 순서다.
- 확정하면 루트 `package.json`의 `pnpm.patchedDependencies`에 항목이 생기며, 기존 `@react-native-firebase/messaging`·`expo-constants` 패치와 같은 방식이다.
- 패치 본문의 변경 블록 위에 주석으로 이유를 남긴다.
- 라이브러리 버전을 올릴 때는 업스트림이 `backgroundColor`를 전달하게 됐는지 먼저 확인하고, 그렇다면 패치를 삭제한다.

### 셸 `apps/mobile/components/RemoteWebViewHost.tsx`

- `useColorScheme()`로 스킴을 읽어 `"dark"`가 아니면 `"light"`로 정규화한다.
- 그 스킴으로 `@focusmakers/design-tokens`의 `colors.bg.base[scheme]`(라이트 `#ffffff`, 다크 `#101419`)를 기본 배경으로 삼으며, `TabBar.tsx`가 이미 같은 방식으로 토큰을 읽는다.
- 화면이 넘긴 `backgroundColor` prop이 있으면 그 값이 우선하므로 세션 화면의 `#0B0F14`는 그대로 유지된다.
- 결정된 값을 WebView `style`에 항상 넣어 `{ flex: 1, backgroundColor }` 형태로 만든다.
- 지금은 prop이 있을 때만 배경색을 넣고 있으므로 이 부분이 실제 변경점이다.
- `RemoteScreen`, 스플래시, 실패 폴백 화면은 바꾸지 않는다.
- 실패 폴백의 `style={backgroundColor ? ... : undefined}`도 그대로 둔다.
- 시스템 테마가 바뀌면 훅이 다시 렌더해 웹뷰 배경색이 따라간다.

### 웹 `apps/web`

- `index.html`의 `<html lang="en">`을 `lang="ko"`로 바꾼다.
- `<meta charset="UTF-8" />` 바로 뒤에 인라인 스크립트를 두고, `new URLSearchParams(location.search).get("theme")`가 `"dark"` 또는 `"light"`이면 `document.documentElement.dataset.theme`에 넣는다.
- charset 메타는 문서 첫 바이트 안에 있어야 하므로 스크립트를 그 앞에 두지 않는다. 이 위치도 어떤 스타일시트보다 앞이고 첫 페인트 전이라, CSS가 적용되기 전에 `data-theme`가 존재한다.
- `<meta name="color-scheme" content="light dark">`를 함께 둔다.
- `src/index.css`의 `:root`에 `color-scheme: light`를 더하고, `@media (prefers-color-scheme: dark)` 블록과 `:root[data-theme="dark"]` 블록에 `color-scheme: dark`를 더한다.
- 이 선언은 UA 기본 캔버스와 폼 컨트롤 색을 테마에 맞추기 위한 것이다.
- `src/lib/nativeTheme.ts`에서 URL `theme` 읽기는 인라인 스크립트와 중복이라 제거하고 브리지 `theme` 메시지 구독만 남긴다.
- 주석은 초기값을 인라인 스크립트가 맡는다는 내용으로 고친다.
- 기존 테스트가 URL 읽기를 검증하고 있으면 그 검증은 아래 `index.html` 테스트에서 다시 작성한다.

### 문서 `apps/mobile/CLAUDE.md`

- "웹뷰 배경" 절을 더한다.
- 패치가 필요한 이유로 Fabric 래퍼가 배경색을 WKWebView에 전달하지 않는다는 사실을 적는다.
- 흰 줄 실측을 소수점 높이와 기기 글자 크기 설정과 함께 적는다.
- 웹뷰에 배경색을 항상 넘긴다는 규칙을 적는다.
- 패치를 삭제할 조건을 적는다.
- NativeWind rem 기본값이 14라는 발견을 한 줄 적는다.

## 테스트

- `apps/mobile/components/__tests__/RemoteWebViewHost.test.tsx`: `useColorScheme`을 모킹해 다크에서 WebView `style.backgroundColor`가 `#101419`, 라이트에서 `#ffffff`, `backgroundColor` prop이 있으면 그 값이 우선하는 세 케이스를 확인한다.
- `apps/web/src/__tests__/indexHtml.test.ts`(신규): `index.html`을 읽어 `lang="ko"`와 `<meta name="color-scheme"`가 있는지 확인한다.
- 같은 테스트에서 인라인 스크립트를 jsdom에 `?theme=dark` 상태로 실행하면 `data-theme="dark"`가 붙고, 값이 없으면 붙지 않는 것을 확인한다.
- `apps/mobile/lib/__tests__/webviewPatch.test.ts`(신규): 루트 `package.json`의 `pnpm.patchedDependencies`에 `react-native-webview@13.15.0`이 있고 패치 파일이 존재하며 `setBackgroundColor`를 담는지 고정한다.
- 이 고정 테스트는 `appStoreLocalization.test.ts`처럼 설정 파일을 읽어 선언을 못 박는 방식을 따른다.
- 구현은 TDD로 하나씩 Red → Green → Refactor 순서로 진행한다.

## 검증

- 네이티브 변경이라 Dev Client 재빌드가 필요하며 EAS `development` 프로필로 빌드한다.
- 글자 크기 "작게" 기기에서 홈·소셜·설정 탭 하단에 흰 줄이 없는지 본다.
- 다크 모드에서 탭을 전환할 때 흰 화면 번쩍임이 없는지 본다.
- 세션 화면 배경이 `#0B0F14`로 유지되고 라이트 모드가 이전과 같은지 본다.
- Xcode Debug View Hierarchy로 WKWebView 배경색이 테마 색인지 본다.
- Android에서는 다크 모드 탭 전환에 밝은 배경이 비치지 않는지 본다.

## 범위 밖

- `bounces={false}`·`overScrollMode="never"` 되돌림은 별도 티켓으로 다룬다.
- Android `prefers-color-scheme` 실측과 `theme` 쿼리·브리지·중복 CSS 정리는 별도 스파이크 티켓으로 다룬다.
- 웹뷰 디버깅 기반, 즉 브리지 드롭 메시지 로그와 로드 수명 로그와 디버깅 절차 문서는 별도 티켓으로 다룬다.
- NativeWind rem 값 정정은 별도 티켓으로 다룬다.

## 참고

- 지난 검토 페이지: https://claude.ai/code/artifact/525a93bb-f15b-4886-af6b-37968e17f022
- Jira: BY-623
