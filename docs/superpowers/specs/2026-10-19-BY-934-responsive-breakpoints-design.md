# BY-934 반응형 기준 정의 설계

상위 티켓 BY-641(태블릿 반응형 대응)의 첫 하위 작업이다. 화면별 태블릿 배치(BY-936·937)와 앱 셸(BY-935)이 쓸 공통 기준을 정의한다.

## 배경

- 웹에는 브레이크포인트 설정이 없어 Tailwind 기본값(640·768·1024·1280·1536)이 그대로였고, `md:`·`lg:`·`xl:` variant는 쓰는 곳이 없었다.
- `sm:`은 19곳이 모두 shadcn 다이얼로그 장식이었다.
- 세션·소셜룸 5개 파일의 `landscape:` 61곳은 높이가 낮은 폰 거치 화면을 전제로 했는데, iPad 가로와 PC 브라우저에도 같은 배치가 나왔다.
- `SCR-S3-5-S3-6-session-landscape.md`는 이 문제를 "가로 조건에 높이 상한을 거는 선택지"와 함께 미결로 남겨 뒀다.

## 결정

| 항목                | 결정                                                                                     | 이유                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 브레이크포인트 이름 | `sm`·`md`·`lg`·`xl` 유지                                                                 | shadcn·기존 코드와 호환된다. 기기 이름은 창 폭 조건과 어긋난다(가로 폰 956px이 `tablet:`에 걸린다) |
| 브레이크포인트 값   | 37.5 / 52.5 / 75 / 100rem, `2xl` 제거                                                    | Material 창 크기 클래스(600·840·1200·1600). 단위는 Tailwind 기본과 같은 rem                        |
| 폰 가로 variant     | `landscape-compact:` = `(orientation: landscape) and (height < 30rem)`                   | 폰 가로는 폭으로 가를 수 없다. 480은 Material compact height 경계                                  |
| 기존 `landscape:`   | 61곳 전부 `landscape-compact:`로 교체                                                    | `landscape:` 자체를 재정의하면 이름과 뜻이 달라진다                                                |
| JS 방향 판정        | 타이머 이동 거리만 CSS와 같은 조건으로 바꾼다                                            | 회전 마스크·회전 분석 이벤트는 실제 방향이 맞다                                                    |
| container query     | Tailwind 기본 크기 그대로                                                                | 커스텀할 근거가 없다                                                                               |
| Figma               | 이번 작업은 없음. 태블릿 프레임은 BY-936·937에서 V2 파일의 `Tablet v2.0` 페이지에 만든다 | 폰 화면은 바뀌지 않는다                                                                            |

## 변경

### `apps/web/src/index.css`

```css
@theme {
  --breakpoint-*: initial;
  --breakpoint-sm: 37.5rem;
  --breakpoint-md: 52.5rem;
  --breakpoint-lg: 75rem;
  --breakpoint-xl: 100rem;
}

@custom-variant landscape-compact (@media (orientation: landscape) and (height < 30rem));
```

### `landscape:` 교체 대상

- `routes/RoomPage.tsx`
- `features/live-room/components/RoomGrid.tsx`
- `features/live-room/LiveRoomSession.tsx`
- `features/study-session/components/SessionTimer.tsx`
- `features/study-session/components/SubjectSheet.tsx`

### `RoomPage.tsx`의 `SheetFollowingSlot`

- 이동 거리 0 조건을 `currentOrientation() === "landscape"`에서 "가로이면서 `innerHeight < 480`"으로 바꾼다.
- 판정 함수 `sheetTimerTravel`은 `features/study-session/sheetTimerTravel.ts`에 두고, CSS의 30rem과 같은 값이라는 주석을 단다. 컴포넌트 파일에서 일반 함수를 export하면 `react-refresh/only-export-components` 경고가 나서 따로 뺐다.
- `useRotationPhase`와 `useSessionOrientationAnalytics`는 실제 방향을 계속 쓴다.

## 결과로 달라지는 화면

| 화면                         | 바뀐 뒤                                       |
| ---------------------------- | --------------------------------------------- |
| 폰 세로·가로                 | 변화 없음                                     |
| 태블릿 가로 세션·소셜룸      | 세로 배치를 넓게 보여준다. 전용 배치는 BY-936 |
| PC 브라우저 세션             | 세로 배치. SCR-S3-5의 정책 공백 해소          |
| 폭 600~640px 창의 다이얼로그 | `sm:` 스타일이 40px 일찍 적용된다             |

## 테스트

- 클래스 문자열을 단언하는 기존 테스트(`sessionLandscape.test.tsx`, `LiveRoomPage.test.tsx`)를 새 이름으로 바꾼다.
- 타이머 이동 거리: 폰 가로(874×402)는 0, 태블릿 가로(1180×820)는 0이 아니다.
- jsdom은 미디어 쿼리를 평가하지 않으므로 실제 배치는 브라우저에서 뷰포트를 바꿔 확인한다.

## 문서

- `focusmakers-design` 스킬에 "반응형 기준" 절을 추가한다(브레이크포인트·기기 대응표, `landscape-compact:` 규칙, 부품은 container query·페이지 골격은 브레이크포인트).
- `SCR-S3-5-S3-6-session-landscape.md`의 데스크톱 정책 공백 항목을 해소로 표시한다.

## 범위 밖

- 태블릿 전용 배치(BY-936·937), 앱 셸 회전·탭 바(BY-935).
- px 임의값의 rem 전환과 IntelliSense 표기 정리(BY-938).
