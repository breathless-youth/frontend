import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Toast } from "@/components/ui/toast";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { SessionCaption } from "@/features/study-session/components/SessionCaption";
import { SessionControlBar } from "@/features/study-session/components/SessionControlBar";
import { SessionStatusPill } from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { createDevMockDetector } from "@/features/study-session/devMockDetector";
import { formatElapsed } from "@/features/study-session/formatDuration";
import { CAMERA_TOAST_COPY, captionFor, statusCopyFor } from "@/features/study-session/sessionCopy";
import type { SessionState } from "@/features/study-session/sessionState";
import { sessionGlowStyle, sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useSessionToast } from "@/features/study-session/useSessionToast";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import { parseUserId, useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { cn } from "@/lib/utils";

/** 표시 모드 전환 모션 — Figma Spec 페이지 `14:7` 실측(300ms ease-out). */
const SPACER_TRANSITION =
  "transition-[flex-grow] duration-300 ease-out motion-reduce:transition-none";

/**
 * 세션 레이어의 세로/가로 배치 (S3-1~S3-4 ↔ S3-5·S3-6).
 *
 * **세로는 flex 컬럼, 가로는 3열 그리드**다. 방향은 `@media (orientation: landscape)`만 보고
 * 갈린다 — JS 방향 감지도, 방향 상태도 없다(`useStudyRoomSession`은 방향을 모른다).
 * 회전해도 **DOM 트리가 그대로**여야 포커스와 진행 중인 세션이 살아남기 때문이다
 * (SCR-S3-5·S3-6 Accessibility). 그래서 가로 프레임을 별도 라우트·별도 컴포넌트로 만들지 않고
 * 같은 자식들을 그리드 셀에 재배치하기만 한다.
 *
 * 가로 그리드(`1fr auto 1fr` × `auto 1fr auto auto auto`):
 *
 * ```text
 * row1 |        | 상태 필 | 순공 타이머(프리뷰) |  ← 필은 상단 중앙, 타이머는 우상단
 * row2 |         (심플 타이머 / 여백)          |  ← 1fr — 남는 세로 공간
 * row3 |               캡션                    |
 * row4 |            컨트롤 바                  |
 * row5 |          userId 미지정 안내           |
 * ```
 *
 * 절대 좌표를 쓰지 않는 이유: 가로 타이포(35/13/11px)가 세로보다 작아 폰트 확대 시 상태 필과
 * 우상단 타이머가 겹칠 수 있다. 두 요소를 **다른 열**에 두면 트랙이 늘어나며 서로 밀어낼 뿐
 * 겹치지 않는다(SCR-S3-5·S3-6 Accessibility).
 *
 * 여백은 Figma 실측(가로 pt 18 · pb 14 · px 28) + `env(safe-area-inset-*)`다. 가로에서는 좌우
 * 인셋이 커지므로(노치 쪽) `px-6` 대신 좌우를 따로 계산한다.
 */
const SESSION_LAYER_LAYOUT = [
  "pointer-events-none relative flex h-full w-full flex-col items-center",
  "pt-[calc(env(safe-area-inset-top)+13px)] pb-[calc(env(safe-area-inset-bottom)+17px)]",
  "pl-[calc(env(safe-area-inset-left)+24px)] pr-[calc(env(safe-area-inset-right)+24px)]",
  "landscape:grid landscape:grid-cols-[1fr_auto_1fr] landscape:grid-rows-[auto_1fr_auto_auto_auto] landscape:items-start",
  "landscape:pt-[calc(env(safe-area-inset-top)+18px)] landscape:pb-[calc(env(safe-area-inset-bottom)+14px)]",
  "landscape:pl-[calc(env(safe-area-inset-left)+28px)] landscape:pr-[calc(env(safe-area-inset-right)+28px)]",
].join(" ");

/**
 * 세션 화면 — S3-1(집중)·S3-2(비집중)·S3-3(일시정지)·S3-4(심플 모드)는 **같은 화면**이다.
 * 별도 라우트를 만들지 않고 두 개의 **직교하는 축**으로 프레젠테이션이 갈린다:
 *
 * - **세션 상태**(`sessionState`: FOCUS / DISTRACTION / PAUSE) — "세션이 어떤 상태인가".
 *   상태 필·타이머 색·컨트롤 바 첫 버튼·하단 캡션이 여기 반응한다.
 * - **표시 모드**(`simpleMode`: 프리뷰 / 심플) — "어떻게 보여줄 것인가".
 *   카메라 프리뷰·하단 캡션의 유무와 타이머 발광·세로 배치가 여기 반응한다.
 *
 * 두 축은 서로를 리셋하지 않는다 — 심플 모드에서 일시정지했다가 다시 시작하면 심플 모드로
 * 돌아온다. 그래서 `simpleMode`는 `SessionState`에 넣지 않고 별도 토글로 둔다.
 *
 * **S3-5(가로 프리뷰)·S3-6(가로 심플)은 세 번째 축이 아니다** — 같은 두 축에 걸리는 순수
 * 레이아웃 변형이다. 방향은 상태로 들고 있지 않고 `@media (orientation: landscape)`가 판정한다
 * (`SESSION_LAYER_LAYOUT` 주석 참고). 명시적 회전 트리거 정책은 `ai-wiki` 어디에도 없다는 것이
 * SCR-S3-5·S3-6에서 확인됐고, 디자인에 방향 잠금·수동 전환 컨트롤도 없다.
 *
 * 라우트는 기존 `/room/:id?userId=N`을 유지하되 **방 번호를 표시하지 않는다** —
 * V1.0 싱글룸에는 사용자에게 보여줄 "방" 개념이 없다(`:id` 존치 여부는 리뷰 항목).
 *
 * 세션 계산(2축 타이머·상태 머신·이벤트 누적)은 전부 `useStudyRoomSession`과 그 아래
 * 순수 모듈에 있다 — 이 파일은 표시와 입력 배선만 한다.
 */
export function RoomPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));
  // 개발 빌드에서만 콘솔로 감지 신호를 밀어넣을 수 있게 한다(프로덕션에서는 undefined → 기본 mock).
  const [devDetector] = useState(createDevMockDetector);
  const {
    focusSec,
    studySec,
    sessionState,
    phase,
    isCameraRunning,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { detector: devDetector });
  const { message: toastMessage, showToast } = useSessionToast();
  // 심플 모드(S3-4)는 상태가 아니라 프레젠테이션 토글이다 — SessionState에 넣지 않는다.
  const [simpleMode, setSimpleMode] = useState(false);

  const paused = sessionState.kind === "PAUSE";
  const statusCopy = statusCopyFor(sessionState);
  const pillState = toPillState(sessionState);

  async function handleFlipCamera() {
    const result = await flipCamera();
    if (result.ok) {
      showToast(CAMERA_TOAST_COPY.flipped);
      return;
    }
    showToast(
      result.reason === "camera-off"
        ? CAMERA_TOAST_COPY.cameraOff
        : CAMERA_TOAST_COPY.noAlternative,
    );
  }

  function handleRequestExit() {
    // TODO(WG4): 종료 확인 다이얼로그(S3-7)를 먼저 띄우고, 확인 후에 endAndSubmit을 호출한다.
    // WG1은 콜백 자리만 만든다 — 지금은 기존 제출 경로를 그대로 잇는다.
    //
    // ⚠️ 다이얼로그·자동 종료 안내(S3-8)는 `SESSION_LAYER_LAYOUT` div의 **자식이 아니라 형제**로
    // 넣고 `pointer-events-auto`를 직접 줘야 한다. 자식으로 넣으면 세 가지가 동시에 깨진다
    // (qa-WG3가 프로브를 실제로 삽입해 재현 확인):
    //   (1) 가로에서 그리드 자동 배치로 row1/col1 = 좌상단에 앉는다 — 중앙 모달이 구석에 그려진다
    //   (2) row1 트랙이 커지면서 1fr인 row2가 줄어 심플 타이머(S3-6) 수직 위치가 밀린다
    //   (3) 레이어의 `pointer-events-none`을 상속해 확인·취소 버튼이 클릭을 못 받는다
    // 세로에서도 같은 컨테이너가 flex-col이라 흐름 자식이 되어 컨트롤 바를 밀어낸다 —
    // 가로 전용 문제가 아니다. 전체화면 오버레이는 `main` 바로 아래 `absolute inset-0`이 맞다.
    void endAndSubmit();
  }

  return (
    <main
      style={{ ...sessionSurfaceStyle, ...sessionGlowStyle(sessionState.kind) }}
      data-simple-mode={simpleMode}
      className="relative flex h-svh w-full flex-col items-center overflow-hidden bg-[var(--session-camera-base)] text-white"
    >
      {/* 심플 모드는 프리뷰를 덮는 게 아니라 **걷어낸다** — 둘 중 하나만 렌더한다. */}
      {simpleMode ? <SimpleModeSurface /> : <CameraPreviewSurface isRunning={isCameraRunning} />}

      {phase.name === "studying" ? (
        <>
          {/* 화면 탭(컨트롤 바 제외) → 심플 모드 전환. 컨트롤 바가 pointer-events-auto로 이 레이어를 가린다.
              대칭 복귀: 심플 모드에서 한 번 더 탭하면 프리뷰로 돌아온다(별도 닫기 버튼을 만들지 않는다). */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            onClick={() => setSimpleMode((prev) => !prev)}
            className="absolute inset-0 cursor-default"
          />

          <div className={SESSION_LAYER_LAYOUT}>
            {/* 가로에서도 상단 중앙 — 서브 문구(비집중·일시정지)는 세로와 같이 필 바로 아래에
                붙는다. 가로 비집중·일시정지 프레임은 Figma 미설계라(SCR-S3-5·S3-6 Current
                Limitations 3) 세로와 같은 상대 위치를 유지하는 가장 보수적인 배치를 쓴다. */}
            <SessionStatusPill
              state={pillState}
              label={statusCopy.label}
              subLabel={statusCopy.subLabel}
              className="landscape:col-start-2 landscape:row-start-1 landscape:justify-self-center"
            />

            {/* 표시 모드 전환은 타이머의 **위치·크기 연속성**을 지켜야 한다(Figma Spec `14:7`:
                Smart Animate 300ms ease-out). 그래서 타이머를 언마운트/재마운트하지 않고
                위아래 스페이서의 flex-grow만 바꾼다 — 프리뷰는 컨트롤 바 바로 위(1:0),
                심플 모드는 화면 중앙부(3:5, Figma 실측 여백 207:350 비율).
                가로에서는 그리드 트랙이 같은 일을 하므로 스페이서를 접는다. */}
            <div
              className={cn(
                SPACER_TRANSITION,
                simpleMode ? "grow-[3]" : "grow",
                "landscape:hidden",
              )}
            />

            {/* 가로 배치만 표시 모드에 따라 갈린다 — 프리뷰는 우상단(row1/col3), 심플은 중앙
                (row2 전폭). 세로에서는 두 경우 모두 흐름 그대로다. */}
            <SessionTimer
              focusSec={focusSec}
              studySec={studySec}
              state={pillState}
              glow={simpleMode}
              className={
                simpleMode
                  ? "landscape:col-span-full landscape:row-start-2 landscape:justify-self-center landscape:self-center"
                  : "landscape:col-start-3 landscape:row-start-1 landscape:justify-self-end"
              }
            />

            {/* 캡션은 심플 모드에 존재하지 않는 행이다(S3-4·S3-6 프레임 실측 — 프리뷰와 함께
                사라진다). 프리뷰에서는 일시정지 여부에 따라 프라이버시 캡션 ↔ 일시정지 캡션이
                교체된다. 가로에서는 컨트롤 바 바로 위 자기 행을 갖는다(간격은 바가 준다). */}
            {!simpleMode && (
              <SessionCaption
                text={captionFor(sessionState)}
                className="mt-2 landscape:col-span-full landscape:row-start-3 landscape:mt-0 landscape:justify-self-center"
              />
            )}

            <div
              className={cn(
                SPACER_TRANSITION,
                simpleMode ? "grow-[5]" : "grow-0",
                "landscape:hidden",
              )}
            />

            {/* 토스트는 컨트롤 바 위에 띄운다 — 뜨고 사라질 때 레이아웃이 흔들리지 않도록 absolute. */}
            <div className="relative mt-4 flex flex-col items-center landscape:col-span-full landscape:row-start-4 landscape:mt-2 landscape:justify-self-center">
              {toastMessage !== null && (
                <Toast
                  message={toastMessage}
                  className="absolute bottom-[calc(100%+12px)] whitespace-nowrap"
                />
              )}
              <SessionControlBar
                paused={paused}
                onTogglePause={() => (paused ? resume() : pause())}
                onFlipCamera={() => void handleFlipCamera()}
                onRequestExit={handleRequestExit}
              />
            </div>

            {userId === null && (
              <p className="mt-3 text-center text-[12px] leading-[16px] text-white/55 landscape:col-span-full landscape:row-start-5 landscape:justify-self-center">
                userId가 없어 이 세션은 서버에 저장되지 않습니다 (주소에 ?userId=N 필요)
              </p>
            )}
          </div>
        </>
      ) : (
        <SessionResultFallback phase={phase} onRetry={() => void endAndSubmit()} />
      )}
    </main>
  );
}

