import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { StudySessionResponse } from "@focuson/types";

import { Toast } from "@/components/ui/toast";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { AutoEndNotice } from "@/features/study-session/components/AutoEndNotice";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { SessionCaption } from "@/features/study-session/components/SessionCaption";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { SessionControlBar } from "@/features/study-session/components/SessionControlBar";
import { SessionStatusPill } from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { createDevMockDetector } from "@/features/study-session/devMockDetector";
import { formatElapsed } from "@/features/study-session/formatDuration";
import {
  CAMERA_TOAST_COPY,
  EXIT_CONFIRM_COPY,
  captionFor,
  exitConfirmDescription,
  statusCopyFor,
} from "@/features/study-session/sessionCopy";
import type {
  PauseTrigger,
  SessionEndReason,
  SessionState,
} from "@/features/study-session/sessionState";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
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
  const navigate = useNavigate();
  const userId = parseUserId(searchParams.get("userId"));
  // 개발 빌드에서만 콘솔로 감지 신호를 밀어넣을 수 있게 한다(프로덕션에서는 undefined → 기본 mock).
  const [devDetector] = useState(createDevMockDetector);
  // 카메라는 실제 getUserMedia, 감지는 아직 mock이다 — Vision 파이프라인은 후속 계획에서
  // 같은 `FocusDetector` 인터페이스 뒤에 붙는다(설계 문서 §4).
  const [camera] = useState(createMediaStreamCameraAdapter);
  const {
    focusSec,
    studySec,
    sessionState,
    phase,
    endReason,
    isCameraRunning,
    cameraStream,
    cameraFacing,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { camera, detector: devDetector });
  const { message: toastMessage, showToast } = useSessionToast();
  // 심플 모드(S3-4)는 상태가 아니라 프레젠테이션 토글이다 — SessionState에 넣지 않는다.
  const [simpleMode, setSimpleMode] = useState(false);
  // S3-7 종료 확인 다이얼로그. 열려 있는 동안에도 **세션은 계속 진행된다**(Figma에서 딤 뒤
  // 상태 필이 `집중 측정 중`이고 타이머가 살아 있음을 확인 — ai-wiki 명시 서술은 없는
  // Figma 근거 추론이라 SCR-S3-7·S3-8 Review Checklist에 확인 항목으로 올라가 있다).
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  const paused = sessionState.kind === "PAUSE";
  const statusCopy = statusCopyFor(sessionState);
  const pillState = toPillState(sessionState);

  /**
   * S4(공부 결과)로 이동 — **세션 결과의 유일한 출구**다.
   *
   * 세션 단건 조회 API가 없으므로(`packages/types`에 `GET /api/study-sessions/{id}` 계약 없음)
   * 제출 응답을 **라우터 state로 넘기는 것이 유일한 전달 수단**이다. S4는 이 state가 없으면
   * 데이터를 지어내지 않고 홈으로 되돌린다.
   *
   * 경로를 `/room/${id}/result`로 조립하지 않고 상대 이동(`"result"`)을 쓴다 — 현재 매치된
   * 라우트(`/room/:id`) 기준으로 해석되므로 `:id`를 다시 읽어 문자열을 맞출 필요가 없다.
   *
   * `replace: true`: 세션은 끝났다. 뒤로 가기로 이미 종료된 룸에 되돌아가면 타이머가 0부터
   * 다시 도는 새 세션이 시작돼 사용자에게 거짓이 된다 — 히스토리에서 룸을 치운다.
   */
  const goToResult = useCallback(
    (sessions: StudySessionResponse[]) => {
      // 쿼리(`?userId=N`)를 함께 넘긴다 — S4의 `확인`이 홈으로 되돌릴 때 같은 식별자가 필요하고,
      // 상대 이동은 검색 문자열을 자동으로 물려주지 않는다(BY-327 통합에서 실증).
      navigate(
        { pathname: "result", search: searchParams.toString() },
        { state: { sessions }, replace: true },
      );
    },
    [navigate, searchParams],
  );

  /**
   * S3-7 `공부 종료` 경로 — 제출이 **성공했을 때만**(`phase === "done"`) S4로 넘어간다.
   * `submitting`·`error`·`unsaved`는 S3 쪽 상태라 여기 남는다(WG5와 상호 확인한 계약).
   *
   * 자동 종료(S3-8)는 제외한다 — 그쪽은 안내 화면을 먼저 보여주고 사용자가 `결과 보기`를
   * 눌렀을 때 같은 `goToResult`를 탄다. 즉 두 경로 모두 이 한 함수로 수렴한다.
   */
  useEffect(() => {
    if (phase.name === "done" && endReason?.kind !== "AUTO") {
      goToResult(phase.sessions);
    }
  }, [endReason, goToResult, phase]);

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

  /** 컨트롤 바 종료 버튼 — **세션을 끝내지 않는다.** S3-7 확인 다이얼로그를 먼저 띄운다. */
  function handleRequestExit() {
    setExitDialogOpen(true);
  }

  /** `계속하기` — 직전 세션 상태 그대로 복귀한다(집중/비집중/일시정지 어디서 열었든). */
  function handleCancelExit() {
    setExitDialogOpen(false);
  }

  /** `공부 종료` — 여기서만 실제로 종료된다. */
  function handleConfirmExit() {
    setExitDialogOpen(false);
    void endAndSubmit(MANUAL_END_REASON);
  }

  return (
    <main
      style={{ ...sessionSurfaceStyle, ...sessionGlowStyle(sessionState.kind) }}
      data-simple-mode={simpleMode}
      className="relative flex h-svh w-full flex-col items-center overflow-hidden bg-[var(--session-camera-base)] text-white"
    >
      {/* 심플 모드는 프리뷰를 덮는 게 아니라 **걷어낸다** — 둘 중 하나만 렌더한다. */}
      {simpleMode ? (
        <SimpleModeSurface />
      ) : (
        <CameraPreviewSurface
          isRunning={isCameraRunning}
          stream={cameraStream}
          facing={cameraFacing}
        />
      )}

      {phase.name === "studying" ? (
        <>
          {/* 화면 탭(컨트롤 바 제외) → 심플 모드 전환. 컨트롤 바가 pointer-events-auto로 이 레이어를 가린다.
              대칭 복귀: 심플 모드에서 한 번 더 탭하면 프리뷰로 돌아온다(별도 닫기 버튼을 만들지 않는다).
              다이얼로그가 떠 있는 동안은 inert — 딤 뒤를 탭해도 심플 모드가 토글되지 않는다. */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            onClick={() => setSimpleMode((prev) => !prev)}
            inert={exitDialogOpen}
            className="absolute inset-0 cursor-default"
          />

          {/* 다이얼로그가 열리면 배경 세션 화면 전체를 inert로 만든다 — 포커스가 뒤로 새지 않고
              스크린리더도 다이얼로그만 읽는다(SCR-S3-7·S3-8 Accessibility). */}
          <div className={SESSION_LAYER_LAYOUT} inert={exitDialogOpen}>
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

          {/* ⚠️ **여기가 다이얼로그의 올바른 자리다** — `SESSION_LAYER_LAYOUT` div의 자식이 아니라
              **형제**이고, `main` 바로 아래 `absolute inset-0`이다. 자식으로 넣으면 세 가지가
              동시에 깨진다(qa-WG3가 프로브를 실제로 삽입해 재현 확인):
                (1) 가로에서 그리드 자동 배치로 row1/col1 = 좌상단에 앉는다 — 중앙 모달이 구석에 그려진다
                (2) row1 트랙이 커지면서 1fr인 row2가 줄어 심플 타이머(S3-6) 수직 위치가 밀린다
                (3) 레이어의 `pointer-events-none`을 상속해 확인·취소 버튼이 클릭을 못 받는다
              세로에서도 같은 컨테이너가 flex-col이라 흐름 자식이 되어 컨트롤 바를 밀어낸다 —
              가로 전용 문제가 아니다. `pointer-events-auto`는 컴포넌트가 직접 갖는다.

              가로(S3-5/S3-6)용 종료 확인 프레임은 Figma에 없다 — 세로와 같은 330w 다이얼로그를
              가로 캔버스 중앙에 띄운다(임의로 가로 전용 레이아웃을 새로 디자인하지 않는다). */}
          {exitDialogOpen && (
            <SessionConfirmDialog
              title={EXIT_CONFIRM_COPY.title}
              description={exitConfirmDescription(focusSec)}
              cancelLabel={EXIT_CONFIRM_COPY.cancel}
              confirmLabel={EXIT_CONFIRM_COPY.confirm}
              onCancel={handleCancelExit}
              onConfirm={handleConfirmExit}
            />
          )}
        </>
      ) : /* `phase.name === "done"`을 여기서 한 번 더 좁히는 이유: 타입 가드는 `endReason`만
             좁혀서 아래 `phase.sessions` 접근이 타입상 열리지 않는다. 조건 자체는 가드 안의
             검사와 동일하다. */
      phase.name === "done" && autoEndNoticeVisible(phase, endReason) ? (
        /* S3-8 자동 종료 안내 — 저장이 **끝난 뒤에만** 보여준다(`phase === "done"`).
           타이틀이 `여기까지 기록을 저장했어요`로 단언하므로 제출 중·실패·미저장(userId 없음)
           상태에서 이 화면을 띄우면 사실과 달라진다 — 그 경우는 아래 폴백의 재시도 경로로 간다
           (SCR-S3-7·S3-8 Interaction Contract).

           `결과 보기`는 **이미 저장된 결과를 들고 S4로 이동**한다 — 여기서 다시 제출하지 않는다
           (SCR-S4 진입 경로 표). */
        <AutoEndNotice
          trigger={endReason.trigger}
          focusSec={focusSec}
          studySec={studySec}
          onSeeResult={() => goToResult(phase.sessions)}
        />
      ) : (
        <SessionResultFallback phase={phase} onRetry={() => void endAndSubmit()} />
      )}
    </main>
  );
}

