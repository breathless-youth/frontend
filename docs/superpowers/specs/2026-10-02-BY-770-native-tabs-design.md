# BY-770 하단 탭 바 iOS NativeTabs 전환 설계

## 배경·목표

- BY-729에서 `expo-glass-effect`의 `GlassView`로 Liquid Glass를 직접 조립해 봤지만 실기기에서 시스템 품질이 나오지 않았다.
- iOS 26은 시스템 탭 바를 Liquid Glass로 그리므로 정공법은 `expo-router`의 `NativeTabs`로 플랫폼 탭 바를 쓰는 것이다.
- 선행이던 SDK 57 업그레이드(BY-762)가 2026-10-02 dev에 들어가 `expo-router` 57.0.24의 `NativeTabs`를 쓸 수 있다.
- 2026-10-02 시뮬레이터(iOS 26.5) 스파이크로 바 숨김·차단·안전 영역 동작을 실측했고, 그 결과가 이 설계의 근거다.

### 목표

- iOS에서 시스템 탭 바가 뜬다(iOS 26은 Liquid Glass, iOS 18 이하는 기본 탭 바).
- 분석 이벤트 `tab_pressed`, 전체 화면 라우트의 바 숨김, 웹 다이얼로그 중 탭 차단이 기존과 같은 조건에서 동작한다.
- 아이콘·라벨 색이 Figma V2 토큰과 일치한다.
- Android는 지금 V2 커스텀 바가 그대로 보이고 동작이 바뀌지 않는다.

## 확정 결정

| 번호 | 결정             | 내용                                                                                            |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 1    | 적용 범위        | iOS 전부 NativeTabs, Android는 커스텀 바 유지                                                   |
| 2    | 다이얼로그 차단  | 트리거 4개 `disabled`, 딤 없음                                                                  |
| 3    | 전체 화면 라우트 | `<NativeTabs hidden>`                                                                           |
| 4    | 웹 하단 여백     | 웹뷰 URL 쿼리 `nativeTabBar=1`로 알리고 웹이 `env(safe-area-inset-bottom)` 기준 공식으로 바꾼다 |
| 5    | 아이콘           | `icons.tsx`의 SVG 패스를 템플릿 PNG @1x·2x·3x로 렌더해 `src`로 넣는다                           |

결정 1에서 iOS 18 이하까지 포함한 것은 사용자 결정이다. iOS 18의 기본 탭 바는 V2 시안과 다르게 보이지만, 코드 경로를 하나로 유지하는 쪽을 택했다.

## 스파이크 실측 (iOS 26.5 시뮬레이터, iPhone 17 Pro)

| 탭 바 상태        | 웹뷰 `innerHeight` | 웹뷰 `env(safe-area-inset-bottom)` |
| ----------------- | ------------------ | ---------------------------------- |
| 보임              | 874                | 83 (탭 바 49 + 홈 인디케이터 34)   |
| `hidden`          | 874                | 34                                 |
| 트리거 `disabled` | 874                | 83                                 |

- 웹뷰 높이는 어느 상태에서도 바뀌지 않는다. 다만 바를 숨기면 안전 영역이 83에서 34로 줄어, 안전 영역 기준 하단 여백(바텀시트 저장 버튼 등)은 한 번 움직인다.
- 바가 보일 때 웹뷰의 하단 안전 영역에 탭 바 높이가 포함된다. 웹은 바 높이를 따로 받을 필요 없이 `env(safe-area-inset-bottom)`만 쓰면 된다.
- `hidden` 전환은 즉시다. 기존 커스텀 바의 180ms 복귀 페이드는 iOS에서 사라진다.
- SDK 57 `NativeTabs`는 `screenListeners.tabPress`로 네이티브 누름을 알려 주고, `disabled`로 막힌 누름은 `data.isPrevented: true`로 온다.

## 구조

