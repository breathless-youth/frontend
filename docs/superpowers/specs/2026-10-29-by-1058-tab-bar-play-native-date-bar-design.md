# BY-1058 탭 바 재생 버튼과 네이티브 홈 날짜 줄 설계

2026-10-29. 상위 BY-949, 선행 BY-1054(웹 날짜 줄·표시)·BY-1056(과목 기록). 명세는 위키 `product/specs/BY-949-홈-개편-과목-시작.md` §2·§6.

## 목표

- 홈 탭에서만 탭 바 오른쪽에 떨어진 재생 버튼을 보이고, 누르면 과목 없이 세션이 시작된다.
- 홈 날짜 줄을 앱이 그린다. iOS 26 이상은 탭 바 아래 액세서리, Android는 커스텀 탭 바 위 행이다.
- 탭을 오가도 탭 웹뷰가 다시 로드되지 않는다.
- 탭 바 재생으로 시작할 때 홈이 남긴 과목 기록이 세션에 붙지 않는다.

## 결정 (2026-10-29 사용자 승인)

| 항목                 | 결정                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 탭 바 재생 누름 처리 | 앱이 홈 웹뷰에 `home-play-pressed`를 보내고, 웹이 폴백 버튼과 같은 `startFocus("tab_bar")`로 시작한다. 앱이 직접 `start-session`을 보내지 않는다 |
| iOS 26 미만          | 재생 트리거와 액세서리를 넣지 않고 `tabBarPlay`·`nativeDateBar`를 붙이지 않는다. 웹의 날짜 줄과 폴백 버튼이 보인다                               |
| 폴백 버튼            | shadcn `Button`, 아이콘 없이 `순공 시작하기`, 날짜 줄과 같은 전체 너비, 높이 56px                                                                |
| expo-router 패치     | `NativeTabsView`의 `key: visibleTabsKeys`를 빼는 한 줄 패치를 `pnpm patch`로 등록한다                                                            |
| 분석                 | 웹 `focus_start_tapped`에 `source: "tab_bar"` 추가. 앱 쪽 별도 이벤트 없음                                                                       |
| 홈 스켈레톤          | 헤더 두 줄과 과목 카드 3장 모양으로 바꾼다                                                                                                       |
| Figma                | "이전 앱 홈" 프레임의 폴백 버튼만 고친다. 탭 바·날짜 줄 시안은 이미 반영돼 있다                                                                  |

## 흐름

```
[탭 바 재생 누름]
  iOS NativeTabsLayout(tabPress, isPrevented) / Android TabBar(onPress)
        │ pressHomePlay()            lib/homeDateBar.ts의 홈 전용 이벤트 통로
        ▼
  RemoteWebViewHost(홈 웹뷰만 구독) ── sendToWeb ──▶ 웹 HomeTabPage
                                                     │ startFocus("tab_bar")
                                                     ▼
                                            requestSessionStart
                                            ├ clearStartSubject()
                                            ├ closeStaleSession()
                                            └ postToNative(start-session) ──▶ 앱 권한 게이트 → /room/1
```

홈 웹뷰가 아직 뜨지 않았으면 누름은 반응이 없다. 그 상태는 홈 자체가 빈 화면이라 사용자가 이미 문제를 보고 있고, 앱이 직접 여는 경로를 따로 두면 과목 기록 삭제와 옛 세션 마감이 두 곳으로 나뉘므로 두지 않는다.

날짜 줄은 BY-1054가 정한 대로다. 웹이 `set-home-date-bar`로 날짜 목록·선택·오늘을 보내고 앱은 그대로 그린다. 칩 누름은 `home-date-selected`, 메뉴는 `home-menu-action`으로 홈 웹뷰에만 돌아간다. 홈이 내려가면 웹이 빈 목록을 보내 앱이 날짜 줄을 거둔다.

## 구성 요소

### 공유 타입 (`packages/types/src/bridge.ts`)

- `ToWebMessage`에 `{ type: "home-play-pressed"; atMs: number }`를 추가한다. 홈 웹뷰에만 간다.
- `SetHomeDateBarMessage`·`HOME_MENU_ACTIONS`·`HOME_DATE_BAR_MAX_DATES`는 BY-1054가 넣었다. `HOME_DATE_BAR_MAX_DATES`(60)는 아직 `index.ts`에서 내보내지 않으면 내보낸다.

### 앱

