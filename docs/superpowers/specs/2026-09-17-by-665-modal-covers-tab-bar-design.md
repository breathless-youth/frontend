# BY-665 모달이 열린 동안 네이티브 탭 바 차단 설계

- 대상: `apps/web`, `apps/mobile`, `packages/types`
- 관련 티켓: BY-665 (관련 BY-342 — `set-tab-bar` 브릿지를 처음 넣은 티켓)
- 브랜치: `fix/BY-665-modal-covers-tab-bar` (base `main`)
- 작성일: 2026-09-17

## 배경

웹 모달이 떠 있어도 하단 탭 바를 누르면 화면이 바뀐다. 탭 바는 웹뷰 바깥에 네이티브로 그려지고, 네이티브 View는 언제나 웹뷰 위에 놓인다. 웹 모달의 `fixed inset-0`은 화면 전체가 아니라 그 웹뷰 전체를 뜻하므로 탭 바 영역에 닿지 못한다. 웹 오버레이로 덮는 방법은 원리상 없고, 네이티브가 스스로 비켜 주거나 스스로 가려야 한다.

`set-tab-bar` 브릿지가 이미 그 통로다. 전체 화면 웹 라우트에서 탭 바를 감추려고 BY-342에서 만들었고, 빠진 것은 "지금 모달이 열려 있다"는 입력 하나뿐이다.

## 검토한 대안

**웹 모달을 네이티브 화면으로 승격**(Hotwire Turbo Native, Shopify Mobile Bridge). 하이브리드의 정석이지만 모달마다 네이티브 화면 정의가 붙고, 우리가 띄우지 않는 Amplitude 모달은 감쌀 수 없다.

**웹뷰를 탭 바 영역까지 확장.** 네이티브 View가 웹뷰 위에 그려지는 순서는 그대로라 증상이 남는다. 화면만 넓어진다.

**탭 바를 통째로 감춤.** 새 코드가 거의 없지만 탭 바 자리까지 사라져 웹뷰가 약 76px 커진다. 화면 중앙에 뜨는 모달 카드가 열릴 때 아래로, 닫힐 때 위로 한 번씩 튄다.

## 결정

탭 바를 자리에 둔 채 딤을 씌우고 터치만 막는다. iOS가 탭 바 컨트롤러 위에 시트를 올렸을 때의 동작과 같고, 웹뷰 높이가 변하지 않아 모달 카드가 제자리에 머문다.

## 브릿지 메시지

기존 `SetTabBarMessage`에 선택 필드를 더한다. 새 메시지 타입을 파지 않는 이유는 하위호환이다.

```ts
export interface SetTabBarMessage {
  type: "set-tab-bar";
  visible: boolean;
  blockedByModal?: boolean;
  atMs: number;
}
```

| 상황             | 보내는 값                                |
| ---------------- | ---------------------------------------- |
| 평소             | `visible: true`                          |
| 전체 화면 라우트 | `visible: false`                         |
| 모달이 열림      | `visible: false`, `blockedByModal: true` |

현재 스토어 버전(`android/1.0.2-9` 확인)의 `parseToNativeMessage`는 아는 키만 뽑아 새 객체를 만든다. 모르는 필드가 와도 메시지를 버리지 않으므로 구버전 앱은 `visible: false`만 읽고 탭 바를 통째로 감춘다. 카드가 한 번 튀는 대신 탭이 눌리는 문제는 앱 업데이트 전에 사라진다. 필드 없이 갔다면 새 앱에서도 같은 폴백에 머문다.

전체 화면 라우트가 이미 탭 바를 감춘 상태라면 `blockedByModal`을 보내지 않는다. 소셜룸에서 카메라 확인 모달이 뜰 때 사라졌던 탭 바가 딤을 그리려고 되살아나는 것을 막는다.

같은 이유로 솔로 세션(`/room/:id`, `/room/:id/result`)에서도 보내지 않는다. 이 경로는 전체 화면 라우트가 아니지만 네이티브가 `fullScreenModal`로 띄워 탭 바를 이미 덮는다. 보이지 않는 탭 바를 차단 상태로 바꿔 두면 세션 웹뷰가 닫힘 신호를 보내기 전에 죽었을 때 그 상태가 남는다. 판정은 `isNativeCoveredPath`가 한다.

## 모달 감지 — `apps/web/src/lib/nativeModalOverlay.ts` (신규)

문서에 `aria-modal="true"` 요소가 있는지를 `MutationObserver`로 관찰하는 모듈 스코프 스토어다. `apps/mobile/lib/tabBarVisibility.ts`와 같은 모양이고, 웹 쪽 짝이다.

- 관찰 대상은 `document.body`, 옵션은 `{ childList: true, subtree: true }`. 우리 모달도 Radix 모달도 열고 닫힐 때 요소가 붙었다 떨어지므로 속성 변화는 보지 않는다.
- 값은 `document.querySelector('[aria-modal="true"]') !== null`. 바뀔 때만 구독자에게 알린다.
- 관찰은 첫 구독에서 시작하고 마지막 구독 해제에서 끊는다. `document`가 없는 환경에서는 관찰하지 않고 `false`를 돌려준다.
- `useModalOverlayOpen()`이 `useSyncExternalStore`로 값을 읽는다.
- 테스트용 초기화 함수를 둔다(`__resetModalOverlayForTests`).

모달마다 훅을 부르지 않는 이유는 `nativeTabBar.ts` 주석에 이미 적힌 것과 같다. 새 모달을 만드는 사람이 한 번 빠뜨리면 같은 버그가 보고 없이 되살아난다. 지금 손으로 만든 모달만 셋이다.

