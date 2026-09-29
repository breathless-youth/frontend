# BY-680 네비게이션 UX 개선 설계

## 목표

- 웹 라우트로 하위 화면에 들어갈 때 새 화면이 오른쪽에서 밀려 들어오고, 뒤로가기 버튼으로 나올 때 반대로 빠져나간다.
- iOS 앞으로가기 스와이프를 막는 일은 실기기 검증 뒤 별도 티켓으로 분리했다(아래 "앞으로가기 스와이프를 분리한 이유").

## 확정한 결정

| 항목                | 결정                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 구현 방식           | 웹 View Transitions API를 `navigate` 호출에 직접 감싼다. data router 전환과 네이티브 Stack push는 택하지 않았다          |
| 속도·곡선           | 300ms, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` 토큰 추가                                                         |
| 이전 화면           | 왼쪽 30%로 밀리며 살짝 어두워진다. 뒤로갈 때는 정확히 반대로 움직인다                                                    |
| 문의하기            | 문서 단위 이동이라 이번 범위에서 제외한다                                                                                |
| 탭 바               | 숨길 때는 즉시, 보일 때는 진행 중인 전환이 끝난 뒤 알린다                                                                |
| 앞으로가기 스와이프 | 탭 첫 화면에서 웹이 제스처를 끄는 방식을 구현했다가 되돌렸다. 네이티브에서 앞으로가기 인식기만 끄는 별도 티켓으로 넘긴다 |
| 네이티브 onLoadEnd  | 같은 문서 안의 히스토리 이동에서 온 `onLoadEnd`는 제스처를 다시 켜지 않는다                                              |

## 왜 직접 감싸는가

- 앱은 선언형 `<BrowserRouter>`를 쓰고, react-router 7.18의 `viewTransition` 옵션은 `RouterProvider`(data router) 경로에서만 처리된다. 선언형 `navigate`는 이 옵션을 읽지 않는다.
- `BrowserRouter`는 위치 갱신을 `React.startTransition`으로 감싸므로 `flushSync`로 강제 커밋할 수 없다. 그래서 View Transition의 갱신 콜백은 라우트 커밋 시점에 풀리는 Promise를 반환한다.
- 우리 코드가 부른 이동에만 전환이 걸리므로, WKWebView 가장자리 스와이프(POP)는 WKWebView 자체 애니메이션만 재생되고 겹치지 않는다.

## 구성

### `lib/pageTransition.ts` (새 파일)

- `slideNavigate(direction, update)`는 `document.startViewTransition`이 없거나 `prefersReducedMotion()`이 참이면 `update()`만 실행한다.
- 그 외에는 `<html>`에 `data-page-transition="forward|back"`을 붙이고, 갱신 콜백에서 `update()`를 부른 뒤 커밋 Promise를 반환한다.
- 커밋 Promise는 `usePageTransitionCommit()`이 위치 변경 시 `useLayoutEffect`에서 풀고, 이동이 일어나지 않는 경우를 위해 짧은 타임아웃으로도 풀린다.
- 전환의 `finished`가 끝나면 방향 속성을 지운다.
- `pageTransitionFinished()`는 진행 중인 전환의 종료 Promise를 돌려주고, 없으면 `null`이다.

### `index.css`

- `:root`에 `--ease-drawer`를 추가한다.
- `@media (prefers-reduced-motion: no-preference)` 안에서 `html[data-page-transition]::view-transition-old(root)`·`::view-transition-new(root)`에 방향별 keyframes를 건다.
- back 방향에서는 빠져나가는 이전 스냅샷(`old`)을 위에 쌓는다.

### 호출 지점

forward로 감싼다.

- `SettingsPage`의 프로필·온보딩 가이드·약관·개인정보 처리방침·오픈소스 라이선스 이동
- `HomeTabPage`의 온보딩 가이드 이동
- `SocialHomePage`의 방 만들기 성공(`/social/code`)과 초대코드로 참여(`/social/join`) 이동
- `InviteCodeSharePage`·`InviteCodeJoinPage`의 소셜룸 입장(push)

back으로 감싼다. 스택이 비어 `replace`로 폴백하는 분기도 같은 핸들러 안이라 함께 감싼다.

- `ScreenBackHeader`의 기본 뒤로가기
- `ProfilePage`의 저장 후 복귀
- `InviteCodeSharePage`·`InviteCodeJoinPage`의 뒤로가기
- `OnboardingGuidePage`의 `closeGuide`

감싸지 않는다.

- `replace`로 넘어가는 세션 → 결과, 방 → 소셜, 가이드 → 세션 이동
- 문의하기(하드 내비게이션), 탭 전환(네이티브), `historyGuard`의 되돌리기, `nativeRouteReset`

### `useNativeTabBarSync`

- `visible: true`를 알릴 때 `pageTransitionFinished()`가 있으면 끝난 뒤 알린다.
- 기다리는 동안 effect가 정리되면 그 알림은 보내지 않는다.

### `RemoteWebViewHost` (네이티브)

- react-native-webview 13.15.0은 iOS에서 History API를 가로채 `pushState`·`replaceState`·`popstate`마다 `onLoadEnd`를 보낸다. 이때만 `nativeEvent.navigationType`이 채워진다.
- `handleLoadEnd`는 `onLoadEnd`마다 제스처를 켜고 있었다. 그래서 웹이 `set-back-gesture`로 끈 잠금이 SPA 이동 한 번에 풀렸다. 온보딩 가이드의 잠금도 같은 영향을 받는다.
- `navigationType`이 없을 때, 즉 진짜 문서 로드일 때만 제스처를 되돌린다.
- JS 변경이라 Dev Client는 Metro로 바로 받고, 운영에는 다음 앱 빌드부터 적용된다.

## 앞으로가기 스와이프를 분리한 이유

- 처음에는 탭 첫 화면 4곳에서 `useNativeBackGestureLock`으로 `allowsBackForwardNavigationGestures`를 끄려 했다.
- 실기기에서 설정 → 프로필 → 뒤로 스와이프 때 이전 화면 자리에 회색 단색이 보였다.
- 동작 줄이기(전환 없음)에서도 같았고, 기준 코드(`8be1ec48`)에서는 정상이었다. 설정 화면의 잠금 한 줄만 빼자 정상으로 돌아왔다.
- WKWebView는 이 설정을 끄면 스와이프와 함께 내비게이션 스냅샷 기록도 끈다. 탭 첫 화면을 떠나는 `pushState` 순간 스냅샷이 찍히지 않아, 돌아올 때 보여 줄 미리보기가 없었다.
- 웹 배포만으로 현재 스토어 앱에도 회귀가 생기므로 웹 잠금을 이번 변경에서 뺐다.
- 후속 티켓은 뒤로가기와 스냅샷을 그대로 두고, 오른쪽 가장자리(앞으로가기) 인식기만 네이티브에서 끄는 방식을 검토한다.

## 검증

- 단위 테스트는 5-1 게이트에서 목록을 승인받는다.
- 실기기 iOS 26.6(iPhone 13 mini)과 Android에서 로컬 Dev Client로 확인했다. 설정 → 프로필 진입·복귀 슬라이드, 뒤로 스와이프 미리보기, 동작 줄이기를 확인했다.
- 네이티브 수정은 브리지 로그로 SPA 이동의 `onLoadEnd` 뒤에도 잠금이 유지되는지 확인했다.
