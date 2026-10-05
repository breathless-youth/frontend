# BY-863 React Compiler가 건너뛰는 함수 7곳 정리 설계

## 배경

- BY-857로 두 앱에 `babel-plugin-react-compiler` 1.0.0을 켰다. 기본 `panicThreshold`가 `none`이라 컴파일러는 처리하지 못하는 함수를 경고 없이 원본 그대로 내보낸다.
- 플러그인을 logger와 함께 직접 돌린 기준선(`origin/dev` `afcd6086`)에서 웹 8곳·모바일 1곳이 컴파일되지 않았다.
- 그중 세션 화면 몸통인 `RoomSessionScreen`과 `useStudyRoomSession`이 빠져 있어, 지금은 메인 화면에서 컴파일러 효과가 거의 없고 BY-861 측정도 실제보다 작게 나온다.

### 기준선 (프로브 실측)

| 앱     | 파일                                                   | 함수                       | 사유                                    | 위치                           |
| ------ | ------------------------------------------------------ | -------------------------- | --------------------------------------- | ------------------------------ |
| 웹     | `src/routes/RoomPage.tsx`                              | `RoomSessionScreen`        | catch 없는 `try/finally`                | `handleFlipCamera`             |
| 웹     | `src/features/study-session/useStudyRoomSession.ts`    | `useStudyRoomSession`      | `??=` 2곳, `try/catch/finally`          | `endAndSubmit`                 |
| 웹     | `src/routes/SocialHomePage.tsx`                        | `SocialHomePage`           | `??=`                                   | 렌더 중 `noticeRef` lazy-init  |
| 웹     | `src/features/ambient-sound/useAmbientSound.ts`        | `useAmbientSound`          | `??=`                                   | effect 안 `playerRef`          |
| 웹     | `src/features/live-room/useBackgroundGraceWatch.ts`    | `useBackgroundGraceWatch`  | `??=`                                   | `onLeave` 콜백 `hiddenAtMsRef` |
| 웹     | `src/routes/InviteCodeJoinPage.tsx`                    | `InviteCodeJoinPage`       | `react-hooks/exhaustive-deps` 억제 주석 | 자동 열기 effect               |
| 모바일 | `app/_layout.tsx`                                      | `RootLayout`               | `??=`                                   | effect 안 `permissionPrompts`  |
| 웹     | `src/features/live-room/LiveRoomSession.tsx`           | `LiveRoomSession`          | 렌더 중 ref 접근(채널 생성)             | 범위 밖                        |
| 웹     | `src/features/study-session/useVisionReadyTracking.ts` | `useTrackedVisionDetector` | 렌더 중 ref 접근(감지기 생성)           | 범위 밖                        |

### 어떤 형태가 컴파일되는지 (프로브 실측)

| 형태                                                                       | 컴파일                                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `try { } finally { }`                                                      | 불가                                                                                                                                                  |
| `try { } catch { throw } finally { }`                                      | 불가. `finally` 절 자체를 컴파일러가 처리하지 못한다                                                                                                  |
| `promise.then().catch().finally()`                                         | 가능                                                                                                                                                  |
| `if (ref.current == null) ref.current = …` (effect·콜백·렌더 중 lazy-init) | 가능. 단 렌더 중에는 null 확인이 `if` 조건 전체여야 한다. `if (!handoff && ref.current == null)`처럼 다른 조건과 합치면 렌더 중 ref 접근으로 거부된다 |
| 억제 주석 제거 + 실제 의존성 배열                                          | 가능                                                                                                                                                  |

티켓 본문의 "다시 `throw`하는 `catch`를 명시" 대안은 이 실측으로 폐기한다.

### 목표

- 위 표의 범위 안 7개 함수가 모두 컴파일되고 `memoSlots`가 0보다 크다.
- 건너뛴 함수는 설계상 예외 2곳만 남는다.
- 사용자에게 보이는 동작은 바뀌지 않는다.

## 확정 결정