```
app/(tabs)/_layout.tsx
├─ Platform.OS === "ios"  → <NativeTabsLayout />   components/NativeTabsLayout.ios.tsx (새 파일)
│                               components/NativeTabsLayout.tsx는 Android용 null 스텁 (iOS 전용 API와 PNG를 Android 번들에서 뺀다)
└─ 그 외(Android)         → <CustomTabsLayout />   지금 코드 그대로 (Tabs + TabBar + BackHandler 탭 리셋)
```

### NativeTabsLayout

- `useTabBarState()`로 `visible | hidden | blocked`를 읽는다.
- `<NativeTabs hidden={state === "hidden"}>`에 트리거 4개(`index`·`social`·`records`·`settings`)를 고정 순서로 둔다.
- 각 트리거는 `disabled={state === "blocked"}`, `NativeTabs.Trigger.Icon src={PNG} renderingMode="template"`, `NativeTabs.Trigger.Label`을 가진다.
- `screenListeners.tabPress`에서 `data.isPrevented`가 아니면 `trackNativeEvent("tab_pressed", { tab, from_tab: getActiveTab(), via: "tab_bar" })`를 보낸다.
- `screenListeners.state`에서 활성 라우트를 읽어 `setActiveTabRoute`에 기록한다(브리지 핸들러의 `navigate-tab`이 출발 탭으로 읽는다).
- 색은 `tintColor`·`iconColor`·`labelStyle.color`에 `DynamicColorIOS`로 `softBlue.tab.labelActive`·`labelInactive`의 라이트·다크 값을 넘긴다.
- `tab` 값은 `TAB_BY_ROUTE_NAME[routeName]`으로 구한다. `tabPress`의 `target`은 라우트 key라 descriptors에서 이름을 찾는다.

### 바뀌지 않는 것

- `lib/tabBarVisibility.ts`, `set-tab-bar` 브리지 메시지 형식, 웹의 `useNativeTabBarSync`.
- Android 레이아웃과 `components/TabBar.tsx`의 Android 경로.
- `navigate-tab`·`hardware_back` 경로의 `tab_pressed` 발신.

### 아이콘 자산

- `assets/tabs/{home,social,record,settings}.png`, `@2x.png`, `@3x.png` 12장을 둔다.
- `icons.tsx`의 패스를 24pt 캔버스에 검정 단색으로 렌더한다. 색은 시스템 tint가 입힌다.
- 활성 아이콘 `*-selected.png` 12장은 같은 패스의 닫힌 영역을 채워 렌더한다(집은 문, 달력은 구분선을 구멍으로 남기고, 슬라이더는 손잡이 눈금을 꽉 찬 원으로). 다른 아이콘 세트를 쓰지 않는다.
- 라벨은 `PretendardLight` 11pt다. 커스텀 바의 Bold보다 가볍게 가자는 실기기 피드백을 따랐다.
- 렌더는 일회성 작업이라 생성 스크립트를 저장소에 남기지 않고 산출물만 커밋한다.
- `icons.tsx`는 Android 커스텀 바가 계속 쓰므로 남긴다.

### 웹 하단 여백

- `lib/remoteQueryParams.ts`가 iOS에서 `nativeTabBar=1`을 붙인다. 기존 capability 표시(`share`·`cameraGate`·`guestAuth`)와 같은 방식이다.
- 웹은 `useNativeShellClass`와 같은 자리에서 쿼리를 읽어 문서 루트에 `native-tab-bar` 클래스를 단다.
- `index.css`의 `.native-tab-bar`에서 `--tab-bar-reserve: calc(env(safe-area-inset-bottom) + 8px)`로 덮는다.
- `toastBottomOffset`은 네이티브 탭 바면 안전 영역 식(`calc(env(safe-area-inset-bottom) + 16px)`)을 돌려준다.
- 표시가 없는 구버전 iOS 앱과 Android는 지금 공식(70px + 인셋 + 8px)을 그대로 쓴다. 원격 웹은 구버전 앱에도 즉시 배포되므로 바이너리별 표시가 필요하다.

### expo-blur 정리

- `TabBar.tsx`의 `BlurView`는 iOS에서만 쓰였다. iOS가 NativeTabs로 가면 Android 불투명 배경 경로만 남는다.
- `BlurView` 분기와 `expo-blur` 의존성을 제거한다. 네이티브 모듈 하나가 줄어드는 것이 이 작업의 수치 개선이다.