- `lib/homeDateBar.ts`: 모듈 스코프 저장소. `rendersNativeDateBar()`(Android 또는 iOS 26 이상), `setHomeDateBar`, `useHomeDateBar`, `selectHomeDate`, `pressHomeMenu`, 새로 `pressHomePlay`. 홈 전용 이벤트는 `subscribeHomeDateBarEvents`로 호스트가 받는다. 재생 버튼과 날짜 줄을 앱이 그리는 조건은 같으므로 PoC의 `rendersNativeDateBar`를 `rendersNativeHomeChrome`으로 이름을 바꿔 하나만 둔다.
- `components/HomeDateBar.tsx`: 날짜 칩 가로 스크롤과 메뉴 버튼. 칩 폭은 스크롤 영역의 3분의 1(최대 104), 처음 한 번만 오른쪽 끝으로 스크롤한다. 칩 높이는 놓이는 자리가 정한다(iOS 액세서리 36·접힌 줄 30, Android 44).
- `components/HomeDateMenuButton.ios.tsx`: `@expo/ui/swift-ui` `Menu`. `HomeDateMenuButton.tsx`: `@expo/ui/jetpack-compose` `DropdownMenu`. 둘 다 44pt 누름 영역과 `과목 메뉴` 접근성 라벨.
- `components/NativeTabsLayout.ios.tsx`:
  - iOS 26 이상에서만 `start` 트리거(`role="search"`, `disabled`, PNG 아이콘, 라벨 `순공 시작`)와 `BottomAccessory`를 넣는다.
  - 홈이면 설정 트리거를 `hidden`, 아니면 start 트리거를 `hidden`으로 바꿔 끼운다. 설정→홈은 250ms 뒤에 바꾼다.
  - iOS 27은 `unstable_nativeProps.ios.prominentScreenKey`에 start 라우트 key를 홈일 때만 넘긴다. key는 `app/(tabs)/start.tsx`가 마운트 때 `lib/startTab.ts`로 알린다.
  - 액세서리는 늘 두고 `bottomAccessoryHidden`으로 숨긴다. 넣고 빼면 탭 바가 다시 그려진다.
  - start 트리거 누름(`isPrevented`)은 `pressHomePlay()`만 부른다.
- `app/(tabs)/start.tsx`: 빈 라우트. `lib/startTab.ts`: PoC `pocStartTab.ts`의 이름 변경.
- `components/TabBar.tsx`(Android): 홈이면 설정 칸을 빼고 오른쪽에 70dp 재생 원을 둔다. 막대·칸은 `LinearTransition` 250ms, 재생 원은 `Keyframe` 등퇴장(오른쪽 24px·scale 0.9), 선택 알약 하나가 `onLayout` 위치로 미끄러진다. 전부 `ReduceMotion.System`. 홈이고 날짜 줄이 있으면 막대 위에 56dp 날짜 줄 행을 띄운다. 재생 누름은 햅틱 뒤 `pressHomePlay()`.
- `components/RemoteWebViewHost.tsx`: `set-home-date-bar`는 홈 경로 웹뷰에서 온 것만 `setHomeDateBar`로 넘기고, 홈 경로 웹뷰만 `subscribeHomeDateBarEvents(sendToWeb)`로 홈 전용 이벤트를 받는다.
- `lib/remoteQueryParams.ts`: `rendersNativeHomeChrome()`이면 `tabBarPlay=1`과 `nativeDateBar=1`을 붙인다.
- `lib/webBridge.ts`: `parseSetHomeDateBar`. 날짜 하나라도 모양이 틀리거나, 선택·오늘이 목록에 없거나, 60개를 넘으면 통째로 버린다. 빈 목록은 거두라는 뜻으로 통과시킨다.
- `components/RemoteSplashSkeletons.tsx`: `HomeTabSkeleton`을 제목 줄, 오른쪽 위 두 줄(D-Day·순공), 과목 카드 3장으로 바꾼다.
- `package.json`: `react-native-screens` `4.30.0`(정확히 고정, `expo.install.exclude`에 이미 있음).
- `patches/expo-router@57.0.24.patch`: `build/native-tabs/NativeBottomTabsNavigator.js`에서 `key: visibleTabsKeys,` 제거. `pnpm-workspace.yaml` `patchedDependencies`에 등록하고 `webviewPatch.test.ts`의 `PATCHES`에 추가한다.
- `assets/tabs/play-disc*.png` 6장: PoC에서 가져온다.

### 웹

- `lib/bridge.ts`: `home-play-pressed` 파싱.
- `lib/amplitude.ts`: `FocusStartSource`에 `"tab_bar"`를 넣고 주석에 뜻을 적는다.
- `routes/HomeTabPage.tsx`: 기존 네이티브 메시지 구독에서 `home-play-pressed`를 받으면 `startFocus("tab_bar")`.
- `features/home/HomeDateStrip.tsx`: 폴백 버튼을 `Button` 전체 너비·`h-14`·`rounded-full`·문구 `순공 시작하기`로 바꾸고 아이콘을 뺀다.

## 리뷰로 더한 것 (2026-10-29)

- 탭 바가 차단(blocked) 상태면 재생 누름을 무시한다. iOS는 `tabPress`에서 `blocked`를 보고, Android는 재생 원을 `disabled`로 두고 막대와 같은 덮개를 씌운다.
- iOS 26 이상 홈에서는 설정 트리거가 `hidden`이라 expo-router가 그 라우트를 내비게이터에서 뺀다. 그래서 `/settings`·`/timelapse-settings`·`/profile`로 가는 푸시 알림과 딥링크가 그대로는 열리지 않는다. `lib/settingsReveal.ts`가 탭 레이아웃에 설정 칸을 먼저 되살리게 한 뒤 이동한다(`openPushRoute`와 `+native-intent`가 쓴다). expo-router 패치는 넓히지 않았다. 앱을 처음 켜면서 들어온 설정 딥링크는 레이아웃이 아직 없어 막지 못하므로 실기기에서 확인한다.
- `start.tsx`는 `useLayoutEffect`로 key를 알려 홈에 돌아온 첫 커밋에 옛 key가 `prominentScreenKey`로 넘어가지 않게 한다.

