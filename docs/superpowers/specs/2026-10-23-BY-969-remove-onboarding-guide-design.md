# BY-969 기존 온보딩 가이드(G1~G5) 삭제 설계

## 배경

기존 온보딩은 `/onboarding-guide` 한 화면에서 도는 5단계 코치마크 가이드(G1~G5)다. BY-334에서 웹으로 옮겼고, 그 뒤 여러 티켓이 손봤다. 새 온보딩은 BY-713에서 따로 다룬다.

코드를 조사해 확인한 사실은 다음과 같다.

- 가이드로 들어가는 길은 두 곳이다. 홈·랭킹의 "집중 시작" 버튼은 localStorage `focuson.onboardingGuideSeen`이 없을 때만 가이드를 연다(`features/onboarding/useFocusStart.ts` → `focusStartFlow.ts`). 설정 > 서비스 > "서비스 이용 가이드" 행은 언제나 연다.
- 온보딩 폴더 밖에서 쓰는 코드는 `useFocusStart` 하나다. 홈과 랭킹이 이 훅으로 세션을 시작한다. 나머지 컴포넌트·테마·상수는 폴더 안에서만 쓴다.
- 앱에는 네이티브 온보딩 화면이 없다. 푸시 라우팅 표의 `/onboarding-guide` 한 줄과 주석만 남아 있다.
- 브리지에 가이드 전용 메시지는 없다. `set-back-gesture`는 라이브룸도 쓰므로 남는다.
- `App.tsx`에는 없는 주소를 받는 `*` 라우트가 없다. 라우트만 지우면 예전 주소(앱 화면 복원, 푸시, 구버전 앱)로 들어온 사용자는 흰 화면을 본다.
- 구버전 앱 문서의 신원은 `legacyUserId()`가 매번 `window.location.search`의 `?userId=N`에서 읽는다. 리다이렉트가 쿼리를 버리면 그 뒤 요청이 신원 없이 나간다.

## 결정

사용자 결정으로 정한 것은 다음과 같다.

| 항목                                 | 결정                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 예전 주소                            | `/onboarding-guide`는 현재 쿼리에서 `entry`만 빼고 `/home`으로 리다이렉트한다. `entry`는 삭제한 가이드만 읽던 값이다                                                                                                                    |
| G5 개인정보 안내                     | 사라지는 것을 받아들인다. 새 온보딩(BY-713)에서 다시 다룬다고 BY-713에 댓글을 남긴다                                                                                                                                                    |
| `focus_start_tapped`의 `destination` | 속성은 남기고 값은 `"session"`으로 고정한다. 기존 차트·퍼널이 깨지지 않게 하기 위해서다                                                                                                                                                 |
| Firebase `guide_finished` 유저 속성  | `FIREBASE_USER_PROPERTY_KEYS`에서 뺀다                                                                                                                                                                                                  |
| 개인정보처리방침 9조 "온보딩 완료"   | 이번에는 두고 BY-969 댓글로 후속을 남긴다. 실제보다 넓게 적힌 상태라 이용자에게 불리하지 않다                                                                                                                                           |
| localStorage 잔여 값                 | 지우지 않는다. 읽는 코드가 없어지므로 해가 없다                                                                                                                                                                                         |
| 위키                                 | user-flow·mvp-scope·voice-tone·policies·design 다섯 문서에 폐기를 반영하는 별도 위키 PR을 연다. frontend의 `.ai` 포인터는 이번 PR에서 움직이지 않는다                                                                                   |
| 저장소 문서                          | `docs/screens/SCR-G1-G5-onboarding-guide.md`는 맨 위에 폐기 표시를 하고 본문을 둔다. `docs/screen-ownership.md`의 G1~G5 행을 빼고 `SCR-S6-settings.md`의 가이드 행 설명을 지운다. superpowers 계획·설계서는 과거 기록이라 고치지 않는다 |
| Figma V2                             | 설정 화면(라이트·다크)에서 "서비스 이용 가이드" 행을 빼고 G1~G5 프레임을 삭제한다                                                                                                                                                       |
| 앱 푸시 라우팅                       | `pushNotificationRouting.ts`의 한 줄을 같은 PR에서 뺀다. 다음 앱 빌드 때 반영된다                                                                                                                                                       |

## 설계

### 1. 집중 시작 흐름

`useFocusStart`를 `apps/web/src/lib/useFocusStart.ts`로 옮긴다. 이 훅이 감싸는 `lib/sessionStart.ts`가 옆에 있고, 홈·랭킹 어느 기능 폴더에도 기울지 않기 때문이다.

옮기면서 가이드 분기를 걷어 낸다. 남는 것은 다시 눌러도 한 번만 시작하는 잠금(`isStartingRef`), 햅틱, `requestSessionStart` 호출이다.

```ts
return function startFocus(source: FocusStartSource) {
  if (isStartingRef.current) return;
  isStartingRef.current = true;
  haptic("medium");
  trackFocusStartTapped(source);
  requestSessionStart(userId, () => navigate({ pathname: "/room/1", search: location.search }))
    .catch(/* 기존과 같은 경고 */)
    .finally(() => {
      isStartingRef.current = false;
    });
};
```

`trackFocusStartTapped`는 인자를 `source` 하나로 줄이고, 전송하는 속성에는 `destination: "session"`을 고정해서 싣는다. `focusStartFlow.ts`는 부르는 곳이 없어지므로 삭제한다.