## 실패 경로

- 웹이 `set-tab-bar`를 보내기 전(앱 시작·웹뷰 재로드)에는 기본값 `visible`이라 바가 보인다. 지금과 같다.
- `disabled` 상태에서 누른 탭은 `isPrevented`로 와서 이벤트를 세지 않고 이동도 없다.
- `nativeTabBar` 쿼리가 없으면 웹은 기존 공식을 쓴다. 새 웹이 구버전 앱에서 깨지지 않는다.
- `NativeTabs`는 탭을 실행 중 추가·삭제하면 네비게이터가 다시 마운트된다. 트리거 4개는 조건 없이 항상 렌더한다.

## 테스트

### 모바일

- `__tests__/tabs-layout.test.tsx`: iOS 경로에서 `hidden`·`disabled` 매핑, `tabPress` → `tab_pressed`, `isPrevented`면 미발신, `state` → `setActiveTabRoute`를 본다.
- 같은 파일의 Android 경로 케이스(뒤로가기 탭 리셋, 활성 탭 기록, 리마운트 없음)는 유지한다.
- `lib/__tests__/remoteQueryParams.test.ts`: iOS에서만 `nativeTabBar=1`.
- `components/__tests__/TabBar.test.tsx`: `BlurView` 관련 단언을 Android 불투명 배경 기준으로 정리한다.

### 웹

- `lib/nativeTabBar.test.ts`: `toastBottomOffset`이 네이티브 탭 바면 안전 영역 식을 돌려준다.
- 루트 클래스 부착 훅 테스트: 쿼리가 있을 때만 `native-tab-bar`가 붙는다.

### 실기기·시뮬레이터

- iPhone(iOS 26) Dev Client: Liquid Glass 바, 탭 이동 분석 이벤트, 온보딩 가이드·문의 화면에서 바 숨김, 다이얼로그 중 탭 차단, 바텀시트 중 숨김, 홈·기록·설정 하단 여백, 토스트 위치.
- iOS 26.5 시뮬레이터: 같은 항목의 보조 확인.
- iOS 18 이하: 기기가 없어 코드 경로가 같다는 점만 확인한다.
- Android(Galaxy A23): 커스텀 바가 그대로이고 뒤로가기 탭 리셋이 유지된다.

## Figma

- V2 파일(`YcyImcuVORDbBneii41Byh`)에 `Tab Bar / iOS 26 (system)` 프레임을 라이트·다크로 추가한다.
- 시스템이 그리는 바라 치수는 참고용이라고 프레임에 표기한다.

## 커밋 단위

| 순서 | 커밋                                                                              | 범위                                           |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | `feat(mobile): ios 하단 탭 바를 시스템 NativeTabs로 바꾼다 (BY-836, BY-837)`      | 레이아웃·스텁·아이콘·테스트                    |
| 2    | `feat(mobile): ios 웹뷰 url에 시스템 탭 바 표시를 붙인다 (BY-838)`                | `remoteQueryParams`와 기대 URL 테스트          |
| 3    | `feat(web): 시스템 탭 바면 하단 여백과 토스트를 안전 영역 기준으로 둔다 (BY-838)` | `nativeTabBar.ts`·`App.tsx`·`index.css`·테스트 |
| 4    | `chore(mobile): ios에서만 쓰던 expo-blur를 지운다 (BY-836)`                       | `TabBar`·의존성·문서                           |
| 5    | `docs: ios 시스템 탭 바 설계와 nativetabs 확인 사항을 기록한다 (BY-770)`          | 이 문서와 스킬 참조                            |

## 범위 밖

- Android NativeTabs(Material 3 바) 적용.
- 전체 화면 웹 라우트를 네이티브 스택 화면으로 재설계하는 것.
- `minimizeBehavior`(스크롤 시 바 축소), 검색 탭, `BottomAccessory`.
- 탭 뱃지. 지금 쓰는 곳이 없다.