| 번호 | 결정                 | 내용                                                                                                                                                                                                                                                                                                                                                 |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `try/finally` 2곳    | `handleFlipCamera`와 `endAndSubmit`의 제출 구간을 `.then().catch().finally()` 프라미스 체인으로 바꾼다. 같은 훅의 스냅샷 전송(`.finally`)이 이미 쓰는 패턴이다. `.then(ok).catch(err)` 순서로 두어 성공 핸들러가 던진 오류도 `catch`가 받게 해 지금 `try/catch`와 의미를 맞춘다. `handleFlipCamera`는 지금처럼 `catch`가 없고 거부가 그대로 전파된다 |
| 2    | `??=` 6곳            | `if (x.current == null) x.current = …`로 바꾼다. `SocialHomePage`의 렌더 중 lazy-init은 바깥 `if (!handoff)`를 두고 그 안에 `if (noticeRef.current == null)`을 중첩한다. null 확인이 `if` 조건 전체일 때만 컴파일러가 초기 1회 대입으로 인정한다. 모바일 `_layout`은 바로 뒤의 `.then` 호출이 TS 좁히기를 받는지 typecheck로 확인한다                |
| 3    | `InviteCodeJoinPage` | 의존성을 `[code, storePlatform]`으로 적고 억제 주석과 "초깃값으로 고정" 주석을 지운다. 기존 `autoOpenTried` 가드가 재실행을 막아 동작이 같다. 지운 주석의 전제는 틀렸다. `code`는 입력으로 바뀌는 state다                                                                                                                                            |
| 4    | 테스트               | 새 테스트는 `InviteCodeJoinPage` 1건: 코드 입력이 바뀌어도 `openInApp`을 다시 부르지 않는다. 나머지는 순수 리팩터라 기존 vitest·jest 스위트로 판정한다                                                                                                                                                                                               |
| 5    | 컴파일 확인          | `.superpowers/rc-probe.cjs`(git 무시)로 기준선 9개 파일을 다시 돌려 `CompileError`가 범위 밖 2곳에만 남는지 본다. 테스트로 만들지 않는다. healthcheck는 통과·실패만 보고해 이 용도에 쓸 수 없다                                                                                                                                                      |
| 6    | 측정                 | 건너뛴 함수 9→2, 웹 운영 번들 `react.memo_cache_sentinel` 190→사후값, 모바일 Metro 번들(`transform.reactCompiler=true` 쿼리) 82→사후값, 웹 JS gzip 410,153 B→사후값을 PR 표로 남긴다                                                                                                                                                                 |
| 7    | 커밋 단위            | ① `refactor(web,mobile): 컴파일러가 처리하도록 ??= 대입을 null 확인으로 바꾼다`(BY-865) ② `refactor(web): 세션 제출과 카메라 전환의 finally를 프라미스 체인으로 바꾼다`(BY-866) ③ `refactor(web): 초대코드 화면의 exhaustive-deps 억제를 걷어낸다`(BY-867, 테스트·설계 문서 포함)                                                                    |
| 8    | 실기기               | iPhone Dev Client: 세션 시작, 카메라 전환, 일시정지, 종료 제출, 소셜룸 입장 후 자리비움 복귀, 배경음 재생, 앱 콜드 스타트. 초대코드 자동 열기는 인앱 브라우저가 필요해 vitest로 대신한다                                                                                                                                                             |

## 프로브 실행법

`.superpowers/`는 git이 무시하는 폴더라 스크립트가 저장소에 올라가지 않는다. 새 체크아웃에서는 아래 전문을 `.superpowers/rc-probe.cjs`로 저장하면 같은 결과를 재현할 수 있다. 플러그인의 `logger` 옵션으로 함수별 컴파일 성공·실패 이벤트를 받아 출력한다.

```js
const babel = require(require.resolve("@babel/core", { paths: [process.cwd()] }));
const fs = require("fs");
const files = process.argv.slice(2);
for (const f of files) {
  const events = [];
  const out = babel.transformSync(fs.readFileSync(f, "utf8"), {
    filename: f,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        require.resolve("babel-plugin-react-compiler", { paths: [process.cwd()] }),
        { logger: { logEvent: (file, e) => events.push(e) } },
      ],
    ],
  });
  console.log("==", f);
  for (const e of events) {
    if (e.kind === "CompileSuccess") console.log("  OK  ", e.fnName, "memoSlots=" + e.memoSlots);
    else
      console.log(
        "  " + e.kind,
        e.fnName ?? "",
        (e.detail?.reason ?? e.detail?.options?.reason ?? JSON.stringify(e.detail ?? e.data ?? ""))
          .toString()
          .slice(0, 160),
        e.fnLoc?.start?.line ?? "",
      );
  }
  if (process.env.DUMP && f.includes(process.env.DUMP)) fs.writeFileSync(process.env.OUT, out.code);
}
```

```bash
(cd apps/web && node ../../.superpowers/rc-probe.cjs \
  src/routes/RoomPage.tsx src/features/study-session/useStudyRoomSession.ts \
  src/routes/SocialHomePage.tsx src/features/ambient-sound/useAmbientSound.ts \
  src/features/live-room/useBackgroundGraceWatch.ts src/routes/InviteCodeJoinPage.tsx \
  src/features/live-room/LiveRoomSession.tsx src/features/study-session/useVisionReadyTracking.ts)
(cd apps/mobile && node ../../.superpowers/rc-probe.cjs app/_layout.tsx)
```

`OK <함수> memoSlots=N`이 컴파일된 것이고 `CompileError`가 건너뛴 것이다. 스크립트는 `@babel/core`와 `babel-plugin-react-compiler`를 실행 위치에서 찾는다.

## 바뀌지 않는 것

- 사용자 동작, 계측 이벤트, 제출 페이로드, 오류 보고 경로.
- `LiveRoomSession`·`useTrackedVisionDetector`의 렌더 중 ref 접근. 채널·감지기 API를 바꿔야 해 별도 티켓.
- 컴포넌트·훅이 아닌 모듈(`peerMesh`, `bridge`, `nativeTabBar`, `devMockDetector`, vision 런타임, 모바일 `lib/`)의 `??=`. 컴파일 대상이 아니다.
- 기존 주석. 지우는 것은 `InviteCodeJoinPage`의 틀린 전제 주석과 억제 주석뿐이다.

## 실패 경로

- 프로브에서 범위 안 함수가 여전히 `CompileError`면 그 사유로 다른 형태를 찾는다. 사유를 못 없애면 그 함수는 PR에 남겨 두고 이유를 적는다.
- `.finally()` 전환 뒤 `RoomPage`·세션 테스트가 깨지면 전환이 의미를 바꾼 것이다. 원래 try/catch와 분기를 다시 대조한다.
- 모바일 `_layout`의 TS 좁히기가 안 되면 지역 변수에 받아 쓴다.

## 범위 밖

- 수동 메모이제이션 제거(BY-864).
- BY-861 측정 자체. 이 티켓은 그 전제 조건만 만든다.
