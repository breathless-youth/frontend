import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { StudySessionResponse } from "@focusmakers/types";

import { CtaToaster } from "@/components/ui/sonner";
import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";
import { AmbientSoundButton } from "@/features/ambient-sound/components/AmbientSoundButton";
import { AmbientSoundSheet } from "@/features/ambient-sound/components/AmbientSoundSheet";
import { useAmbientSound } from "@/features/ambient-sound/useAmbientSound";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import { combineFocusDetectors } from "@/features/study-session/adapters/focusDetector";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { AutoEndNotice } from "@/features/study-session/components/AutoEndNotice";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { DevVisionFailureNotice } from "@/features/study-session/components/DevVisionFailureNotice";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { SessionControlBar } from "@/features/study-session/components/SessionControlBar";
import { SessionSideActions } from "@/features/study-session/components/SessionSideActions";
import { SessionStatusPill } from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { SubMinuteEndNotice } from "@/features/study-session/components/SubMinuteEndNotice";
import { VisionPerfPanel } from "@/features/study-session/components/VisionPerfPanel";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { SUB_MINUTE_SEC, formatElapsed } from "@/features/study-session/formatDuration";
import {
  CAMERA_TOAST_COPY,
  EXIT_CONFIRM_COPY,
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
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { showCtaToast } from "@/lib/toast";
import { useGestureVideoPlaybackKick } from "@/lib/videoPlayback";
import { useIdentityPending, useUserId } from "@/lib/userId";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { useSessionOrientationAnalytics } from "@/features/study-session/useSessionOrientationAnalytics";
import { useTrackedVisionDetector } from "@/features/study-session/useVisionReadyTracking";
import {
  trackSessionNoticeConfirmed,
  trackSessionSimpleModeToggled,
  trackStudySessionExitCancelled,
  trackStudySessionExitRequested,
} from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { cn } from "@/lib/utils";

/**
 * 세션 레이어의 세로/가로 배치
 *
 * 세로는 flex 컬럼, 가로는 3열 그리드다. 방향은 `@media (orientation: landscape)`만 보고
 * 갈린다 — JS 방향 감지도, 방향 상태도 없다(`useStudyRoomSession`은 방향을 모른다).
 * 회전해도 DOM 트리가 그대로여야 포커스와 진행 중인 세션이 살아남기 때문이다.
 * 그래서 가로 프레임을 별도 라우트·별도 컴포넌트로 만들지 않고 같은 자식들을 그리드 셀에 재배치하기만 한다.
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
 * 회전 구간의 수명
 *
 * - `rotating`: 회전이 감지된 순간부터 뷰포트가 확정될 때까지.
 * - `settling`: 확정된 뒤 원래대로 되돌아가는 중. 전환이 끝나면 `idle`이다.
 */
type RotationPhase = "idle" | "rotating" | "settling";

function currentOrientation(): "portrait" | "landscape" {
  return window.innerWidth <= window.innerHeight ? "portrait" : "landscape";
}

/** 회전 애니메이션이 끝나고 뷰포트가 확정되기를 기다리는 시간(네이티브 회전은 약 300ms). */
const ROTATION_SETTLE_MS = 450;
/** 원래 배율로 되돌아가는 시간. 아래 `duration-300`과 같아야 한다 — 어긋나면 툭 끊긴다. */
const ROTATION_REVEAL_MS = 300;

/**
 * 지금이 회전 구간인가
 *
 * — 프리뷰의 빈 공간을 막는 데 쓴다(그 사용처는 `CameraPreviewSurface`).
 *
 * 기기를 돌리면 네이티브 뷰 회전과 WebView 리레이아웃이 한 프레임 어긋나면서, 카메라 서피스가
 * 잠깐 뷰포트보다 작게 잡혀 가장자리에 빈 공간이 생긴다.
 *
 * `resize`만 보면 키보드·주소창 변화에도 반응하므로 방향이 바뀐 경우와 `orientationchange` 이벤트만 통과시킨다.
 */
function useRotationPhase(): RotationPhase {
  const [phase, setPhase] = useState<RotationPhase>("idle");

  useEffect(() => {
    let settled = currentOrientation();
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    function clearTimers() {
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (revealTimer !== null) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
    }

    function handle(fromOrientationEvent: boolean) {
      // 회전 도중의 중간 resize는 아직 이전 방향을 보고할 수 있어 `orientationchange`도 함께 받는다.
      if (!fromOrientationEvent && currentOrientation() === settled) {
        return;
      }
      clearTimers();
      setPhase("rotating");
      settleTimer = setTimeout(() => {
        settleTimer = null;
        settled = currentOrientation();
        setPhase("settling");
        revealTimer = setTimeout(() => {
          revealTimer = null;
          setPhase("idle");
        }, ROTATION_REVEAL_MS);
      }, ROTATION_SETTLE_MS);
    }

    const onResize = () => {
      handle(false);
    };
    const onOrientationChange = () => {
      handle(true);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientationChange);
    return () => {
      clearTimers();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, []);

  return phase;
}

/**
 * 세션 화면
 *
 * - 세션 상태(`sessionState`: FOCUS / DISTRACTION / PAUSE)
 *   상태 필·타이머 색·컨트롤 바 첫 버튼이 여기 반응한다.
 * - 표시 모드(`simpleMode`: 프리뷰 / 심플) — "어떻게 보여줄 것인가".
 *   카메라 프리뷰 유무와 타이머 발광·세로 배치가 여기 반응한다.
 *
 * 두 축은 서로를 리셋하지 않는다 — 심플 모드에서 일시정지했다가 다시 시작하면 심플 모드로
 * 돌아온다. 그래서 `simpleMode`는 `SessionState`에 넣지 않고 별도 토글로 둔다.
 */
function RoomSessionScreen({
  userId,
  restored,
}: {
  userId: number | null;
  restored: RestoredSession | null;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [camera] = useState(createMediaStreamCameraAdapter);
  // 저전력 모드에서 멈춘 카메라 프리뷰를 탭 제스처로 되살린다 — lib/videoPlayback.ts 주석 참고.
  useGestureVideoPlaybackKick();
  // iOS 회전 백지 방어 — 소셜룸 실기기에서 확인된 증상의 예방적 적용(같은 웹뷰 셸,
  // 이 화면도 회전 대상). 사유는 lib/rotationRepaint.ts 주석.
  useRotationRepaintNudge();
  // 가로 거치 모드(S3-5·S3-6) 사용 여부 — 회전은 클릭이 아니라 autocapture가 못 본다.
  useSessionOrientationAnalytics("single");
  /**
   * 프리뷰
   * — 이 화면이 소유하고 두 곳에 나눠준다.
   * 표시는 `CameraPreviewSurface`가, 추론은 `createVisionFocusDetector`가 같은 엘리먼트를 본다.
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * DEV에서 `?detector=mock`이면 콘솔 mock이 이긴다 — 실기기 없이 비집중 시나리오를 재현해야
   * 할 때가 계속 있다. 그 외에는(프로덕션 포함) 아래 Vision 감지기가 쓰인다.
   */
  const [devDetector] = useState(() => resolveDevDetectorOverride(searchParams.get("detector")));
  const { visionDetector, visionReady } = useTrackedVisionDetector(videoRef, "single");
  /**
   * 카메라(`AWAY`·`PHONE`)와 가속도 센서(`DEVICE`).
   * 담당 트리거가 겹치지 않으므로 하나로 묶어 훅에 넘긴다.
   * 센서 정지 시점은 "카메라 추론 정지와 동일한 시점"이다.
   */
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  /**
   * 배경음 재생 누적 시간 그릇 — 두 훅 사이에 순환이 생기지 않게 여기서 만들어 양쪽에
   * 넘긴다. 세션 훅은 종료 시점에 `snapshot`만 읽고, 배경음 훅이 `start`/`stop`을 부른다.
   */
  const [ambientUsage] = useState(() => createAmbientUsage(Date.now));
  const {
    focusSec,
    studySec,
    sessionState,
    phase,
    endReason,
    cameraStream,
    cameraFacing,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, {
    camera,
    detector,
    restored,
    ambientUsage: ambientUsage.snapshot,
  });
  const ambient = useAmbientSound({ sessionState, phase, usage: ambientUsage });
  const [ambientSheetOpen, setAmbientSheetOpen] = useState(false);
  // 배경음 시트의 포털 자리. `--session-*` 변수가 여기 주입돼 있어 body 로 나가면 색이 빠진다.
  const sessionSurfaceRef = useRef<HTMLElement>(null);
  // 시트를 닫은 뒤 포커스를 돌려줄 자리. Radix 는 Trigger 를 쓸 때만 스스로 되돌린다.
  const ambientButtonRef = useRef<HTMLButtonElement>(null);
  // 심플 모드(S3-4)는 상태가 아니라 프레젠테이션 토글이다 — SessionState에 넣지 않는다.
  const [simpleMode, setSimpleMode] = useState(false);
  // S3-7 종료 확인 다이얼로그. 열려 있는 동안에도 **세션은 계속 진행된다**(Figma에서 딤 뒤
  // 상태 필이 `순공시간 측정 중`이고 타이머가 살아 있음을 확인 — ai-wiki 명시 서술은 없는
  // Figma 근거 추론이라 SCR-S3-7·S3-8 Review Checklist에 확인 항목으로 올라가 있다).
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  /**
   * 카메라 전환이 진행 중인가 — **추론 정지 구간을 표시하는 값이지 화면 상태가 아니다.**
   * 전환 중에는 기존 트랙이 멈추고 새 스트림이 `<video>`에 다시 붙는데, 그 사이의 프레임은
   * 판정에 쓸 수 없다(설계 §3 "카메라 전환"). 전환 실패는 기존 `CameraFlipResult` 그대로다.
   */
  const [flippingCamera, setFlippingCamera] = useState(false);
  const rotationPhase = useRotationPhase();

  const paused = sessionState.kind === "PAUSE";
  const statusCopy = statusCopyFor(sessionState);
  const pillState = toPillState(sessionState);
  /**
   * 공부 상태의 식별 키 — 심플 모드 엣지 글로우 **잔향**(SimpleModeSurface)이 상태 전환을
   * 감지하는 값이다. `isSameSessionState`와 같은 기준(kind + trigger)이라 실제 전환에서만
   * 바뀐다(200ms tick 리렌더로는 안 바뀜 — 훅이 같은 상태면 참조를 유지한다). 심플 모드
   * 진입도 잔향을 한 번 틀어야 하므로(design.md "전환 시 1~2초 잔향") `simpleMode`를 키에
   * 포함한다. 프리뷰로 돌아갈 때도 키는 바뀌지만, 서피스가 300ms 페이드아웃 중이라 그대로면
   * 잔향이 부분 가시 상태에서 재점화된다 — 그래서 SimpleModeSurface가 hidden일 때는
   * 잔향을 재생하지 않는다(그쪽 주석 참고).
   */
  const glowKey = `${simpleMode ? "simple" : "preview"}:${sessionState.kind}${
    sessionState.kind === "FOCUS" ? "" : `:${sessionState.trigger}`
  }`;

  /**
   * 추론 수명
   *
   * | 상황             | 카메라 | 추론 |
   * | ---------------- | ------ | ---- |
   * | 일시정지         | 유지   | 정지 |
   * | 카메라 전환 중   | 재연결 | 정지 |
   * | 세션 종료·제출   | 훅이 정리 | 정지 |
   *
   * 일시정지에서 스트림을 끄지 않는 이유는 셋이다 — Figma S3-3이 프리뷰를 그대로 보여주고,
   * 배터리 주 소모원은 카메라 피드가 아니라 추론이며, 스트림을 끄면 재개 시 `getUserMedia`
   * 재호출로 1~2초 공백이 생겨 그 구간이 측정되지 않는다.
   *
   * `start`/`stop`은 멱등이라 훅이 마운트 시 부르는 `detector.start()`와 겹쳐도 안전하다.
   */
  const detectionEnabled = phase.name === "studying" && !paused && !flippingCamera;
  useEffect(() => {
    if (detectionEnabled) {
      detector.start();
    } else {
      detector.stop();
    }
  }, [detectionEnabled, detector]);

  /**
   * 세션 이탈 — 모델과 GPU 컨텍스트를 해제한다.
   * `stop()`은 추론만 멈추고 모델을 들고 있으므로 이게 없으면 wasm 힙과 GPU 컨텍스트가 orphan이 된다
   * (브라우저가 컨텍스트 개수를 제한한다).
   * 로딩 중에 언마운트돼도 뒤늦게 도착한 detector를 닫는다(멱등).
   */
  useEffect(() => {
    return () => {
      visionDetector.close();
    };
  }, [visionDetector]);

  /**
   * 공부 결과로 이동
   *
   * 세션 단건 조회 API를 아직 쓰지 않으므로, 제출 응답을 라우터 state로 넘기는 것이 지금의 전달 수단이다.
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
   * 홈으로 이탈 — 미달 종료(순공 1분 미만)의 출구
   *
   * 네이티브 앱 안에서는 웹 라우터 이동만으로 부족하다. 이 화면이 WebView로 로드된
   * 것이라 `navigate("/home")`는 WebView 안의 웹 홈을 열 뿐, 그 WebView를 담고 있는 네이티브
   * `fullScreenModal`을 닫아 탭 화면으로 돌아가지는 못한다. 그래서 네이티브에
   * `navigate-home`을 먼저 보낸다 — 네이티브가 모달을 닫으면 이 화면 전체가 사라지므로
   * 아래 웹 라우터 이동은 그 사이 잠깐이라도 화면이 있을 브라우저 단독 모드를 위한
   * 폴백이다.
   */
  const goHome = useCallback(() => {
    postToNative({ type: "navigate-home", atMs: Date.now() });
    navigate({ pathname: "/home", search: searchParams.toString() }, { replace: true });
  }, [navigate, searchParams]);

  /**
   * 순공 1분 미만으로 끝났는가
   *
   * 판정에 서버 응답(`phase.sessions`)이 아니라 클라이언트가 잰 `focusSec`을 쓴다.
   * 자정(KST)을 넘는 세션은 서버가 날짜별로 쪼개서 내려주므로, 응답 한 건씩 보면 둘 다 1분 미만인데
   * 세션 전체로는 1분을 넘는 경우가 생긴다.
   * 사용자가 한 번 공부한 것을 두 조각으로 판정하면 안 된다.
   *
   * `endAndSubmit`이 제출 전에 최종 집계를 `setTotals`로 반영하므로 이 값은 이미 확정값이다.
   */
  const endedBelowMinute = focusSec < SUB_MINUTE_SEC;

  /**
   * `공부 종료` 경로
   *
   * - 자동 종료: 안내 화면을 먼저 보여주고 사용자가 `결과 보기`를 눌렀을 때 같은 `goToResult`를 탄다.
   * - 순공 1분 미만: 미달 안내를 보여주고 홈으로 보낸다. 자동 종료와 수동 종료 양쪽 모두에 걸린다.
   * 30초 공부하고 20분 방치해 자동 종료된 세션도 기록에 남지 않으므로 `여기까지 기록을 저장했어요`가 거짓이 된다.
   */
  useEffect(() => {
    if (phase.name === "done" && !endedBelowMinute && endReason?.kind !== "AUTO") {
      goToResult(phase.sessions);
    }
  }, [endReason, endedBelowMinute, goToResult, phase]);

  /**
   * 전환 중에는 추론을 멈춘다(위 `detectionEnabled`). 전환이 끝나면 — 성공이든 실패든 —
   * 다시 켠다. 실패했을 때 꺼 두면 "전환할 카메라가 없어요" 토스트 한 번에 세션이 통째로
   * 측정 불가가 되는데, 어댑터는 실패 시 이전 카메라를 복원하므로 추론은 계속 가능하다.
   * 복원까지 실패한 경우에만 카메라가 꺼지고, 그때는 훅이 실행 상태를 내려 화면이 따라간다.
   *
   * 새 스트림이 `<video>`에 붙어 첫 프레임을 그리기까지는 시간이 걸리지만, 그 구간은
   * 감지기가 `readyState`를 보고 스스로 건너뛴다 — 여기서 기다릴 필요가 없다.
   */
  async function handleFlipCamera() {
    setFlippingCamera(true);
    try {
      const result = await flipCamera();
      if (result.ok) {
        showCtaToast(CAMERA_TOAST_COPY.flipped);
        return;
      }
      showCtaToast(
        result.reason === "camera-off"
          ? CAMERA_TOAST_COPY.cameraOff
          : CAMERA_TOAST_COPY.noAlternative,
      );
    } finally {
      setFlippingCamera(false);
    }
  }

  /** 컨트롤 바 종료 버튼 */
  function handleRequestExit() {
    trackStudySessionExitRequested("single");
    setExitDialogOpen(true);
  }

  /** `계속하기` */
  function handleCancelExit() {
    trackStudySessionExitCancelled("single");
    setExitDialogOpen(false);
  }

  /** `공부 종료` 확정 */
  function handleConfirmExit() {
    setExitDialogOpen(false);
    void endAndSubmit(MANUAL_END_REASON);
  }

  return (
    <main
      ref={sessionSurfaceRef}
      style={{ ...sessionSurfaceStyle, ...sessionGlowStyle(sessionState.kind) }}
      data-simple-mode={simpleMode}
      // 컨트롤 바 아이콘과 타이머 텍스트가 마우스/터치 드래그로 끌리는 것을
      // 막는다 — `session-no-drag`(index.css)가 CSS를, onDragStart가 브라우저 네이티브
      // 드래그 이벤트 자체를 막는다(카메라 프리뷰가 있는 화면이라 드래그 고스트가 특히 튄다).
      onDragStart={(event) => event.preventDefault()}
      className="session-no-drag relative flex h-svh w-full flex-col items-center overflow-hidden bg-[var(--session-camera-base)] text-white"
    >
      {/* 심플 모드는 보이는 프리뷰만 걷어낸다 — `<video>`는 계속 마운트된 채 숨어 있다.

          그냥 언마운트하면 `videoRef.current`가 `null`이 되어 추론이 프레임을 못 받고,
          신호가 직전 값에 굳은 채 심플 모드 내내 유지된다(계약 2: `detect()`가 `null`이면
          "판정 없음"이지 "사람 없음"이 아니다). 즉 심플 모드로 들어간 순간의 상태가 세션 끝까지 기록된다.

          SimpleModeSurface도 카메라 서피스와 같은 hidden 패턴으로 상시 마운트한다 
          — 조건부 마운트면 전환 순간 배경이 0ms에 스왑되어, 300ms를 끄는 타이머 이동과 시차가 벌어진다. 
          두 서피스가 각자 300ms 페이드로 교차하면 배경도 같은 박자를 탄다. */}
      <SimpleModeSurface hidden={!simpleMode} glowKey={glowKey} />
      {/* 회전 오버스캔은 프리뷰에만 건다 — 심플 모드는 카메라를 걷어낸 화면이라 회전해도
          메울 빈 자리가 없고, 단색 배경을 확대해 봐야 보이는 변화가 없다. */}
      <CameraPreviewSurface
        stream={cameraStream}
        facing={cameraFacing}
        videoRef={videoRef}
        hidden={simpleMode}
        rotating={!simpleMode && rotationPhase === "rotating"}
      />

      {phase.name === "studying" ? (
        <>
          {/* 화면 탭(컨트롤 바 제외) → 심플 모드 전환. 컨트롤 바가 pointer-events-auto로 이 레이어를 가린다.
              대칭 복귀: 심플 모드에서 한 번 더 탭하면 프리뷰로 돌아온다(별도 닫기 버튼을 만들지 않는다).
              다이얼로그가 떠 있는 동안 딤 뒤 탭은 Radix 가 바깥 포인터를 막아 토글되지 않는다. */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            onClick={() => {
              trackSessionSimpleModeToggled(!simpleMode);
              setSimpleMode((prev) => !prev);
            }}
            className="absolute inset-0 cursor-default"
          />

          <div className={SESSION_LAYER_LAYOUT}>
            <SessionStatusPill
              state={pillState}
              label={statusCopy.label}
              className="landscape:col-start-2 landscape:row-start-1 landscape:justify-self-center"
            />

            {/* 위를 기준으로 붙여야 심플 모드에서 카메라 전환이 빠져도 배경음이 움직이지 않는다.
                세로는 상태 필, 가로는 오른쪽 위 타이머 아랫선 아래에 놓는다. */}
            <SessionSideActions
              // 심플 모드는 프리뷰가 없어 전환 결과를 볼 수 없는데 추론만 잠깐 끊긴다.
              showFlip={!simpleMode}
              onFlipCamera={() => void handleFlipCamera()}
              ambient={
                /* 배경음 버튼 */
                <AmbientSoundButton
                  ref={ambientButtonRef}
                  on={ambient.isOn}
                  expanded={ambientSheetOpen}
                  onClick={() => setAmbientSheetOpen(true)}
                />
              }
              className="absolute right-[calc(env(safe-area-inset-right)+16px)] top-[calc(env(safe-area-inset-top)+64px)] landscape:top-[calc(env(safe-area-inset-top)+96px)]"
            />

            {/* 타이머 세로 위치는 이 스페이서 두 개의 flex-grow 비가 정한다 — 프리뷰는 위만
                늘려(1:0) 컨트롤 바 바로 위에, 심플 모드는 균등(1:1)하게 나눠 상태 필과 컨트롤 바
                사이 여백의 중앙에 놓는다. Figma S3-4 실측은 207:350(≈3:5)으로 중앙보다 위지만
                실기기에서 너무 높다는 확인(BY-336)으로 균등 배분으로 낮췄다.

                전환 애니메이션을 다시 넣지 말 것.
                
                예전에는 `transition-[flex-grow]`로 300ms ease-out(Figma Spec `14:7`) 슬라이드를 줬는데, 
                타이머가 미끄러지는 것 자체가 거슬린다는 판단으로 걷어냈다. 지금은 위치만
                즉시 바뀌고 배경·발광은 그대로 300ms로 페이드한다 — 움직이는 것은 타이머가
                아니라 화면이라는 인상이 된다. 타이머는 여전히 언마운트/재마운트하지 않으므로
                숫자가 끊기거나 리셋되지는 않는다. 가로에서는 그리드 트랙이 같은 일을 하므로 스페이서를 접는다. */}
            <div className="grow landscape:hidden" />

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
                  : "landscape:col-start-3 landscape:row-start-1 landscape:-mr-5 landscape:justify-self-end"
              }
            />

            <div className={cn(simpleMode ? "grow" : "grow-0", "landscape:hidden")} />

            <div className="relative mt-[44px] flex flex-col items-center landscape:col-span-full landscape:row-start-4 landscape:mt-2 landscape:justify-self-center">
              <CtaToaster />
              <SessionControlBar
                paused={paused}
                onTogglePause={() => (paused ? resume() : pause())}
                onRequestExit={handleRequestExit}
              />
            </div>

            {userId === null && (
              <p className="mt-3 text-center text-[12px] leading-[16px] text-white/55 landscape:col-span-full landscape:row-start-5 landscape:justify-self-center">
                이 기기가 아직 등록되지 않아 기록이 저장되지 않습니다
              </p>
            )}
          </div>

          {/* 배경음 시트는 Radix 포털을 타므로 여기 위치가 화면 배치를 정하지는 않는다.
              포털 자리를 `main` 으로 잡아야 `--session-*` 변수가 풀린다. */}
          <AmbientSoundSheet
            open={ambientSheetOpen}
            container={sessionSurfaceRef.current}
            triggerRef={ambientButtonRef}
            catalog={ambient.catalog}
            mix={ambient.mix}
            duckEnabled={ambient.duckEnabled}
            blocked={ambient.blocked}
            canRestore={ambient.canRestore}
            onToggleSound={ambient.toggleSound}
            onChangeLevel={ambient.changeLevel}
            onSetDuckEnabled={ambient.setDuckEnabled}
            onToggleAll={ambient.toggleAll}
            onOpenChange={setAmbientSheetOpen}
          />
        </>
      ) : /* 미달 종료 안내 — 순공 1분 미만이면 자동 종료로 끝났든
             수동으로 끝냈든 기록에 남지 않으므로, `여기까지 기록을 저장했어요`도 결과 표시도 모두 사실이 아니다.

             `phase === "done"`을 요구하는 이유 — 제출 중·실패·미저장 상태에서는
             아래 폴백의 재시도 경로로 가야 한다. 저장 자체는 1분 미만이어도 정상적으로 하고,
             걸러내는 것은 표시·합산 단계다. */
      phase.name === "done" && endedBelowMinute ? (
        <SubMinuteEndNotice
          onGoHome={() => {
            trackSessionNoticeConfirmed({ notice: "sub_minute", roomType: "single" });
            goHome();
          }}
        />
      ) : /* `phase.name === "done"`을 여기서 한 번 더 좁히는 이유: 타입 가드는 `endReason`만
             좁혀서 아래 `phase.sessions` 접근이 타입상 열리지 않는다. 조건 자체는 가드 안의
             검사와 동일하다. */
      phase.name === "done" && autoEndNoticeVisible(phase, endReason) ? (
        /* S3-8 자동 종료 안내 — 저장이 **끝난 뒤에만** 보여준다(`phase === "done"`).
           타이틀이 `여기까지 기록을 저장했어요`로 단언하므로 제출 중·실패·미저장(userId 없음)
           상태에서 이 화면을 띄우면 사실과 달라진다 — 그 경우는 아래 폴백의 재시도 경로로 간다.

           `결과 보기`는 **이미 저장된 결과를 들고 S4로 이동**한다 — 여기서 다시 제출하지 않는다
           (SCR-S4 진입 경로 표). */
        <AutoEndNotice
          trigger={endReason.trigger}
          focusSec={focusSec}
          studySec={studySec}
          onSeeResult={() => {
            trackSessionNoticeConfirmed({ notice: "auto_end", roomType: "single" });
            goToResult(phase.sessions);
          }}
        />
      ) : (
        <SessionResultFallback phase={phase} onRetry={() => void endAndSubmit()} />
      )}

      {/* 개발 빌드 전용 — 걷어낼 때 지울 두 지점 중 하나가 이 줄이다(나머지 하나는
          `components/DevVisionFailureNotice.tsx` 파일 자체). 모델 로딩이 최종 실패했을 때
          프로덕션은 에러 화면 없이 감지만 없는 채로 세션을 계속 진행하고,
          개발 빌드만 그 사실을 화면에 띄운다 — 조용히 mock처럼 도는 상태를 개발 중에 못 알아채는
          쪽이 더 위험하기 때문이다. Vite가 프로덕션에서 `import.meta.env.DEV`를 `false`로
          치환하므로 이 블록과 컴포넌트 모듈이 통째로 번들에서 빠진다. */}
      {import.meta.env.DEV && <DevVisionFailureNotice detector={visionDetector} />}

      {/* 측정 빌드(VITE_PERF_PANEL=1) 전용. 운영 빌드에서는 조건이 false로 접혀 패널 모듈이 번들에서 빠진다. */}
      {import.meta.env.VITE_PERF_PANEL === "1" && <VisionPerfPanel measurement={visionReady} />}

      {/* 종료 확인 다이얼로그는 `phase` 삼항 밖에 둔다. `공부 종료`를 누르면 같은 렌더에서
          `exitDialogOpen`이 false 가 되면서 `phase`도 `submitting`으로 바뀌는데, 삼항 안에
          두면 그 프래그먼트가 통째로 언마운트돼 닫힘 모션이 한 프레임도 안 보인다. 밖에 두면
          다이얼로그가 남아 Radix 가 퇴장 모션을 끝까지 재생한다. Radix 포털을 타므로 위치가
          화면 배치를 정하지 않고, 포털 자리를 `main`으로 잡아야 `--session-dialog-*`가 풀린다. */}
      <SessionConfirmDialog
        // 삼항 밖이라 마운트는 유지되므로, 여는 조건에 phase 를 직접 건다. 자동 종료로
        // phase 가 studying 을 벗어나면 열려 있던 다이얼로그도 open=false 가 되어 닫힘 모션을
        // 재생하고 걷힌다. 수동 확정·취소는 exitDialogOpen 이 false로 가며 같은 경로를 탄다.
        open={exitDialogOpen && phase.name === "studying"}
        container={sessionSurfaceRef.current}
        title={EXIT_CONFIRM_COPY.title}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={EXIT_CONFIRM_COPY.cancel}
        confirmLabel={EXIT_CONFIRM_COPY.confirm}
        onCancel={handleCancelExit}
        onConfirm={handleConfirmExit}
      />
    </main>
  );
}

/**
 * 타입 가드로 두는 이유는 `endReason.trigger` 접근이 좁혀진 타입에서만 안전하기 때문이다.
 *
 * `phase === "done"`을 요구하는 것이 핵심이다 — `submitting`(로딩)·`error`(재시도)·
 * `unsaved`(userId 없음)는 전부 "아직/영영 저장되지 않은" 상태이다.
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
 * 종료 이후 결과로 가지 못하는 상태들의 표시 — 제출 중 · 제출 실패(재시도) · 미저장.
 *
 * 아래 재시도 버튼을 없애지 말 것.
 * 결과화면에 "저장 실패" 배너·재시도 버튼을 만들지 않기로 했다
 * — 실패의 사용자 대면 처리는 S3의 책임이고, 이 경로가 사라지면 제출 실패에 대해 아무 안내도 남지 않는다.
 *
 * TODO: 이 블록의 시각 디자인은 확정 스펙이 아니다(로딩·에러 상태 디자인이 Figma에 없다).
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
          공부 시간 {formatElapsed(phase.studySec)} — 기기 등록 전이라 저장되지 않았습니다.
        </p>
      )}
    </div>
  );
}

/**
 * 세션 화면 진입 게이트
 *
 * 서버에 진행중 세션이 있는지 먼저 확인하고 결과가 나온 뒤에 세션을 시작한다. 먼저 시작하면
 * 사용자가 0분에서 복원값으로 튀는 것을 보고, 그 사이 스냅샷 보고가 낡은 시작 시각으로 나간다.
 * 정상 경로는 수백 ms 수준이라 스피너 없이 다크 배경만 유지한다.
 */
export function RoomPage() {
  // 신원이 오기 전에 세션을 띄우면 아래 `key`가 null에서 실제 id로 바뀌며 통째로 다시 마운트된다.
  // 마운트 1회 계측(`study_session_started`)이 두 번 나가고 세션 타이머도 처음부터 다시 선다.
  // 브라우저 단독 모드에는 기다릴 출처가 없어 언제나 false, 네이티브는 3초 한도가 있어 갇히지 않는다.
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const { settled, restored } = useActiveSessionRestore(userId);

  if (identityPending || !settled) {
    return (
      <main
        data-testid="room-restore-gate"
        className="relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      />
    );
  }
  // 사용자가 바뀌면 통째로 새로 만든다. 복원값은 마운트 시점에 한 번만 읽히므로, 같은
  // 인스턴스를 유지하면 새 사용자가 앞 사용자의 세션을 그대로 이어받는다.
  return <RoomSessionScreen key={userId} userId={userId} restored={restored} />;
}
