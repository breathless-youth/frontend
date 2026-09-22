# BY-729 · 스플래시 · 하단 탭 바 V2 UI 적용

2026-09-22 · [BY-729](https://breathless-youth.atlassian.net/browse/BY-729)

## 왜 하는가

V2 리스킨이 화면 단위로 진행되면서 홈·기록·소셜·설정은 Soft Blue 시안으로 넘어갔다.
그런데 이 화면들을 감싸는 껍데기 두 개 — 앱을 열 때 처음 보이는 스플래시와 화면마다 깔려
있는 하단 탭 바 — 는 아직 V1이다. 안은 V2인데 틀은 V1이라 앱을 켜는 첫 순간과 화면을 오갈
때마다 어긋난 인상이 남는다.

둘 다 `apps/mobile`(React Native)에 있다. 웹 배포로는 반영되지 않고 새 앱 빌드가 필요하다.

## 시안

[FocusMakers V2 Design](https://www.figma.com/design/YcyImcuVORDbBneii41Byh/FocusMakers-V2-Design)

- 탭 바: `Nav / Glass Tab Bar` (5325:3730) — Theme=Light(5325:3728) / Theme=Dark(5325:3729)
- 스플래시: `E1 · 스플래시 (Soft Blue)` (5322:3661) / 다크 (5354:3785)

## 결정과 근거

### 활성 탭은 색이 아니라 알약으로 구분한다

지금은 활성 탭을 글자·아이콘 색(브랜드 파랑)으로 구분한다. 시안은 활성 탭 라벨도
`#1f2a3d`(text/primary)라서 색으로는 구분되지 않고, **알약 하이라이트 배경**이 그 일을 한다.
비활성은 `#556173`(text/secondary)이다.

색상 대비 하나에 의존하던 구분이 배경 도형으로 바뀌는 것이라 접근성은 오히려 나아진다.
`accessibilityState={{ selected }}`는 그대로 유지하므로 스크린리더에는 영향이 없다.

### 탭 바는 정적 Figma 디자인, Liquid Glass는 별도 티켓 (2026-09-23 최종)

경위: 처음엔 정적 알약으로 정했다가 사용자 요청으로 "알약이 손가락을 따라 흐르는" iOS 26
인터랙티브 Liquid Glass 모션을 `expo-glass-effect`(GlassView·GlassContainer) +
`react-native-gesture-handler`로 구현했다. 그러나 실기기(iOS 26.6.1) 검증에서 커스텀
`GlassView`로는 당근 등이 보여주는 네이티브 Liquid Glass의 굴절·액체 모핑 품질이 나오지
않았다. 확인 결과 **정공법은 `expo-router`의 `NativeTabs`** 로, iOS 26에서 시스템이 탭 바를
Liquid Glass로 자동 렌더한다(문서 명시).

그런데 `NativeTabs`의 바 전체 숨김(`hidden` 컨테이너)·탭 차단(`disabled`)이 SDK 55/56+라,
현재 **SDK 54 고정**을 재검토해야 온전히 쓸 수 있다. 이는 원 티켓 범위를 넘고 SDK 고정 정책을
건드리는 팀 결정이라, **iOS 26 Liquid Glass(NativeTabs) + SDK 업그레이드 검토는 별도 티켓으로
분리**한다.

따라서 이 티켓은 **정적 Figma 디자인**만 적용한다:

- 프로스티드 바: `expo-blur`의 `BlurView`(표준 블러 — iOS 26 Liquid Glass가 아니다).
- 활성 알약: 활성 탭에 정적으로 그린다(애니메이션·제스처·모핑 없음). 저장소 `expo-animation`
  스킬의 "탭 전환은 애니메이션 없음"과도 맞는다.
- 제거: `expo-glass-effect`·`react-native-gesture-handler`·루트 `GestureHandlerRootView`·
  제스처/유리 테스트·`tabBarGeometry`.
- 유지: V2 아웃라인 아이콘, 플로팅·radius 999·그림자, 토큰, 딤(모달) 처리, `tab_pressed`·
  `set-tab-bar` 동작, 스플래시, 웹 하단 여백.

### 유리는 iOS 26 네이티브, 그 밖은 블러 폴백

`expo-glass-effect`(SDK 54 번들 `~0.1.10`)의 `GlassView`가 iOS 26 이상에서 시스템 Liquid
Glass를 그린다. EAS iOS 빌드 이미지가 `macos-sequoia-15.6-xcode-26.2`라 컴파일 조건도 이미
충족한다. 그 아래 iOS와 Android에서는 `GlassView`가 조용히 평범한 `View`로 떨어지므로
`expo-blur`(SDK 54 번들 `~15.0.8`)의 `BlurView`로 시안의 blur 값을 낸다.

분기는 `isLiquidGlassAvailable()` 한 번으로 끝낸다. 모듈 로드 시점에 정해지는 상수라 렌더마다
다시 묻지 않는다.

버린 안: `expo-blur` 하나로 전 플랫폼 통일. 코드는 더 짧지만 iOS 26이 가진 굴절·반사를 버린다.
버린 안: `GlassView` 하나만. iOS 26 미만과 Android 전체가 불투명 판으로 떨어져 시안과 멀어진다.

### Soft Blue 값은 토큰 패키지에 별도 스코프로 넣는다

지금 V2 팔레트는 웹의 `index.css` `.theme-soft-blue` 스코프에만 있고, 모바일이 참조하는
`@focusmakers/design-tokens`는 V1 값 그대로다. 토큰 패키지에 `softBlue` 스코프를 더한다.

기존 `colors`는 건드리지 않는다. 덮어쓰면 아직 V1인 모바일 화면(세션·권한 안내 등)이 검증
없이 따라 바뀐다. 전체 컷오버는 별도 티켓 몫이다.

## 토큰

| 토큰                   | 라이트                   | 다크                     |
| ---------------------- | ------------------------ | ------------------------ |
| `glass.surface`        | `rgba(255,255,255,0.55)` | `rgba(30,34,44,0.55)`    |
| `glass.border`         | `rgba(255,255,255,0.75)` | `rgba(255,255,255,0.18)` |
| `glass.innerHighlight` | `rgba(255,255,255,0.9)`  | `rgba(255,255,255,0.25)` |
| `glass.activePill`     | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.14)` |
| `glass.shadow`         | `rgba(31,42,61,0.14)`    | `rgba(0,0,0,0.35)`       |
| `tab.labelActive`      | `#1f2a3d`                | `#eaf0f9`                |
| `tab.labelInactive`    | `#556173`                | `#9fabc0`                |
| `splash.bg`            | `#f8fafd`                | `#0d1118`                |
| `splash.wordmark`      | `#3671cf`                | `#5a90ea`                |

출처는 시안의 `get_design_context` 값과 웹 `.theme-soft-blue` 블록이다. 두 곳이 겹치는 값
(`#1f2a3d`, `#556173`, `#eaf0f9`, `#9fabc0`)은 서로 일치하는 것을 확인했다.

## 구조

```
┌─ (tabs)/_layout.tsx ─────────────────┐
│  <Tabs tabBar={…}>                   │
│    screens (웹뷰가 화면 끝까지 참)     │
│    └ <TabBar/> ← position:absolute   │  흐름 밖이라 네비게이터가
│        left:16 right:16              │  자리를 예약하지 않는다
│        bottom: max(insets.bottom,24) │
└──────────────────────────────────────┘

TabBar
 └ Surface (radius 999, border 1, shadow 0/10/15)
    ├ iOS 26+ : <GlassView glassEffectStyle="regular">
    └ 그 외    : <BlurView intensity={22} tint={scheme}>
       └ padding 6, flex-row
          └ 탭 4개 (높이 56, min-h-11, gap 3)
             └ 활성일 때만 알약 View 1장
```

### 유지하는 것

- `TabId` 타입과 `TABS` 정의 — `lib/nativeAnalytics.ts`의 `NativeTab`과 값 집합이 묶여 있다
- `trackNativeEvent("tab_pressed", { tab, from_tab, via })` 페이로드
- `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, 활성 탭 `disabled`
- `useTabBarState()` 3상태(`visible`/`hidden`/`blocked`) 처리
- 터치 타겟 `min-h-11`

### 자산

시안의 탭 아이콘이 현재와 다르다(홈이 채움 → 선). Figma에서 4개를 내보내
`components/icons.tsx`의 탭 아이콘만 교체한다. 손으로 근사해 그리지 않는다.

## 스플래시

`scripts/generate-splash-wordmark.swift`의 문구를 "포커스 메이커스", 폰트를 저장소의
NanumSquareRound ExtraBold, 색을 위 토큰 값으로 고쳐 `assets/splash-icon.png`·
`splash-icon-dark.png`를 다시 뽑는다.

파일명을 유지하는 이유는 `app.json` diff가 배경색 두 줄로 줄어들고, iOS 스토리보드와
`Images.xcassets` 쪽 참조를 건드리지 않아도 되기 때문이다.

`app.json`은 `backgroundColor`를 `#f8fafd`, `dark.backgroundColor`를 `#0d1118`로 바꾸고
`imageWidth`를 워드마크 비율에 맞게 조정한다.

## 웹 하단 여백

탭 바가 웹뷰 위로 올라오니 콘텐츠 아래가 가린다. `apps/web/src/index.css`에 예약 높이를 한 번
정의하고 네 페이지가 쓴다.

```css
/* 탭 바(70) + 바닥 여백(24 또는 safe area) + 숨 8 */
--tab-bar-reserve: calc(70px + max(env(safe-area-inset-bottom), 24px) + 8px);
```

적용 대상은 `/home`·`/records`·`/settings`·`/social` 네 페이지 루트의 `pb-6`. 높이 정의는
한 곳, 사용처는 넷이다.

브라우저 단독 접속에서도 같은 여백이 생긴다. `isNativeBridgeAvailable()`로 가를 수는 있지만
이 제품은 웹뷰가 본 무대고 브라우저에서는 빈 여백이 보이는 것뿐이라 조건 분기를 넣을
값어치가 없다고 판단했다.

## 검증 못 한 가정

React Navigation의 `BottomTabView`가 커스텀 `tabBar`의 높이만큼 화면에 하단 패딩을 주는데,
반환 엘리먼트를 `position:absolute`로 두면 흐름에서 빠져 0으로 잡힐 것으로 본다. 표준
패턴이지만 이 버전에서 실제로 그런지는 코드를 올려 봐야 안다.

아니라면 `_layout.tsx`에서 `<Tabs>` 바깥의 형제 오버레이로 옮긴다. 그 경우 `useTabBarState()`
구독 위치만 한 칸 올라가고 나머지는 그대로다.

## 완료 조건

- 탭 바가 시안과 같은 위치·모양·색으로 라이트·다크 모두에서 그려진다 (스크린샷)
- iOS 26 실기기에서 Liquid Glass가, Android에서 블러 폴백이 각각 동작한다
- 네 탭 화면 모두 맨 아래까지 스크롤했을 때 내용이 탭 바에 가리지 않는다
- 스플래시가 라이트·다크 모두 시안대로 뜬다 (실기기 스크린샷)
- 탭 터치 44px 타깃, `accessibilityRole="tab"`·선택 상태가 유지된다
- 기존 `tab_pressed` 이벤트와 `set-tab-bar` 숨김 동작이 그대로다

## 범위 밖

- shadcn/ui 교체. 대상이 전부 React Native라 웹 전용인 shadcn을 쓸 수 없다. 하드코딩된 색·수치를
  디자인 토큰으로 치환하는 것으로 갈음한다.
- 모바일의 나머지 V1 화면 색 이관. 별도 컷오버 티켓 몫이다.
- 활성 알약 이동 애니메이션·인터랙티브 Liquid Glass — 이 티켓에선 정적으로 되돌렸고, iOS 26 네이티브 Liquid Glass(NativeTabs)는 별도 티켓으로 분리했다. 위 "탭 바는 정적 Figma 디자인, Liquid Glass는 별도 티켓" 참고.
