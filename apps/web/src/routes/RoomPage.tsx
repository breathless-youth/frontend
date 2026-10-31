import { BookOpen } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { StudySessionResponse, SubjectResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { CtaToaster } from "@/components/ui/sonner";
import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";
import { AmbientSoundButton } from "@/features/ambient-sound/components/AmbientSoundButton";
import { AmbientSoundSheet } from "@/features/ambient-sound/components/AmbientSoundSheet";
import { useAmbientSound } from "@/features/ambient-sound/useAmbientSound";
import { ModeEntryButton } from "@/features/multi-timer/components/ModeEntryButton";
import { MultiTimerScreen } from "@/features/multi-timer/components/MultiTimerScreen";
import { PomodoroPanel } from "@/features/multi-timer/components/PomodoroPanel";
import { TimerPanel } from "@/features/multi-timer/components/TimerPanel";
import {
  useModeHistoryHold,
  useModeScreenLocks,
  useSessionRotationRestore,
} from "@/features/multi-timer/modeScreenLocks";
import type { ModeKind } from "@/features/multi-timer/multiTimerMachine";
import { createMultiTimerUsage, useMultiTimer } from "@/features/multi-timer/useMultiTimer";
import type { MultiTimerControls } from "@/features/multi-timer/useMultiTimer";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import { combineFocusDetectors } from "@/features/study-session/adapters/focusDetector";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { AutoEndNotice } from "@/features/study-session/components/AutoEndNotice";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { DevVisionFailureNotice } from "@/features/study-session/components/DevVisionFailureNotice";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import {
  SessionExitButton,
  SessionPauseButton,
} from "@/features/study-session/components/SessionControlButtons";
import { SessionHelpScreen } from "@/features/study-session/components/SessionHelpScreen";
import {
  SessionMoreMenu,
  SOLO_MORE_POSITION,
} from "@/features/study-session/components/SessionMoreMenu";
import { SessionPage } from "@/features/study-session/components/SessionPage";
import {
  SESSION_SIDE_POSITION,
  SessionSideActions,
} from "@/features/study-session/components/SessionSideActions";
import {
  SESSION_PILL_SIZE,
  SessionStatusPill,
} from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionPageTimer, SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { SubMinuteEndNotice } from "@/features/study-session/components/SubMinuteEndNotice";
import { SubjectPanel } from "@/features/study-session/components/SubjectPanel";
import { SubjectLabel } from "@/features/study-session/components/SubjectLabel";
import { VisionPerfPanel } from "@/features/study-session/components/VisionPerfPanel";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { SUB_MINUTE_SEC, formatElapsed } from "@/features/study-session/formatDuration";
import {
  CAMERA_TOAST_COPY,
  EXIT_CONFIRM_COPY,
  INVITE_CONFIRM_COPY,
  SUBJECT_SHEET_COPY,
  exitConfirmDescription,
  statusCopyFor,
} from "@/features/study-session/sessionCopy";
import type {
  PauseTrigger,
  SessionEndReason,
  SessionState,
} from "@/features/study-session/sessionState";
import {
  markSessionGuideSeen,
  sessionGuideState,
  shouldShowSessionGuide,
} from "@/features/study-session/sessionGuide";
import { SESSION_LAYER_INSET } from "@/features/study-session/sessionLayout";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
import {
  clearSessionInvite,
  leaveSessionForInvite,
  useSessionInvite,
} from "@/features/study-session/sessionInvite";
import { sessionGlowStyle, sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { showCtaToast } from "@/lib/toast";
import { useGestureVideoPlaybackKick } from "@/lib/videoPlayback";
import { useNativeControl } from "@/lib/nativeControls";
import { useModalOverlayOpen } from "@/lib/nativeModalOverlay";
import { useIdentityPending, useUserId } from "@/lib/userId";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import type { SubjectSelection } from "@/features/study-session/subjectSegments";
import { deriveSubjectTotals, liveSubjectTime } from "@/features/study-session/subjectSegments";
import { completedTaskIdsSince } from "@/features/study-session/completedTasks";
import { loadSessionSubjects } from "@/features/study-session/loadSessionSubjects";
import { useLandscapeLayout } from "@/features/study-session/useLandscapeLayout";
import { useSubjects } from "@/features/study-session/useSubjects";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { useSessionOrientationAnalytics } from "@/features/study-session/useSessionOrientationAnalytics";
import { useTrackedVisionDetector } from "@/features/study-session/useVisionReadyTracking";
import { createTimelapseRecorder } from "@/features/timelapse/timelapseRecorder";
import type { SessionHelpTrigger } from "@/lib/amplitude";
import {
  trackSessionNoticeConfirmed,
  trackSessionSimpleModeToggled,
  trackStudySessionExitCancelled,
  trackStudySessionExitRequested,
  trackStudySessionHelpCompleted,
  trackStudySessionHelpDismissed,
  trackStudySessionHelpShown,
  trackStudySessionHelpStepViewed,
  trackSubjectItemSelected,
  trackSubjectSheetClosed,
  trackSubjectSheetOpened,
} from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { prefetchResultPage } from "@/routes/lazyRoutes";

/**
 * 세션 레이어의 세로/가로 배치
 *
 * 세로는 flex 컬럼, 가로는 3열 그리드다. 방향은 `landscape-compact`(가로이면서 높이 30rem 미만)만 보고
 * 갈린다 — JS 방향 감지도, 방향 상태도 없다(`useStudyRoomSession`은 방향을 모른다).
 * 회전해도 DOM 트리가 그대로여야 포커스와 진행 중인 세션이 살아남기 때문이다.
 * 그래서 가로 프레임을 별도 라우트·별도 컴포넌트로 만들지 않고 같은 자식들을 그리드 셀에 재배치하기만 한다.
 * 태블릿 가로는 세로 배치를 받는다.
 */
const SESSION_LAYER_LAYOUT = [
  "pointer-events-none relative flex h-full w-full flex-col items-center",
  "landscape-compact:grid landscape-compact:grid-cols-[1fr_auto_1fr] landscape-compact:grid-rows-[auto_1fr_auto_auto] landscape-compact:items-start",
  SESSION_LAYER_INSET,
].join(" ");

/**
 * 심플 모드에서 숨기는 버튼의 전환
 *
 * 심플 모드는 상태 필, 일시정지 버튼, 측정 중인 과목 시간만 남기고 숫자에 집중하게 하는 화면이다.
 * 사라지는 동안에도 눌리지 않게 호출부가 `inert`를 함께 단다.
 */
const SIMPLE_MODE_FADE =
  "transition-[opacity,visibility] duration-200 motion-reduce:transition-none";

/**
 * 열린 페이지를 표시하는 history 항목의 키
 *
 * 페이지를 열 때 URL은 바꾸지 않고 항목을 하나 쌓아서, iOS 가장자리 스와이프와 브라우저 뒤로 가기가 세션이 아니라 페이지만 닫게 한다.
 * 라우터 상태(`idx`·`key`)를 함께 복사해 두어 그 항목에서 뒤로 가도 라우터는 같은 화면으로 본다.
 */
const PAGE_HISTORY_KEY = "sessionPage";

/** 지금 history 항목이 이 화면이 쌓은 페이지 항목인가. */
function pageEntryOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && PAGE_HISTORY_KEY in state;
}

type PageCloseReason = "back" | "play";

/**
 * 닫기 요청 없이 사라지는 페이지의 표시 항목 걷어 내기
 *
 * 세션이 끝나거나 화면이 통째로 사라질 때 부른다.
 * 남겨 두면 결과 화면으로 바꿔 끼울 때 그 아래에 세션 항목이 남아, 뒤로 가기로 새 세션이 열린다.
 * 이미 되돌리는 중이면 한 번 더 되돌리지 않는다. 두 번 되돌리면 세션 화면 밖으로 나간다.
 */
function dropPageEntry(closing: RefObject<PageCloseReason | null>) {
  if (closing.current === null && pageEntryOnTop()) {
    closing.current = "back";
    window.history.back();
  }
}

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
 *   상태 필·타이머 색·하단 일시정지 버튼이 여기 반응한다.
 * - 표시 모드(`simpleMode`: 프리뷰 / 심플) — "어떻게 보여줄 것인가".
 *   카메라 프리뷰 유무, 일시정지 말고 나머지 버튼의 숨김, 타이머 발광·세로 배치가 여기 반응한다.
 *
 * 두 축은 서로를 리셋하지 않는다 — 심플 모드에서 일시정지했다가 다시 시작하면 심플 모드로
 * 돌아온다. 그래서 `simpleMode`는 `SessionState`에 넣지 않고 별도 토글로 둔다.
 */
function RoomSessionScreen({
  userId,
  restored,
  invite,
}: {
  userId: number | null;
  restored: RestoredSession | null;
  invite: string | null;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [camera] = useState(createMediaStreamCameraAdapter);
  // 저전력 모드에서 멈춘 카메라 프리뷰를 탭 제스처로 되살린다 — lib/videoPlayback.ts 주석 참고.
  useGestureVideoPlaybackKick();
  // iOS 회전 백지 방어 — 소셜룸 실기기에서 확인된 증상의 예방적 적용(같은 웹뷰 셸,
  // 이 화면도 회전 대상). 사유는 lib/rotationRepaint.ts 주석.
  useRotationRepaintNudge();
  // 가로 거치 모드 사용 여부 — 회전은 클릭이 아니라 autocapture가 못 본다.
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
  /**
   * 타임랩스 촬영
   *
   * 소셜룸은 이 화면을 쓰지 않으므로 찍지 않는다.
   */
  const [timelapse] = useState(() => createTimelapseRecorder());
  const { visionDetector, visionReady } = useTrackedVisionDetector(
    videoRef,
    "single",
    timelapse.photoTap,
  );
  /**
   * 카메라(`AWAY`·`PHONE`)와 가속도 센서(`DEVICE`).
   * 담당 트리거가 겹치지 않으므로 하나로 묶어 훅에 넘긴다.
   * 센서 정지 시점은 "카메라 추론 정지와 동일한 시점"이다.
   */
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  // 제출 시점에 읽을 과목 목록 — 커밋마다 최신 값으로 덮는다(아래 useSubjects 뒤).
  const subjectsListRef = useRef<SubjectResponse[]>([]);
  /**
   * 배경음 재생 누적 시간 그릇 — 두 훅 사이에 순환이 생기지 않게 여기서 만들어 양쪽에
   * 넘긴다. 세션 훅은 종료 시점에 `snapshot`만 읽고, 배경음 훅이 `start`/`stop`을 부른다.
   */
  const [ambientUsage] = useState(() => createAmbientUsage(Date.now));
  // 배경음 그릇과 같은 까닭으로 여기서 만들어 세션 훅과 타이머 훅에 함께 넘긴다.
  const [multiTimerUsage] = useState(createMultiTimerUsage);
  const {
    startedAtMs,
    focusSec,
    studySec,
    sessionState,
    phase,
    endReason,
    cameraStream,
    cameraFacing,
    subjectSelection,
    subjectSegments,
    sessionEvents,
    selectSubject,
    pause,
    resume,
    startBreak,
    endBreak,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, {
    camera,
    detector,
    restored,
    // 과목 목록은 아래 useSubjects가 들고 있어 훅 뒤에 온다 — 제출 시점에 ref로 읽는다(옵션 주석 참고).
    getCompletedTaskIds: (startedAtMs) =>
      completedTaskIdsSince(subjectsListRef.current, startedAtMs),
    ambientUsage: ambientUsage.snapshot,
    multiTimerUsage: multiTimerUsage.snapshot,
    onEnded: timelapse.finish,
    onCameraLost: () => showCtaToast(CAMERA_TOAST_COPY.cameraOff),
  });
  // 이어받은 세션은 같은 시작 시각이라 같은 타임랩스에 이어 찍는다.
  useEffect(() => {
    timelapse.begin(startedAtMs);
  }, [startedAtMs, timelapse]);
  const ambient = useAmbientSound({
    sessionState,
    phase,
    usage: ambientUsage,
    roomType: "single",
  });
  /** 세션 위에 열린 전체 페이지. 둘은 동시에 열리지 않는다. */
  const [page, setPage] = useState<"subject" | "ambient" | null>(null);
  const studying = phase.name === "studying";
  // 세션이 끝나면 페이지는 공부 화면과 함께 사라진다. 사용자가 닫은 것이 아니라 닫힘 계측은 남기지 않는다.
  if (!studying && page !== null) {
    setPage(null);
  }
  const pageLandscape = useLandscapeLayout(page !== null);
  const multiTimer = useMultiTimer({
    sessionState,
    studying,
    onStartBreak: startBreak,
    onEndBreak: endBreak,
    onResumeSession: resume,
    usage: multiTimerUsage,
  });
  const modeOpen = multiTimer.mode !== null;
  /**
   * 모드를 끈 순간의 모습
   *
   * 꺼진 모드는 남은 시간과 버튼 이름이 처음 값으로 돌아가서, 밀려 나가는 동안에는 끄기 직전 모습을 그린다.
   * 세션이 끝나 꺼질 때는 모드 화면이 공부 화면과 함께 사라져 남길 모습이 없다.
   */
  const [closingMode, setClosingMode] = useState<MultiTimerControls | null>(null);
  const modeView = modeOpen ? multiTimer : closingMode;
  const modeKind: ModeKind = modeView?.mode?.kind ?? "timer";
  useModeScreenLocks(modeOpen);
  useModeHistoryHold(modeOpen);
  useSessionRotationRestore();
  // 배경음·과목 페이지의 포털 자리. `--session-*` 변수가 여기 주입돼 있어 body 로 나가면 색이 빠진다.
  const [sessionSurface, setSessionSurface] = useState<HTMLElement | null>(null);
  // 페이지를 닫은 뒤 포커스를 돌려줄 자리. Radix 는 Trigger 를 쓸 때만 스스로 되돌린다.
  const ambientButtonRef = useRef<HTMLButtonElement>(null);
  const subjectButtonRef = useRef<HTMLButtonElement>(null);
  const timerButtonRef = useRef<HTMLButtonElement>(null);
  // 과목 페이지를 연 요소와 연 시각. 닫을 때 포커스를 돌려주고 열려 있던 시간을 계측한다.
  const subjectOpenerRef = useRef<HTMLElement | null>(null);
  const subjectOpenedAtRef = useRef(0);
  /**
   * 닫기를 요청한 까닭
   *
   * 닫기는 history를 한 칸 되돌린 뒤 popstate에서 마무리한다.
   * 그사이 다시 온 요청은 무시한다. 두 번 되돌리면 세션 화면 밖으로 나간다.
   */
  const closingRef = useRef<PageCloseReason | null>(null);
  // 목록은 세션에 들어올 때 미리 받는다 — 페이지를 처음 열 때 받으면 응답이 올 때까지 빈 골격만 보인다.
  // 복원 세션이 죽기 전에 완료한 할 일을 제출에 싣는 데도 이 목록이 필요하다. 기기 미등록이면 저장할 곳이
  // 없어 받지 않는다. 과목 페이지가 닫혀 있을 때의 실패는 알리지 않는다 — 사용자가 과목을 건드린 적이 없다.
  // 과목 시간은 플래너 하루 기준 오늘 값으로 바꿔 받는다(`loadSessionSubjects`).
  const subjects = useSubjects(
    userId !== null,
    (message) => {
      if (page === "subject") {
        showCtaToast(message);
      }
    },
    "single",
    () => loadSessionSubjects(userId ?? 0),
  );
  useLayoutEffect(() => {
    subjectsListRef.current = subjects.subjects;
  });
  // 심플 모드는 상태가 아니라 프레젠테이션 토글이다 — SessionState에 넣지 않는다.
  const [simpleMode, setSimpleMode] = useState(false);
  // 더보기 메뉴는 열려도 앱 버튼을 숨기지 않아서 열린 동안 앱 버튼은 disabled로 누름을 막는다.
  // 웹 버튼은 스스로 pointer-events-auto라 메뉴의 바깥 누름 차단이 닿지 않아서 inert로 막는다.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const pressStartedWithMenuOpenRef = useRef(false);
  // 메뉴가 열린 동안 Radix가 body의 누름을 막아 누름 시작이 화면 버튼에 닿지 않으므로 문서에서 기록한다.
  useEffect(() => {
    if (!moreMenuOpen) {
      return;
    }
    const markPressStart = () => {
      pressStartedWithMenuOpenRef.current = true;
    };
    document.addEventListener("pointerdown", markPressStart, true);
    return () => {
      document.removeEventListener("pointerdown", markPressStart, true);
    };
  }, [moreMenuOpen]);
  // 종료 확인 다이얼로그. 열려 있는 동안에도 **세션은 계속 진행된다**(Figma에서 딤 뒤
  // 상태 필이 `순공시간 측정 중`이고 타이머가 살아 있음을 확인).
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  // 세션 도움말. 끝까지 본 기록(seen)이 없으면 세션마다 띄우고, 더보기의 도움말 보기는 언제든 연다.
  // 기록은 마운트 때 한 번 읽는다. 신원이 바뀌면 화면이 key로 다시 마운트되어 새 계정의 기록을 읽는다.
  const [guideState, setGuideState] = useState(() =>
    userId === null ? null : sessionGuideState(userId),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  // Escape로 중간에 닫으면 기록은 남기지 않고, 이번 세션 화면에서만 다시 띄우지 않는다.
  const [helpDismissed, setHelpDismissed] = useState(false);
  // 과목 페이지 등에 가려 내렸다가 다시 띄울 때 같은 단계로 돌아오도록 단계를 여기서 든다.
  const [helpStep, setHelpStep] = useState(0);
  const [moreTrigger, setMoreTrigger] = useState<HTMLButtonElement | null>(null);
  const modalOverlayOpen = useModalOverlayOpen();
  // 다른 화면이 떠 있는 동안은 숨겼다가 닫히면 다시 보인다.
  const helpBlocked =
    page !== null || modeOpen || exitDialogOpen || invite !== null || modalOverlayOpen;
  // 떠 있는 동안 세션 본문은 inert로 막고 앱 glass 버튼은 faded로 감춘다. 덮개 위에 실제 glass 버튼이
  // 떠서 같은 자리의 가짜 버튼과 겹치지 않게 웹 가짜 요소만 보인다. 세션·타이머는 그대로 돈다.
  const helpVisible =
    phase.name === "studying" &&
    (helpOpen
      ? !helpBlocked
      : userId !== null &&
        !helpDismissed &&
        shouldShowSessionGuide({ state: guideState, blocked: helpBlocked }));
  // 도움말 화면은 가려지면 언마운트되어 다시 뜰 때 효과가 또 돈다.
  // 그래서 노출·단계 이벤트는 화면이 아니라 여기서 노출마다, 단계가 바뀔 때마다 한 번씩만 보낸다.
  // 열린 경로(trigger)는 노출이 끝날 때까지 유지하고, 추적 단계가 null이면 이번 노출의 첫 이벤트를 아직 보내지 않은 것이다.
  const helpTriggerRef = useRef<SessionHelpTrigger>("auto");
  const helpTrackedStepRef = useRef<number | null>(null);
  useEffect(() => {
    if (!helpVisible || helpTrackedStepRef.current === helpStep) {
      return;
    }
    if (helpTrackedStepRef.current === null) {
      trackStudySessionHelpShown(helpTriggerRef.current, "single");
    }
    helpTrackedStepRef.current = helpStep;
    trackStudySessionHelpStepViewed({
      step: helpStep + 1,
      trigger: helpTriggerRef.current,
      roomType: "single",
    });
  }, [helpVisible, helpStep]);
  // 마지막 단계까지 본 계정만 기록한다.
  // 메뉴로 다시 본 경우에도 같은 값을 남기므로 이미 seen인 계정에는 달라지는 것이 없다.
  function completeHelp() {
    trackStudySessionHelpCompleted(helpTriggerRef.current, "single");
    helpTriggerRef.current = "auto";
    helpTrackedStepRef.current = null;
    if (userId !== null) {
      markSessionGuideSeen(userId);
      setGuideState("seen");
    }
    setHelpOpen(false);
    setHelpStep(0);
  }
  function dismissHelp() {
    trackStudySessionHelpDismissed({
      step: helpStep + 1,
      trigger: helpTriggerRef.current,
      roomType: "single",
      reason: "escape",
    });
    helpTriggerRef.current = "auto";
    helpTrackedStepRef.current = null;
    setHelpDismissed(true);
    setHelpOpen(false);
    setHelpStep(0);
  }
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
   * 일시정지에서 스트림을 끄지 않는 이유는 셋이다 — Figma가 프리뷰를 그대로 보여주고,
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
      // 쿼리(`?userId=N`)를 함께 넘긴다 — 결과 화면의 `확인`이 홈으로 되돌릴 때 같은 식별자가 필요하고,
      // 상대 이동은 검색 문자열을 자동으로 물려주지 않는다.
      navigate(
        { pathname: "result", search: searchParams.toString() },
        // 결과 화면이 이 세션의 타임랩스를 기기 시작 시각으로 찾는다.
        { state: { sessions, startedAtMs }, replace: true },
      );
    },
    [navigate, searchParams, startedAtMs],
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
  const goHome = () => {
    postToNative({ type: "navigate-home", atMs: Date.now() });
    navigate({ pathname: "/home", search: searchParams.toString() }, { replace: true });
  };

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
    if (
      phase.name === "done" &&
      invite === null &&
      !endedBelowMinute &&
      endReason?.kind !== "AUTO"
    ) {
      goToResult(phase.sessions);
    }
  }, [endReason, endedBelowMinute, goToResult, invite, phase]);

  /**
   * 초대를 받은 채 끝난 세션의 이동
   *
   * 확인 창에서 종료를 골랐든, 이미 끝난 세션에 초대가 왔든 같은 규칙이다.
   * 저장 중이면 끝날 때까지 기다리고, 저장에 실패하면 `다시 제출` 화면에 머물렀다가 성공하면 간다.
   * 네이티브가 모달을 닫기 전에 effect가 다시 돌아도 요청은 한 번만 보낸다.
   */
  const leftForInviteRef = useRef(false);
  useEffect(() => {
    if (invite === null || leftForInviteRef.current) return;
    if (phase.name === "done" || phase.name === "unsaved") {
      leftForInviteRef.current = true;
      leaveSessionForInvite(invite);
    }
  }, [invite, phase]);

  /**
   * 전환 중에는 추론을 멈춘다(위 `detectionEnabled`). 전환이 끝나면 — 성공이든 실패든 —
   * 다시 켠다. 실패했을 때 꺼 두면 "전환할 카메라가 없어요" 토스트 한 번에 세션이 통째로
   * 측정 불가가 되는데, 어댑터는 실패 시 이전 카메라를 복원하므로 추론은 계속 가능하다.
   * 복원까지 실패한 경우에만 카메라가 꺼지고, 그때는 훅이 실행 상태를 내려 화면이 따라간다.
   *
   * 새 스트림이 `<video>`에 붙어 첫 프레임을 그리기까지는 시간이 걸리지만, 그 구간은
   * 감지기가 `readyState`를 보고 스스로 건너뛴다 — 여기서 기다릴 필요가 없다.
   */
  function handleFlipCamera() {
    setFlippingCamera(true);
    return flipCamera()
      .then((result) => {
        if (result.ok) {
          showCtaToast(CAMERA_TOAST_COPY.flipped);
          return;
        }
        showCtaToast(
          result.reason === "camera-off"
            ? CAMERA_TOAST_COPY.cameraOff
            : CAMERA_TOAST_COPY.noAlternative,
        );
      })
      .finally(() => {
        setFlippingCamera(false);
      });
  }

  // 리액트 컴파일러는 선언보다 먼저 참조한 함수가 있으면 이 컴포넌트를 통째로 건너뛴다.
  // 그래서 불리는 함수를 부르는 함수보다 위에 둔다.
  function openPage(next: "subject" | "ambient") {
    closingRef.current = null;
    // 앞으로 가기나 새로고침으로 이미 표시 항목에 와 있으면 그 항목을 다시 쓴다.
    // 하나 더 쌓으면 뒤로 가기를 두 번 해야 닫힌다.
    if (!pageEntryOnTop()) {
      window.history.pushState({ ...(window.history.state ?? {}), [PAGE_HISTORY_KEY]: next }, "");
    }
    setPage(next);
  }

  function openSubjectPage(source: "button" | "label", opener: HTMLElement) {
    trackSubjectSheetOpened(source, "single");
    subjectOpenedAtRef.current = Date.now();
    subjectOpenerRef.current = opener;
    // 미리 받기가 알림 없이 실패했으면 여는 순간 한 번 더 받는다.
    if (subjects.status === "error") {
      void subjects.reload();
    }
    openPage("subject");
  }

  function finishClosingPage() {
    // 요청 없이 온 popstate는 가장자리 스와이프나 브라우저 뒤로 가기다.
    const closedBy = closingRef.current ?? "back";
    closingRef.current = null;
    if (page === "subject") {
      trackSubjectSheetClosed({
        openSec: Math.round((Date.now() - subjectOpenedAtRef.current) / 1000),
        closedBy,
        roomType: "single",
      });
    }
    setPage(null);
  }

  /**
   * 페이지 닫기 요청
   *
   * 뒤로 버튼·Escape는 `back`, 재생 버튼은 `play`다.
   * 표시 항목이 맨 위에 없으면 되돌릴 항목이 없으므로 바로 닫는다.
   */
  function closePage(reason: PageCloseReason) {
    if (closingRef.current !== null) {
      return;
    }
    closingRef.current = reason;
    if (pageEntryOnTop()) {
      window.history.back();
      return;
    }
    finishClosingPage();
  }

  const onPagePopState = useEffectEvent(finishClosingPage);
  useEffect(() => {
    if (page === null) {
      return;
    }
    const handlePopState = () => onPagePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [page]);

  useEffect(() => {
    if (!studying) {
      dropPageEntry(closingRef);
    }
  }, [studying]);
  useEffect(() => () => dropPageEntry(closingRef), []);

  function closeMode() {
    setClosingMode(multiTimer);
    multiTimer.close();
  }

  // 라벨로 열었는데 페이지에서 과목을 해제하면 라벨이 사라지므로 과목 버튼으로 돌아간다.
  function subjectReturnFocus() {
    const opener = subjectOpenerRef.current;
    return opener?.isConnected ? opener : subjectButtonRef.current;
  }

  function handleSelectSubject(next: SubjectSelection | null) {
    // 일시정지 중에 이미 고른 과목의 재생 버튼을 누르면 선택은 그대로다 — 전이가 없으니 계측도 남기지 않는다.
    if (next === subjectSelection) {
      return;
    }
    trackSubjectItemSelected(next === null ? "none" : "subject", "single");
    selectSubject(next);
  }

  /** 이 세션에서 과목별로 쌓인 시간 — 서버와 같은 규칙(구간 − 이벤트 겹침)으로 화면에서 파생한다. */
  const liveSubjectTotals = deriveSubjectTotals(subjectSegments, sessionEvents);
  /** 타이머 위 라벨에 보일 과목. 이름은 목록에서 오고, 순공은 오늘(플래너 하루) 저장 기록 + 이 세션 몫이다. */
  const selectedSubject =
    subjectSelection === null
      ? null
      : (subjects.subjects.find((subject) => subject.id === subjectSelection) ?? null);
  const subjectLabel =
    subjectSelection === null
      ? null
      : {
          name: selectedSubject?.name ?? SUBJECT_SHEET_COPY.title,
          paused,
          focusSec:
            (selectedSubject?.focusSec ?? 0) +
            liveSubjectTime(liveSubjectTotals, subjectSelection).focusSec,
        };

  /** 하단 종료 버튼 */
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
    haptic("medium");
    setExitDialogOpen(false);
    void endAndSubmit(MANUAL_END_REASON);
  }

  const subjectButtonLabel =
    subjectSelection === null ? SUBJECT_SHEET_COPY.title : `${SUBJECT_SHEET_COPY.title} 선택됨`;
  const subjectNative = useNativeControl<HTMLButtonElement>(
    {
      id: "session-subject",
      kind: "button",
      title: null,
      systemImage: "book",
      shape: "circle",
      disabled: moreMenuOpen,
      accessibilityLabel: subjectButtonLabel,
      tone: subjectSelection === null ? "default" : "active",
      faded: simpleMode || helpVisible,
    },
    () => {
      // 앱 누름에는 누른 웹 요소가 없어서 숨겨 둔 웹 버튼을 연 요소로 둔다.
      if (subjectButtonRef.current !== null) {
        openSubjectPage("button", subjectButtonRef.current);
      }
    },
    { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
  );

  // 종료 안내(1분 미만·자동 종료)는 세션이 끝난 뒤의 화면이라 결과 화면처럼 시스템 테마를 따른다.
  // 그 밖의 세션 화면은 항상 다크다.
  const endNoticeVisible =
    phase.name === "done" && (endedBelowMinute || autoEndNoticeVisible(phase, endReason));

  return (
    <main
      ref={setSessionSurface}
      style={{ ...sessionSurfaceStyle, ...sessionGlowStyle(sessionState.kind) }}
      data-simple-mode={simpleMode}
      // 하단 버튼 아이콘과 타이머 텍스트가 마우스/터치 드래그로 끌리는 것을
      // 막는다 — `session-no-drag`(index.css)가 CSS를, onDragStart가 브라우저 네이티브
      // 드래그 이벤트 자체를 막는다(카메라 프리뷰가 있는 화면이라 드래그 고스트가 특히 튄다).
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        !endNoticeVisible && "theme-dark",
        "session-no-drag relative flex h-svh w-full flex-col items-center overflow-hidden bg-(--session-camera-base) text-white",
      )}
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
          {/* 화면 탭(하단 버튼 제외) → 심플 모드 전환. 버튼이 pointer-events-auto로 이 레이어를 가린다.
              대칭 복귀: 심플 모드에서 한 번 더 탭하면 프리뷰로 돌아온다(별도 닫기 버튼을 만들지 않는다).
              다이얼로그가 떠 있는 동안 딤 뒤 탭은 Radix 가 바깥 포인터를 막아 토글되지 않는다. */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            inert={helpVisible}
            // 메뉴는 누름이 시작될 때 닫혀서 클릭 때는 이미 닫힌 상태라, 누름을 시작한 순간의 열림으로 판단한다.
            onPointerDown={() => {
              pressStartedWithMenuOpenRef.current = moreMenuOpen;
            }}
            onClick={() => {
              // 메뉴 바깥을 눌러 메뉴만 닫으려던 누름이 심플 모드까지 바꾸지 않게 한다.
              if (pressStartedWithMenuOpenRef.current || moreMenuOpen) {
                pressStartedWithMenuOpenRef.current = false;
                return;
              }
              trackSessionSimpleModeToggled(!simpleMode);
              setSimpleMode((prev) => !prev);
            }}
            className="absolute inset-0 cursor-default"
          />

          <div inert={helpVisible} className={SESSION_LAYER_LAYOUT}>
            <SessionStatusPill
              state={pillState}
              label={statusCopy.label}
              className={cn(
                "landscape-compact:col-start-2 landscape-compact:row-start-1 landscape-compact:justify-self-center",
                SESSION_PILL_SIZE,
              )}
            />

            {/* 보이는 순서대로 오른쪽 열보다 앞에 둬서 탭 순서가 위에서 아래로 이어진다. */}
            <SessionMoreMenu
              container={sessionSurface}
              hidden={simpleMode || helpVisible}
              onFlipCamera={() => void handleFlipCamera()}
              onOpenHelp={() => {
                helpTriggerRef.current = "menu";
                setHelpStep(0);
                setHelpOpen(true);
              }}
              onOpenChange={setMoreMenuOpen}
              className={SOLO_MORE_POSITION}
              triggerRef={setMoreTrigger}
              aboveSideColumn
            />

            <SessionSideActions
              inert={simpleMode || moreMenuOpen}
              ambient={
                /* 배경음 버튼 */
                <AmbientSoundButton
                  ref={ambientButtonRef}
                  on={ambient.isOn}
                  expanded={page === "ambient"}
                  onClick={() => openPage("ambient")}
                  faded={simpleMode || helpVisible}
                  inactive={moreMenuOpen}
                />
              }
              subject={
                <Button
                  ref={(node) => {
                    subjectButtonRef.current = node;
                    subjectNative.ref(node);
                  }}
                  type="button"
                  size="icon"
                  variant="unstyled"
                  // 배경음 버튼과 같은 규칙이다.
                  // 이 버튼은 과목을 고르지 않고 페이지를 열어서, 고른 상태는 이름과 색으로 전한다.
                  aria-label={subjectButtonLabel}
                  aria-haspopup="dialog"
                  aria-expanded={page === "subject"}
                  data-on={subjectSelection !== null}
                  onClick={(event) => openSubjectPage("button", event.currentTarget)}
                  className={cn(controlButtonVariants(), "data-[on=true]:text-(--state-focus)")}
                >
                  <BookOpen
                    aria-hidden="true"
                    className="size-5.75 regular:size-6.75 short-side-lg:size-8.5"
                  />
                </Button>
              }
              // 페이지가 열려 있으면 페이지가 이 버튼들을 덮어서 따로 막지 않는다.
              modes={
                <ModeEntryButton
                  ref={timerButtonRef}
                  expanded={modeOpen}
                  faded={simpleMode || helpVisible}
                  inactive={moreMenuOpen}
                  onClick={() => multiTimer.open()}
                />
              }
              className={cn(
                SESSION_SIDE_POSITION,
                SIMPLE_MODE_FADE,
                simpleMode && "invisible opacity-0",
              )}
            />

            {/* 타이머 세로 위치는 이 스페이서 두 개의 flex-grow 비가 정한다 — 프리뷰는 위만
                늘려(1:0) 하단 버튼 바로 위에, 심플 모드는 균등(1:1)하게 나눠 상태 필과 하단 버튼
                사이 여백의 중앙에 놓는다. Figma는 ≈3:5로 중앙보다 위지만
                실기기에서 너무 높다는 확인으로 균등 배분으로 낮췄다.

                전환 애니메이션을 다시 넣지 말 것.
                
                예전에는 `transition-[flex-grow]`로 300ms ease-out 슬라이드를 줬는데,
                타이머가 미끄러지는 것 자체가 거슬린다는 판단으로 걷어냈다. 지금은 위치만
                즉시 바뀌고 배경·발광은 그대로 300ms로 페이드한다 — 움직이는 것은 타이머가
                아니라 화면이라는 인상이 된다. 타이머는 여전히 언마운트/재마운트하지 않으므로
                숫자가 끊기거나 리셋되지는 않는다. 가로에서는 그리드 트랙이 같은 일을 하므로 스페이서를 접는다. */}
            <div className="grow landscape-compact:hidden" />

            {/* 가로 배치만 표시 모드에 따라 갈린다.
                프리뷰는 두 하단 버튼 사이 가운데(3행 2열), 심플은 화면 가운데다.
                세로에서는 두 경우 모두 흐름 그대로다. */}
            <div
              className={cn(
                "relative flex flex-col items-center",
                simpleMode
                  ? // 그리드 칸 중앙은 위 필과 아래 바 높이 차이만큼 어긋나서 화면 기준으로 띄운다.
                    "landscape-compact:absolute landscape-compact:top-1/2 landscape-compact:left-1/2 landscape-compact:-translate-x-1/2 landscape-compact:-translate-y-1/2"
                  : "landscape-compact:col-start-2 landscape-compact:row-start-3 landscape-compact:self-end",
              )}
            >
              {/* 페이지가 열린 동안은 페이지 푸터의 Toaster가 받는다.
                  둘이 함께 있으면 토스트가 두 번 뜬다. */}
              {page === null && <CtaToaster />}
              {subjectLabel !== null && (
                <SubjectLabel
                  name={subjectLabel.name}
                  focusSec={subjectLabel.focusSec}
                  paused={subjectLabel.paused}
                  expanded={page === "subject"}
                  // 심플 모드는 화면 탭이 곧 모드 전환이라, 라벨이 눌리면 그 동작과 겹쳐 페이지가 잘못 열린다.
                  // 그래서 심플 모드에서는 누를 수 없는 글자로 둔다.
                  onClick={
                    simpleMode
                      ? undefined
                      : (event) => openSubjectPage("label", event.currentTarget)
                  }
                  className={cn(
                    "mb-1 landscape-compact:mb-2",
                    moreMenuOpen && "pointer-events-none",
                  )}
                />
              )}
              <SessionTimer
                focusSec={focusSec}
                studySec={studySec}
                state={pillState}
                glow={simpleMode}
              />
            </div>

            <div className={cn(simpleMode ? "grow" : "grow-0", "landscape-compact:hidden")} />

            {/* 가로에서는 줄을 풀어 두 버튼을 그리드 양 끝 칸에 놓는다.
                `display: contents` 요소의 role은 Safari에서 사라진 적이 있어 이 줄에는 role을 달지 않는다. */}
            <div className="mt-2 flex w-full justify-between regular:mt-2.5 short-side-lg:mt-3 landscape-compact:contents">
              <div
                inert={moreMenuOpen}
                className="landscape-compact:col-start-1 landscape-compact:row-start-3 landscape-compact:self-end landscape-compact:justify-self-start"
              >
                <SessionPauseButton
                  paused={paused}
                  inactive={moreMenuOpen}
                  faded={helpVisible}
                  // 화면 꺼짐 일시정지와 과목 재생 버튼도 pause·resume을 거치므로 햅틱은 이 버튼에만 둔다.
                  onClick={() => {
                    // 두 햅틱 모두 일시정지 상태에서 울려서 진동이 기기 조작 감지 결과로 이어지지 않는다.
                    if (paused) {
                      haptic("medium");
                      resume();
                    } else {
                      pause();
                      haptic("light");
                    }
                  }}
                />
              </div>
              <div
                inert={simpleMode || moreMenuOpen}
                className={cn(
                  "landscape-compact:col-start-3 landscape-compact:row-start-3 landscape-compact:self-end landscape-compact:justify-self-end",
                  SIMPLE_MODE_FADE,
                  simpleMode && "invisible opacity-0",
                )}
              >
                <SessionExitButton
                  onClick={handleRequestExit}
                  faded={simpleMode || helpVisible}
                  inactive={moreMenuOpen}
                />
              </div>
            </div>

            {userId === null && (
              <p className="mt-3 text-center text-[12px] leading-4 text-white/55 landscape-compact:col-span-full landscape-compact:row-start-4 landscape-compact:justify-self-center">
                이 기기가 아직 등록되지 않아 기록이 저장되지 않습니다
              </p>
            )}
          </div>

          {helpVisible && (
            <SessionHelpScreen
              onComplete={completeHelp}
              onDismiss={dismissHelp}
              returnFocus={helpOpen ? moreTrigger : null}
              step={helpStep}
              onStepChange={setHelpStep}
            />
          )}

          {/* 두 페이지는 Radix 포털을 타므로 여기 위치가 화면 배치를 정하지는 않는다.
              포털 자리를 `main` 으로 잡아야 `--session-*` 변수가 풀린다. */}
          <SessionPage
            open={page === "subject"}
            onOpenChange={(open) => {
              if (!open) closePage("back");
            }}
            container={sessionSurface}
            returnFocus={subjectReturnFocus}
            title={SUBJECT_SHEET_COPY.title}
            landscape={pageLandscape}
          >
            <SubjectPanel
              store={subjects}
              selection={subjectSelection}
              onSelect={handleSelectSubject}
              // 과목의 재생 버튼은 "이 과목으로 공부 시작"이다.
              // 일시정지 중이면 세션도 함께 다시 시작하고 페이지를 닫는다.
              onRequestClose={() => {
                if (paused) {
                  resume();
                }
                closePage("play");
              }}
              paused={paused}
              onNotice={showCtaToast}
              liveTotals={liveSubjectTotals}
              landscape={pageLandscape}
              timer={<SessionPageTimer focusSec={focusSec} />}
            />
          </SessionPage>

          <AmbientSoundSheet
            open={page === "ambient"}
            container={sessionSurface}
            returnFocus={() => ambientButtonRef.current}
            landscape={pageLandscape}
            timer={<SessionPageTimer focusSec={focusSec} />}
            catalog={ambient.catalog}
            mix={ambient.mix}
            duckEnabled={ambient.duckEnabled}
            blocked={ambient.blocked}
            canRestore={ambient.canRestore}
            onToggleSound={ambient.toggleSound}
            onChangeLevel={ambient.changeLevel}
            onSetDuckEnabled={ambient.setDuckEnabled}
            onToggleAll={ambient.toggleAll}
            onOpenChange={(open) => {
              if (!open) closePage("back");
            }}
          />

          {/* 처음 열기 전에는 그릴 모드가 없다.
              끈 뒤에는 끄기 직전 모습으로 밀려 나간다. */}
          {modeView !== null && (
            <MultiTimerScreen
              open={modeOpen}
              kind={modeKind}
              kindLocked={modeView.kindLocked}
              onSwitchKind={(kind) => multiTimer.switchKind(kind)}
              container={sessionSurface}
              returnFocus={() => timerButtonRef.current}
              onClose={closeMode}
              primaryLabel={modeView.primaryLabel}
              primaryDisabled={modeView.primaryDisabled}
              onPrimary={() => multiTimer.pressPrimary()}
              restartDisabled={modeView.restartDisabled}
              onRestart={() => multiTimer.restart()}
            >
              {modeView.mode?.kind === "timer" && (
                <TimerPanel
                  mode={modeView.mode}
                  remainingMs={modeView.remainingMs}
                  distracted={modeView.distracted}
                  onChangeTimerSec={(timerSec) => multiTimer.changeSettings({ timerSec })}
                  soundOn={modeView.soundOn}
                  onChangeSoundOn={(on) => multiTimer.setSoundOn(on)}
                />
              )}
              {modeView.mode?.kind === "pomodoro" && (
                <PomodoroPanel
                  mode={modeView.mode}
                  remainingMs={modeView.remainingMs}
                  distracted={modeView.distracted}
                  onChangeSettings={(patch) => multiTimer.changeSettings(patch)}
                  soundOn={modeView.soundOn}
                  onChangeSoundOn={(on) => multiTimer.setSoundOn(on)}
                />
              )}
            </MultiTimerScreen>
          )}
        </>
      ) : /* 미달 종료 안내 — 순공 1분 미만이면 자동 종료로 끝났든
             수동으로 끝냈든 기록에 남지 않으므로, `여기까지 기록을 저장했어요`도 결과 표시도 모두 사실이 아니다.

             `phase === "done"`을 요구하는 이유 — 제출 중·실패·미저장 상태에서는
             아래 폴백의 재시도 경로로 가야 한다. 저장 자체는 1분 미만이어도 정상적으로 하고,
             걸러내는 것은 표시·합산 단계다. */
      phase.name === "done" && endedBelowMinute && invite === null ? (
        <SubMinuteEndNotice
          onGoHome={() => {
            trackSessionNoticeConfirmed({ notice: "sub_minute", roomType: "single" });
            goHome();
          }}
        />
      ) : /* `phase.name === "done"`을 여기서 한 번 더 좁히는 이유: 타입 가드는 `endReason`만
             좁혀서 아래 `phase.sessions` 접근이 타입상 열리지 않는다. 조건 자체는 가드 안의
             검사와 동일하다. */
      phase.name === "done" && invite === null && autoEndNoticeVisible(phase, endReason) ? (
        /* 자동 종료 안내 — 저장이 **끝난 뒤에만** 보여준다(`phase === "done"`).
           타이틀이 `여기까지 기록을 저장했어요`로 단언하므로 제출 중·실패·미저장(userId 없음)
           상태에서 이 화면을 띄우면 사실과 달라진다 — 그 경우는 아래 폴백의 재시도 경로로 간다.

           `결과 보기`는 **이미 저장된 결과를 들고 결과 화면으로 이동**한다 — 여기서 다시 제출하지 않는다. */
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
        open={exitDialogOpen && phase.name === "studying" && invite === null}
        container={sessionSurface}
        title={EXIT_CONFIRM_COPY.title}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={EXIT_CONFIRM_COPY.cancel}
        confirmLabel={EXIT_CONFIRM_COPY.confirm}
        onCancel={handleCancelExit}
        onConfirm={handleConfirmExit}
      />
      {/*
        세션 중 초대 확인은 종료 확인과 같은 이유로 `phase` 삼항 밖에 둔다.
        확정하면 phase가 studying을 벗어나며 닫힌다.
      */}
      <SessionConfirmDialog
        open={invite !== null && phase.name === "studying"}
        container={sessionSurface}
        title={INVITE_CONFIRM_COPY.title}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={INVITE_CONFIRM_COPY.cancel}
        confirmLabel={INVITE_CONFIRM_COPY.confirm}
        onCancel={clearSessionInvite}
        onConfirm={() => {
          haptic("medium");
          void endAndSubmit(MANUAL_END_REASON);
        }}
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
          <p className="text-center text-sm text-(--session-exit-bg)">{phase.message}</p>
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
  // 복원 확인 중에도 초대를 받아 두도록 게이트 바깥에서 구독한다.
  const invite = useSessionInvite();

  // 공부를 끝낼 때 네트워크가 끊겨도 결과 화면이 열리게 세션 중에 결과 청크를 받아 둔다.
  useEffect(() => {
    prefetchResultPage();
  }, []);

  if (identityPending || !settled) {
    return (
      <main
        data-testid="room-restore-gate"
        className="theme-dark relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      />
    );
  }
  // 사용자가 바뀌면 통째로 새로 만든다. 복원값은 마운트 시점에 한 번만 읽히므로, 같은
  // 인스턴스를 유지하면 새 사용자가 앞 사용자의 세션을 그대로 이어받는다.
  return <RoomSessionScreen key={userId} userId={userId} restored={restored} invite={invite} />;
}