function toPillState(state: SessionState): SessionStatusPillState {
  switch (state.kind) {
    case "FOCUS":
      return "focus";
    case "DISTRACTION":
      return "distract";
    case "PAUSE":
      return "paused";
  }
}

/**
 * 종료 이후 상태의 임시 표시.
 * TODO(WG5): `done`은 공부 결과 화면(S4, `ResultPage`)으로 대체된다. WG1은 제출/재시도 경로가
 * 끊기지 않게만 유지한다 — 이 블록의 시각 디자인은 확정 스펙이 아니다.
 */
function SessionResultFallback({
  phase,
  onRetry,
}: {
  phase: Exclude<StudyRoomPhase, { name: "studying" }>;
  onRetry: () => void;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-6">
      {phase.name === "submitting" && <p className="text-sm text-white/80">저장 중...</p>}

      {phase.name === "done" &&
        phase.sessions.map((session) => (
          <div
            key={session.id}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <p className="text-sm text-white/55">귀속 날짜</p>
            <p className="text-xl font-semibold">{session.statDate}</p>
            <p className="mt-2 text-sm text-white/55">총 공부 시간</p>
            <p className="text-xl font-semibold tabular-nums">{formatElapsed(session.studySec)}</p>
            <p className="mt-2 text-sm text-white/55">순공 시간</p>
            <p className="text-xl font-semibold tabular-nums">{formatElapsed(session.focusSec)}</p>
            <p className="mt-2 text-sm text-white/55">집중률</p>
            <p className="text-xl font-semibold">{session.focusRate}%</p>
          </div>
        ))}

      {phase.name === "error" && (
        <>
          <p className="text-center text-sm text-[var(--session-exit-bg)]">{phase.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-white/12 px-6 py-3 text-white"
          >
            다시 제출
          </button>
        </>
      )}

      {phase.name === "unsaved" && (
        <p className="text-center text-sm text-white/80">
          공부 시간 {formatElapsed(phase.studySec)} — userId가 없어 서버에 저장되지 않았습니다.
        </p>
      )}
    </div>
  );
}