토스트나 툴팁처럼 아래를 막지 않는 오버레이에는 이 속성이 없어 저절로 빠진다. `aria-modal`을 달았는데 탭 이동을 허용해야 하는 오버레이가 있다면 그 속성이 틀린 것이다. 지금 저장소에는 없으므로 예외 목록을 만들지 않는다.

딤 여부는 보내지 않는다. 다섯 모달의 딤이 형제·자식·자신으로 제각각 달려 있어 바깥에서 일반적으로 읽어낼 방법이 없고, 우리 모달은 전부 딤을 깐다. 네이티브가 항상 공유 토큰의 딤을 그린다.

## 발신 — `apps/web/src/lib/nativeTabBar.ts`

`useNativeTabBarSync`가 경로와 모달 상태를 합쳐 보낸다.

- `routeHidden = isFullScreenPath(pathname)`
- `visible = !routeHidden && !modalOpen`
- `blockedByModal`은 `modalOpen && !routeHidden`일 때만 싣는다.
- effect 의존성에 `modalOpen`을 더한다. `pageshow(persisted)` 재발신은 그대로 둔다.

## 수신 — `apps/mobile`

**`lib/webBridge.ts`** — `blockedByModal`이 `true`일 때만 필드를 싣는다. 값이 이상해도 메시지를 통째로 버리지 않는다. 버리면 탭 바 신호 자체가 사라져 지금보다 나빠진다(`share`의 `url` 처리와 같은 이유).

**`lib/tabBarVisibility.ts`** — boolean을 `"visible" | "hidden" | "blocked"` 세 상태로 넓힌다. 기본값은 `"visible"` 그대로다.

**`lib/nativeBridgeHandler.ts`** — `blockedByModal`이면 `"blocked"`, 아니면 `visible`에 따라 `"visible"` 또는 `"hidden"`.

**`components/RemoteScreen.tsx`** — 포커스를 되찾을 때 재보고하는 `lastTabBarVisibleRef`가 boolean 하나만 들고 있다. 상태 전체를 들도록 바꾼다.

**`app/(tabs)/_layout.tsx`**

- `"hidden"`이면 지금처럼 `null` — 자리까지 없앤다.
- `"blocked"`면 `TabBar` 위에 `StyleSheet.absoluteFill` 딤 View를 얹는다. 색은 `colors.bg.dim[scheme]`, 스킴은 `TabBar`와 같이 `useColorScheme()`으로 읽는다. 이 View가 터치를 받아 삼키므로 탭이 눌리지 않는다.
- `"visible"`이면 지금 그대로.

딤에 전환 애니메이션을 넣지 않는다. 웹의 `DialogOverlay`도 즉시 나타나므로 맞춘다. 움직임이 없어 `prefers-reduced-motion`에 걸릴 것도 없다.

## 테스트

**`apps/web/src/lib/__tests__/nativeModalOverlay.test.tsx`**

- 모달이 없으면 닫힘이다.
- `aria-modal="true"` 요소가 붙으면 열림, 떨어지면 닫힘으로 바뀐다.
- `aria-modal`이 없는 오버레이는 열림으로 보지 않는다.

"같은 값이면 구독자를 깨우지 않는다"와 "마지막 구독 해제 시 관찰을 끊는다"는 넣지 않았다. `useSyncExternalStore` 바깥에서 관찰하려면 모듈 내부를 노출해야 해서 동작이 아니라 구현 세부를 고정하는 테스트가 된다.

**`apps/web/src/lib/__tests__/nativeTabBar.test.tsx`** (기존 파일 확장)

- 모달이 열리면 `visible: false`와 `blockedByModal: true`를 보낸다.
- 모달이 닫히면 경로 기준 값으로 돌아온다.
- 전체 화면 라우트에서는 모달이 열려도 `blockedByModal`을 싣지 않는다.

**`apps/mobile/lib/__tests__/webBridge.test.ts`** (기존 파일 확장)

- `blockedByModal: true`를 파싱한다.
- `blockedByModal`이 boolean이 아니면 그 필드만 버리고 메시지는 살린다.

**`apps/mobile/lib/__tests__/tabBarVisibility.test.ts`** (기존 파일 확장)

- 세 상태 전이와 기본값.
- `set-tab-bar` 메시지가 상태로 옮겨지는 조합 네 가지.

**`apps/mobile/__tests__/tabs-layout.test.tsx`** (기존 파일 확장)

- `"blocked"`면 `TabBar`가 남고 딤이 덮인다.
- `"hidden"`이면 `TabBar`가 사라진다.

**`apps/mobile/components/__tests__/RemoteScreen.test.tsx`** (기존 파일 확장)

- 포커스를 되찾을 때 마지막 상태가 `blockedByModal`까지 실려 재보고된다.

## 검증

- 브라우저에서 세션 복구 모달을 띄우고 브릿지 메시지의 순서와 값을 센다. 눈으로 보지 않고 발신 로그로 본다.
- 실기기에서 앱을 강제 종료한 뒤 다시 켜 세션 복구 모달을 띄우고, 탭을 눌러도 화면이 바뀌지 않는지 본다. 라이트와 다크 양쪽을 본다.
- Amplitude 콘솔에서 테스트 가이드를 띄워 같은 동작이 나오는지 본다. 재현하지 못하거나 `aria-modal`을 달지 않으면 그 사례만 후속 티켓으로 뗀다.

## 범위 밖

- Amplitude가 `aria-modal`을 달지 않을 때의 대체 감지. 실기기에서 확인한 뒤 결정한다.
- 손으로 만든 모달 셋을 공용 `Dialog`로 합치는 일. 포커스 트랩과 Esc 처리를 얻는 개선이지만 이 버그와 별개다.