## 오늘로 돌아가기 (2026-10-29 사용자 추가)

- 홈 날짜 줄에서 오늘이 아닌 날을 보고 있으면 탭 바 오른쪽 원이 되돌아가기 버튼이 된다. iOS는 SF Symbol `arrow.uturn.forward`를 시스템 tint로, Android는 유리 배경 원에 primary 색 화살표 SVG를 그린다. 라벨은 `오늘로`, 접근성 라벨은 `오늘로 돌아가기`다.
- 누르면 세션을 열지 않고 `returnToToday()`가 `selectHomeDate(todayKey)`를 불러 웹에 `home-date-selected`를 보내고 날짜 줄을 오늘로 스크롤한다. 분석 이벤트는 기존 `home_date_selected` 경로 그대로다.
- 오늘을 보고 있거나 날짜 줄이 없으면 재생 버튼이다.
- 설정 드러내기 구독은 `rendersNativeHomeChrome()`일 때만 건다. iOS 26 미만과 Android는 설정 링크가 기존 경로를 탄다.

## 실패 처리

- 홈 웹뷰가 없으면 탭 바 재생은 반응이 없다(결정 표).
- 세션 연타는 앱의 `startSessionInFlight`와 웹의 `isStartingRef`가 막는다.
- 잘못된 `set-home-date-bar`는 파서가 통째로 버린다. 일부만 그리면 웹이 고른 날과 앱이 보이는 날이 어긋난다.
- 과목 기록이 남아 있어도 `requestSessionStart(userId, …, null)`이 `clearStartSubject()`를 먼저 부르므로 세션에 붙지 않는다.

## 테스트

### 앱 jest

- `NativeTabsLayout.test.tsx`: iOS 26 이상이면 트리거가 `index·social·records·ranking·settings·start` 순이고 start는 `disabled`·`role="search"`다. iOS 25 이하면 start가 없다. 홈이면 settings `hidden`, 다른 탭이면 start `hidden`. start 누름(`isPrevented`)은 홈 전용 이벤트로 `home-play-pressed`를 낸다. `tab_pressed`는 start 누름에 찍히지 않는다.
- `TabBar.test.tsx`: 홈이면 설정 칸이 없고 `순공 시작` 버튼이 있다. 다른 탭이면 반대다. 재생 누름은 햅틱과 `home-play-pressed`. 날짜 줄은 홈이고 내용이 있을 때만 보인다.
- `homeDateBar.test.ts`: `rendersNativeHomeChrome` 플랫폼·버전 판정. `setHomeDateBar` 빈 목록은 null. `selectHomeDate`는 선택을 먼저 바꾸고 이벤트를 낸다. 같은 날 다시 누르면 아무 일 없다. `pressHomePlay`·`pressHomeMenu` 이벤트.
- `webBridge.test.ts`: `set-home-date-bar` 정상·빈 목록·모양 이상·선택 없음·60개 초과.
- `remoteQueryParams.test.ts`: iOS 26 이상과 Android는 `tabBarPlay`·`nativeDateBar`가 `1`, iOS 25는 둘 다 없다.
- `RemoteWebViewHost.test.tsx`: 홈 경로만 `set-home-date-bar`를 저장하고 홈 전용 이벤트를 주입한다.
- `webviewPatch.test.ts`: expo-router 패치 키.

### 웹 vitest

- `bridge.test.ts`: `home-play-pressed` 파싱.
- `HomeTabPage` 테스트: `home-play-pressed`를 받으면 `focus_start_tapped {source: "tab_bar"}`가 찍히고 과목 기록이 비워진 채 `start-session`이 나간다.
- `HomeDateStrip.test.tsx`: 폴백 버튼 문구 `순공 시작하기`, 아이콘 없음.

### 실기기

- iPhone 13 mini(iOS 27): PoC Dev Client에 Metro 8964 연결. 재생 버튼 떨어짐, 설정 swap, 날짜 줄, 과목 기록 안 붙음.
- iOS 26.5 시뮬레이터: 로컬 빌드로 떨어진 원과 swap.
- A23(Android): 로컬 dev 빌드 설치 뒤 재생 원·알약 이동·날짜 줄·메뉴.
- iOS 26 미만은 시뮬레이터가 없어 단위 테스트로만 확인한다.

## 범위 밖

- 날짜 줄 메뉴 항목의 실제 동작(과목 순서 변경·편집 화면)은 BY-1055.
- 당겨서 새로고침, 플래너 손잡이(BY-1057).
- 위키 반영은 BY-949 하위 작업이 끝난 뒤 한꺼번에 한다.
