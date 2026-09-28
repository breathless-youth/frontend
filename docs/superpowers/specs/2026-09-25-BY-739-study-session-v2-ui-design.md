# BY-739 공부 세션(싱글) 페이지 V2 설계

날짜: 2026-09-25
티켓: BY-739 (부모 BY-652), 관련 BY-722(완료)
시안: Figma V2 `S1b · 싱글 공부 세션 (Soft Blue)`
라이트 `node-id=5519-5022` / 다크 `node-id=5519-5023`

## 목표

사용자가 공부를 측정하는 동안 보는 `/room/:id` 메인 화면(`RoomPage`)을 V2 시안으로 다시 그린다. 손으로 만든 컨트롤 바 버튼, 상태 배지, 아이콘을 저장소 shadcn 프리미티브(`Button`, `Badge`)와 lucide 아이콘으로 바꾼다.

대상은 6개 화면 상태다: 측정 중 · 비집중(휴대폰 사용) · 일시정지 · 심플 모드 · 가로 측정 중 · 가로 심플 모드. 전부 `RoomPage` 하나가 조립하는 같은 컴포넌트 트리의 state 분기다.

## 범위 밖

- `SessionConfirmDialog`(종료 확인 다이얼로그)는 이번 시안 섹션에 없다.
- `AutoEndNotice`·`SubMinuteEndNotice`·`SessionRecoveryDialog`는 BY-722에서 이미 끝냈다.
- 소셜룸 `RoomControlBar`와 거기서만 쓰는 `session-camera.svg`·`session-camera-off.svg`.
- 가로/세로 레이아웃 분기(Tailwind `landscape:` 그리드)와 심플 모드 on/off 로직은 `RoomPage.tsx`가 그대로 소유한다. 이번 티켓은 그 안의 컨트롤 바·배지·아이콘만 바꾼다.

## 테마: 컨트롤 바만 라이트/다크를 따른다

`sessionTheme.ts`는 세션 서브트리 전체를 시스템 테마와 무관하게 항상 다크로 고정한다. Figma를 보면 카메라 오버레이·타이머·상태 필은 라이트/다크 두 프레임에서 값이 같고(카메라 프리뷰 자체가 어두워서), **컨트롤 바만** 배경·아이콘 색이 다르다.

그래서 강제 다크는 그대로 두고 컨트롤 바만 예외로 뺀다. 새 세션 로컬 변수를 늘리지 않고 이미 라이트/다크를 따라가는 시맨틱 토큰을 쓴다.

- 기본 버튼(일시정지·카메라 전환): 배경 `bg-bg-layer-2`, 아이콘 `text-foreground`. 라이트에서는 밝은 회색 바탕에 남색 아이콘, 다크에서는 어두운 바탕에 흰 아이콘이 된다.
- 재생(파란 원)·종료(빨간 원) 버튼: 시안에서 두 모드 색이 같으므로 지금 있는 세션 로컬 변수(`--session-resume-bg`, `--session-exit-bg`)를 그대로 쓴다. 아이콘 색은 `text-primary-foreground`(라이트·다크 모두 흰색)로 고정한다.
- 컨트롤 바 자체 배경(`sessionControlBarVariants`)도 같은 방식으로 시맨틱 토큰으로 바꾼다. 정확한 톤은 구현하면서 스크린샷으로 시안과 맞춘다.

## 크기: 세로·가로 버튼을 54px로 통일한다

지금 코드는 `SessionControlBar`에 `md`(세로 50px)·`sm`(가로 44px)·`responsive` 세 갈래 cva 크기 체계가 있고 `ICON_SIZE` 표로 아이콘 크기까지 갈라놓았다. Figma 메타데이터를 보면 세로 컨트롤 바(`control-bar`, 212×76)와 가로 컨트롤 바(`control-bar`, 212×76)가 정확히 같은 크기이고 버튼도 54px로 동일하다. 가로에서만 줄어드는 지금 구조는 V2 시안에 없다.

그래서 크기 분기 체계를 통째로 걷어내고 세로·가로 모두 54px 고정 버튼, 고정 간격·패딩의 단일 컨트롤 바로 만든다. `Button`의 새 `size="icon"`이 이 54px 원형 버튼을 맡는다.

## 컴포넌트별 변경

### `components/ui/button.tsx`

`size: "icon"` variant를 추가한다(`h-[54px] w-[54px] rounded-full p-0`). 기존 `default`/`sm`/`lg`/`xl`과 `variant` 목록은 건드리지 않는다.

### `components/ui/badge.tsx`

`session-focus`/`session-distract`/`session-paused` variant를 추가한다. 색은 지금 `SessionStatusPill`이 쓰는 세션 로컬 변수(`--session-pill-bg`, `--session-pill-bg-distract`, `--session-pill-bg-paused`)를 그대로 물려받는다. 배지는 계속 강제 다크 서브트리 안에 있으므로 라이트/다크 분기가 필요 없다. 시안대로 점 없이 문구만 넣는다. 기존 `elevated`/`outline` variant는 건드리지 않는다.

### `SessionControlBar.tsx`

