# BY-769 토스트를 Sonner로 교체하고 탭 바 가림 해결

- 티켓: BY-769 (BY-729와 관련)
- 브랜치: `fix/BY-769-sonner-toast` (base `dev`, 8be1ec48)
- 작성일: 2026-09-28

## 목표

BY-729에서 하단 탭 바가 웹뷰 위에 떠 있는 네이티브 플로팅 바로 바뀌었다.
토스트는 예전 레이아웃 기준인 `safe-area + 16px`에 떠서 탭 바(바닥에서 약 34~104px) 뒤로 완전히 가려진다.
탭 바는 네이티브 뷰라 z-index로는 풀 수 없다.

이참에 직접 만든 토스트(`Toast`, `ToastViewport`, `useToast`)를 shadcn 관례인 Sonner로 바꾸고, 위치는 라우트가 정하게 한다.

## 확정한 결정

| 항목                | 결정                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| 룩                  | 기존 다크 회색 알약 유지(라이트·다크 공통, 흰 글자 13px). 새 시안·토큰 없음 |
| 탭 바 화면 위치     | 탭 바 바로 위(`var(--tab-bar-reserve)`, 탭 바 윗변 + 8px)                   |
| 하단 버튼 화면 위치 | 지금처럼 버튼 12px 위. 전용 Toaster를 버튼 영역에 붙인다                    |
| 여러 개             | 한 번에 하나. 새 토스트가 이전 것을 대체한다                                |
| 스와이프 닫기       | 허용(Sonner 기본)                                                           |
| 표시 시간           | 5초                                                                         |
| 의존성              | `sonner@^2.0.8` 추가. `next-themes`는 넣지 않는다                           |

## 설계

### 1. `components/ui/sonner.tsx`

`pnpm --filter web dlx shadcn@latest add sonner`로 받은 뒤 고친다.

- `next-themes`의 `useTheme`를 걷어낸다. 룩이 모드와 무관하게 고정이라 테마를 넘길 필요가 없다.
- 기본값: `position="bottom-center"`, `duration={5000}`, `visibleToasts={1}`.
- 호출은 `lib/toast.ts`의 `showToast`·`showCtaToast`로 한다. 고정 id로 불러 새 토스트가 이전 것을 제자리에서 대체하게 한다. `visibleToasts={1}`만으로는 이전 토스트가 숨겨진 채 남아, 새 토스트를 밀어 닫으면 다시 나타난다.
- `toastOptions.unstyled`로 Sonner 기본 룩을 끄고 `classNames.toast`에 기존 알약 클래스를 넣는다.
  - 배경은 기존과 같은 `bg-[var(--session-toast-bg,rgba(78,89,104,0.96))]`.
  - 문구 줄바꿈(`\n`)을 살리려고 `whitespace-pre-line`을 유지한다.
- Sonner는 600px 이하에서 토스트를 화면 폭으로 늘린다. `w-fit`과 좌우 `auto` 여백으로 알약 폭을 문구에 맞춘다.
- `offset`과 `mobileOffset`을 둘 다 받는다. 웹뷰는 늘 600px 이하라 실제로는 `mobileOffset`이 쓰인다.

### 2. 전역 Toaster: `App.tsx`

- `<Routes>`와 같은 층에 한 번만 둔다. Sonner 2.0.8은 늦게 구독한 Toaster에도 이미 떠 있는 토스트를 다시 넘겨주므로, 화면의 마운트 effect에서 부른 토스트(소셜 홈의 인계 문구)도 순서와 상관없이 보인다.
- 아래 여백은 순수 함수 `toastBottomOffset(pathname, hasNativeBridge)`가 정한다.
  - 네이티브 브리지가 있고 탭 바가 보이는 라우트: `var(--tab-bar-reserve)`.
  - 전체 화면 라우트(`isFullScreenPath`), 네이티브 모달 라우트(`isNativeCoveredPath`), 브라우저 단독 모드: `calc(env(safe-area-inset-bottom) + 16px)`.
- Android 전용 8px 보정은 지운다. 예전 탭 바가 레이아웃 높이를 먹던 시절 값이다.
- 라우트가 바뀌면 전역 토스트를 닫는다. 예전 토스트는 화면 상태라 화면을 떠나면 사라졌는데, 전역 Toaster는 계속 살아 있어서 실패 토스트가 다음 화면의 버튼 위에 남을 수 있다.