### 2. 화면·라우트

- `apps/web/src/features/onboarding/` 폴더 전체와 `routes/OnboardingGuidePage.tsx`를 삭제한다.
- `routes/lazyRoutes.ts`의 `loadOnboardingGuidePage`·`prefetchOnboardingGuidePage`를 삭제하고, 홈의 미리 받기 호출을 지운다.
- `App.tsx`의 가이드 라우트를 리다이렉트로 바꾼다. `entry`를 뺀 나머지 쿼리를 지키려고 `useLocation`을 읽는 작은 컴포넌트를 둔다.

  ```tsx
  function OnboardingGuideRedirect() {
    const params = new URLSearchParams(useLocation().search);
    params.delete("entry");
    const rest = params.toString();
    const search = rest === "" ? "" : `?${rest}`;
    return <Navigate to={{ pathname: "/home", search }} replace />;
  }
  ```

  모든 출시 앱에서 이 주소가 사라지면 리다이렉트를 지운다는 주석을 남긴다.

- `SettingsPage.tsx`의 "서비스 이용 가이드" 행을 지우고, `trackSettingsRowPressed`의 행 종류에서 `"guide"`를 뺀다.
- `index.css`의 `coach-ring-out`·`coach-step-fade` 키프레임과 주석을 삭제한다. `--bg-guide` 토큰은 옛 홈 가이드 카드의 것이라 이번 범위가 아니다.

### 3. 네이티브 연동

- 웹 `lib/nativeTabBar.ts`의 `FULL_SCREEN_PATHS`에서 `/onboarding-guide`를 뺀다. 리다이렉트된 `/home`은 탭바가 보이는 화면이라 맞다.
- 웹 `lib/nativeScreenReport.ts`의 가이드 복원 쿼리 분기를 지운다.
- 앱 `lib/pushNotificationRouting.ts`의 `WEB_PATH_TAB`에서 `/onboarding-guide`를 뺀다. `tabDeepLink.ts`가 이 표를 허용 목록으로 쓰므로, 이 주소로 오는 딥링크는 탭 첫 화면을 연다.

### 4. 분석 이벤트

- `lib/amplitude.ts`의 `trackGuideEntered`·`trackGuideStepViewed`·`trackGuideFinished`를 삭제한다.
- `lib/metaAppEvents.ts`의 `META_TUTORIAL_COMPLETION_EVENT`·`trackMetaTutorialCompleted`를 삭제한다. 네이티브는 이벤트 이름을 해석하지 않으므로 앱은 고칠 것이 없다.
- `lib/firebaseAnalyticsBridge.ts`의 `FIREBASE_USER_PROPERTY_KEYS`에서 `guide_finished`를 뺀다.

### 5. 주석

가이드를 근거로 쓰던 주석을 지금 동작에 맞게 고친다. 대상은 `lib/nativeBackGesture.ts`(이제 라이브룸이 쓴다), `lib/sessionStart.ts`, `lib/historyGuard.ts`, `packages/types/src/bridge.ts`의 `start-session`·`set-tab-bar`·`SetBackGestureMessage`·`meta-app-event` 설명, `HomeTabPage.tsx`, `lazyRoutes.ts`, `SettingsPage.tsx`의 문의 행, `features/records/MonthCalendar.tsx`·`useHorizontalSwipe.ts`, 앱 쪽 주석(`(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `app/_layout.tsx`, `RemoteWebViewHost.tsx`, `auth.ts`, `nativeBridgeHandler.ts`, `tabBarVisibility.ts`), `apps/web/CLAUDE.md`와 루트 `CLAUDE.md`의 "온보딩" 화면 목록이다.

## 테스트

- 삭제: `features/onboarding/__tests__/`의 `focusStartFlow`·`onboardingComponents`·`onboardingGuideSteps`·`onboardingGuideStore` 테스트, `routes/__tests__/OnboardingGuidePage.test.tsx`·`OnboardingGuidePage.navigateSpy.test.tsx`.
- 이동: `useFocusStart.test.tsx`를 `lib/__tests__/`로 옮기고 가이드 케이스를 뺀다. 세션 시작, 연타 한 번만 시작, 햅틱 케이스를 남긴다.
- 추가: `/onboarding-guide?userId=7&entry=focus-start`가 `/home?userId=7`로, `/onboarding-guide?entry=settings`가 `/home`으로 리다이렉트되는지 확인하는 테스트.
- 수정: `HomeTabPage`·`settingsPage`·`lazyRoutes`·`nativeTabBar`·`nativeScreenReport`·`historyGuard`·`amplitude`·`metaAppEvents`·`firebaseAnalyticsBridge` 테스트에서 가이드 관련 목·단언을 걷어 낸다. 설정 화면의 타임랩스 행 순서 테스트는 아래 기준을 가이드 행이 아닌 다른 행으로 바꾼다. 앱 `pushNotificationRouting.test.ts`의 가이드 행을 뺀다.
- 완료 조건: `pnpm lint`·`pnpm typecheck`·`pnpm test` 통과, `git grep -i "onboarding-guide\|onboardingGuide\|trackGuide"`가 리다이렉트·과거 기록 문서 말고는 비어 있을 것, 설정 화면 라이트·다크 스크린샷.