- `sessionControlBarVariants`·`controlButtonVariants`의 `size` 축(`md`/`sm`/`responsive`)과 `ICON_SIZE` 표를 제거한다.
- 버튼 3개를 `Button size="icon"`으로 바꾼다. `default`(일시정지/카메라 전환)·`resume`(파란 재생)·`exit`(빨간 종료) 세 배경 색만 className으로 준다.
- pause/play/exit 아이콘을 lucide(`Pause`/`Play`/`LogOut`)로 바꾼다. 커밋된 svg 파일(`session-pause.svg`, `session-play.svg`)은 지운다. `session-exit.svg`는 `RoomControlBar`도 쓰므로 파일은 남기고 이 컴포넌트의 import만 lucide `LogOut`으로 바꾼다.
- 카메라 전환 아이콘은 `CameraFlipIcon`을 그대로 쓴다(실기기 피드백으로 만든 "몸통 고정, 화살표만 반 바퀴 회전" 모션을 유지). 버튼이 54px로 커지는 비율에 맞춰 아이콘 컨테이너도 20px 안팎에서 22px 안팎으로 키워 몸통이 지금보다 크게 보이게 한다. 정확한 값은 구현 중 스크린샷 대조로 정한다. `stroke="white"`로 고정된 두 `<path>`는 `stroke="currentColor"`로 바꿔 버튼 아이콘 색(`text-foreground`/`text-primary-foreground`)을 그대로 물려받게 한다.
- 눌림 스케일(`active:scale-90`), `disabled`(`flipDisabled`) 처리, 아이콘 교체 시 팝 애니메이션(`control-icon-pop`)은 그대로 유지한다.

### `SessionStatusPill.tsx`

내부 렌더링을 직접 만든 `div` 대신 `Badge`로 바꾼다. `dotVariants`와 색 점 `<span>`을 제거한다. `subLabel` prop과 그 아래 보조 문구 `<p>`를 제거한다(아래 "삭제" 절 참고). `role="status"`/`aria-live="polite"` 래퍼는 그대로 유지한다.

## 보조 문구·캡션 삭제

지금 코드에는 이번 Figma 섹션에 없는 문구가 두 종류 있다. 둘 다 삭제한다(사용자 확정).

- 상태 필 아래 보조 문구: `sessionCopy.ts`의 `SessionStatusCopy.subLabel` 필드, `DISTRACTION_COPY`(AWAY/PHONE/DEVICE)와 `PAUSE_COPY`의 `subLabel` 값을 지운다. `RoomPage.tsx`에서 `subLabel={statusCopy.subLabel}`로 넘기던 자리를 정리한다.
- 하단 프라이버시·일시정지 캡션: `sessionCopy.ts`의 `PRIVACY_CAPTION`, `PAUSE_CAPTION`, `captionFor()`를 지운다. `RoomPage.tsx`의 `<SessionCaption text={captionFor(sessionState)} />` 렌더를 지운다. `SessionCaption.tsx` 파일은 다른 곳에서 쓰이지 않는 것을 확인했으므로 파일째 지운다.

`features/onboarding/SessionMockBackdrop.tsx`와 `onboardingGuideSteps.ts`도 `subLabel`이라는 이름을 쓰지만 `sessionCopy.ts`를 import하지 않는 독립된 온보딩 목업이라 영향이 없다. 건드리지 않는다.

## 접근성과 모션

- 누를 수 있는 요소는 모두 44px 이상이다(54px 버튼이라 자동으로 충족).
- 모션 축소 환경에서 전환 애니메이션이 빠진다(`motion-reduce:transition-none`/`motion-reduce:animate-none` 기존 패턴 유지).
- 글자 대비는 WCAG AA를 넘는다.
- 색만으로 의미를 전달하지 않는다. 배지 문구가 그 역할을 대신하므로 점을 빼도 접근성 요건은 유지된다.

## 테스트

`SessionControlBar`·`SessionStatusPill`의 cva 구조가 바뀌고 caption·subLabel이 없어지므로 기존 테스트에서 그 부분을 단언하던 곳을 손본다. 상태·aria·텍스트만 단언하고 클래스 문자열은 단언하지 않는 원칙은 그대로 따른다.

- `RoomPage.test.tsx`, `RoomPage.autoEnd.test.tsx`, `RoomPage.restore.test.tsx`
- `sessionLandscape.test.tsx`, `SessionStatusPill.test.tsx`, `CameraPreviewSurface.test.tsx`
- `sessionControlBarEffects.test.tsx`, `sessionTheme.test.ts`
- `sessionCopy.test.ts` (subLabel·caption 관련 단언 제거)

## 완료 조건

- 6개 화면 상태가 라이트와 다크에서 시안과 같은 색, 간격, 배지 문구로 보인다.
- 화면 상태마다 라이트와 다크 스크린샷이 한 장씩, 모두 12장 남는다.
- 컨트롤 바 버튼 3개가 `components/ui`의 `Button`(`size="icon"`)을 쓴다.
- 상태 배지가 `components/ui`의 `Badge`를 쓴다.
- 컨트롤 바 아이콘 4종 중 3종(pause/play/exit)이 lucide를 쓰고, 카메라 전환은 `CameraFlipIcon`을 유지한다.
- 컨트롤 바가 라이트/다크를 따르고 나머지 세션 화면은 계속 강제 다크다.
- 세로·가로 모두 버튼 54px 고정이고, 가로에서만 줄어들던 44px 분기가 없다.
- 상태 필 보조 문구와 하단 프라이버시·일시정지 캡션이 화면에 없다.
- 가로 모드와 심플 모드 전환이 지금과 똑같이 동작한다.
- 누를 수 있는 요소가 모두 44px 이상이고 모션 축소가 지켜진다.
- 위 9개 테스트가 통과한다.

## 확인이 필요한 부분

- 컨트롤 바 배경의 정확한 시맨틱 토큰 조합(불투명도 포함)은 시안 실측치가 없어 구현 중 스크린샷 대조로 정한다.
- 카메라 전환 아이콘 컨테이너의 정확한 확대 비율(20px→22px 안팎)도 스크린샷 대조로 미세 조정한다.
