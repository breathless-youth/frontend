import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Toast } from "@/components/ui/toast";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { SessionControlBar } from "@/features/study-session/components/SessionControlBar";
import { SessionStatusPill } from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { createDevMockDetector } from "@/features/study-session/devMockDetector";
import { formatElapsed } from "@/features/study-session/formatDuration";
import { CAMERA_TOAST_COPY, statusCopyFor } from "@/features/study-session/sessionCopy";
import type { SessionState } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useSessionToast } from "@/features/study-session/useSessionToast";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import { parseUserId, useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";

/**
 * 세션 화면 — S3-1(집중 측정 중) · S3-2(비집중 감지)는 **같은 화면의 두 상태**다.
 * 별도 라우트를 만들지 않고 `sessionState`에 따라 상태 필·타이머 색만 바뀐다.
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
  // TODO(WG2): 토글에 반응하는 심플 프레젠테이션은 WG2 범위. WG1은 탭 영역 경계와 토글 상태까지.
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
    void endAndSubmit();
  }

  return (
    <main
      style={sessionSurfaceStyle}
      data-simple-mode={simpleMode}
      className="relative flex h-svh w-full flex-col items-center overflow-hidden bg-[var(--session-camera-base)] text-white"
    >
      <CameraPreviewSurface isRunning={isCameraRunning} />

      {phase.name === "studying" ? (
        <>
          {/* 화면 탭(컨트롤 바 제외) → 심플 모드 전환. 컨트롤 바가 pointer-events-auto로 이 레이어를 가린다. */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            onClick={() => setSimpleMode((prev) => !prev)}
            className="absolute inset-0 cursor-default"
          />

          <div className="pointer-events-none relative flex h-full w-full flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+13px)] pb-[calc(env(safe-area-inset-bottom)+17px)]">
            <SessionStatusPill
              state={pillState}
              label={statusCopy.label}
              subLabel={statusCopy.subLabel}
            />

            <div className="flex-1" />

            <SessionTimer focusSec={focusSec} studySec={studySec} dimmed={pillState !== "focus"} />

            {/* 토스트는 컨트롤 바 위에 띄운다 — 뜨고 사라질 때 레이아웃이 흔들리지 않도록 absolute. */}
            <div className="relative mt-4 flex flex-col items-center">
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
              <p className="mt-3 text-center text-[12px] leading-[16px] text-white/55">
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