/**
 * S3-8을 띄울 조건. 타입 가드로 두는 이유는 `endReason.trigger` 접근이 좁혀진 타입에서만
 * 안전하기 때문이다.
 *
 * `phase === "done"`을 요구하는 것이 핵심이다 — `submitting`(로딩)·`error`(재시도)·
 * `unsaved`(userId 없음)는 전부 "아직/영영 저장되지 않은" 상태라 S3-8의 타이틀이 거짓이 된다.
 */
function autoEndNoticeVisible(
  phase: StudyRoomPhase,
  endReason: SessionEndReason | null,
): endReason is { kind: "AUTO"; trigger: PauseTrigger } {
  return phase.name === "done" && endReason?.kind === "AUTO";
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
 * 종료 이후 **S4로 가지 못하는** 상태들의 표시 — 제출 중 · 제출 실패(재시도) · 미저장.
 *
 * `done`은 여기 없다. 제출이 성공하면 위 `goToResult`가 S4(`ResultPage`)로 넘기므로 이 컴포넌트가
 * 그릴 결과 화면은 존재하지 않는다(WG5가 라우트를 만들면서 임시 결과 표시를 걷어냈다).
 * 렌더 직후 한 프레임 동안 `done`으로 여기 머물 수 있어 타입에는 남아 있지만 그리는 것은 없다.
 *
 * ⚠️ **아래 재시도 버튼을 없애지 말 것.** S4는 "저장 실패" 배너·재시도 버튼을 만들지 않기로
 * 스펙됐다(SCR-S4 Interaction Contract) — 실패의 사용자 대면 처리는 전적으로 S3의 책임이고,
 * 이 경로가 사라지면 제출 실패가 조용히 삼켜져 사용자에게 아무 안내도 남지 않는다.
 *
 * 이 블록의 시각 디자인은 확정 스펙이 아니다(로딩·에러 상태 디자인이 Figma에 없다).
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