### 3. 버튼 위 전용 Toaster

- 공부 세션(`RoomPage`)과 초대코드 공유(`InviteCodeSharePage`)가 버튼을 감싼 `relative` 영역 안에 `<CtaToaster />`를 둔다. 내부적으로 `id="cta"`인 Toaster이고, 스크린리더 이름은 `화면 알림`이다.
- 이 Toaster는 `fixed` 대신 부모 기준 `absolute`로 두고, 아래 여백을 `calc(100% + 12px)`로 준다.
- 두 화면은 `showCtaToast(msg)`로 부른다. 이 함수는 `toasterId: "cta"`를 붙이고, 전역 Toaster는 `toasterId`가 없는 토스트만 그리므로 겹치지 않는다.
- 가로 모드 격자에서도 버튼 영역을 따라간다.
- `CtaToaster`가 사라질 때 CTA 토스트를 닫는다. Sonner의 5초 타이머는 토스트 컴포넌트 안에 있어서, 그대로 두면 스토어에 남았다가 다음 `CtaToaster`에서 다시 뜬다.

### 4. 호출부

| 화면                  | 바뀌는 것                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `SettingsPage`        | `useToast`, `<ToastViewport>`, `toast-rise` 클래스를 지우고 `showToast(msg)`. 프로필 저장 토스트의 450ms 지연은 유지 |
| `SocialHomePage`      | `useToast`, `<ToastViewport>`를 지우고 `showToast(msg)`. 인계 문구 처리 흐름은 유지                                  |
| `InviteCodeSharePage` | 인라인 `<Toast>`를 `<CtaToaster />`로, 호출은 `showCtaToast(msg)`                                                    |
| `RoomPage`            | 위와 같다                                                                                                            |

### 5. 모션과 접근성

- 등장·퇴장은 Sonner가 맡는다. `index.css`의 `@keyframes toast-rise`를 지운다.
- 움직임 줄이기는 Sonner 내장 CSS(`prefers-reduced-motion`에서 전환·애니메이션 끔)가 처리한다. `unstyled`여도 이 규칙은 남는다.
- 스크린리더는 Sonner가 그리는 `aria-live="polite"` 영역이 읽는다.
- 알약은 누르는 요소가 아니라 44px 터치 타겟 대상이 아니다. 스와이프는 부가 동작이다.

### 6. 삭제

- `components/ui/toast.tsx`, `lib/useToast.ts`와 두 파일의 테스트.
- `index.css`의 `@keyframes toast-rise`.
- `sessionTheme.ts`의 `--session-toast-bg`는 알약 배경색으로 계속 쓰므로 남긴다.

### 7. 문서

- `DESIGN.md`의 `Toast` / `ToastViewport` 행을 Sonner 기준으로 고친다.
- `focusmakers-design/references/shadcn-map.md`의 토스트 행("sonner 보류")을 채택으로 고친다.
- `focusmakers-design/SKILL.md`의 "토스트 위치는 `ToastViewport`가 소유한다" 문구를 고친다.

## 테스트

### 새 테스트

- `toastBottomOffset`: 탭 라우트, 전체 화면 라우트, `/room/` 라우트, 브라우저 단독 모드의 반환값.
- 전역 Toaster: 화면 마운트 effect에서 부른 토스트가 `App` 안에서 보인다.
- 전용 Toaster: `toasterId: "cta"` 토스트는 전용 Toaster에만 뜨고 전역 Toaster에는 뜨지 않는다.

### 고치는 테스트

`role="status"`로 토스트를 찾던 화면 테스트 6개를 문구로 찾게 바꾼다.

- `socialPages.test.tsx`, `settingsPage.test.tsx`, `RoomPage.test.tsx`, `LiveRoomPage.test.tsx`, `ProfilePage.test.tsx`, `sessionLandscape.test.tsx`

## 검증

- 라이트·다크 스크린샷(설정, 소셜 홈, 초대코드 공유, 공부 세션 세로·가로).
- 움직임 줄이기 켠 상태에서 애니메이션이 꺼지는지.
- 실기기 iOS·Android에서 설정 버전 복사 토스트가 탭 바에 가리지 않는지.
