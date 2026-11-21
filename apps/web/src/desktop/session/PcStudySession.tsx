import { CircleHelp } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import type { StudySessionResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";

import { HomeBandBlock } from "@/features/home-v3/HomeV3Content";
import { HomeStudyCard } from "@/features/home-v3/HomeStudyCard";
import { HomeSubjectSelect } from "@/features/home-v3/HomeSubjectSelect";
import type { StudyTone } from "@/features/home-v3/studyTone";
import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { AutoEndNotice } from "@/features/study-session/components/AutoEndNotice";
import { NoFocusEndNotice } from "@/features/study-session/components/NoFocusEndNotice";
import { SessionResumeDialog } from "@/features/study-session/components/SessionResumeDialog";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import type { CameraView } from "@/features/study-session/displayUsage";
import { exitConfirmDescription } from "@/features/study-session/formatDuration";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { markSessionGuideSeen, sessionGuideState } from "@/features/study-session/sessionGuide";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useSessionGate } from "@/features/study-session/useSessionGate";
import {
  autoEndNoticeVisible,
  useSoloSessionEngine,
} from "@/features/study-session/useSoloSessionEngine";
import { spaceTrack, useTimerBackground } from "@/features/timer-background/timerBackground";
import {
  trackCameraPipExpanded,
  trackCameraPipShrunk,
  trackSessionNoticeConfirmed,
  trackStudySessionExitCancelled,
  trackStudySessionExitRequested,
} from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { queryClient } from "@/lib/queryClient";
import { statsKeys } from "@/lib/statsQueries";
import { showToast } from "@/lib/toast";

import {
  PANEL_HEADER_ICON_BUTTON_CLASS,
  PANEL_HEADER_TEXT_BUTTON_CLASS,
} from "../home/panelHeaderButtonClass";
import { PcStudyPanel } from "../home/PcStudyPanel";
import { addSessionToToday } from "./liveStats";
import { PcCameraWindow } from "./PcCameraWindow";
import { PcSessionControls } from "./PcSessionControls";
import { PcSessionEndDialog } from "./PcSessionEndDialog";
import { PcSessionGuide } from "./PcSessionGuide";
import { clearPcSessionMarker, writePcSessionMarker } from "./pcSessionMarker";
import type { PcSessionRequest } from "./usePcSession";

// 휴대폰 안내 부품은 화면 전체를 덮는 자리라, 창 안에서는 그 자리와 안전 영역 여백을 걷어 낸다.
const NOTICE_IN_DIALOG = "relative inset-auto overflow-visible bg-transparent px-0 pt-0 pb-0";

interface PcStudySessionProps {
  request: PcSessionRequest;
  content: HomeV3ContentProps;
  /** 가이드와 종료 안내 창이 놓일 홈 상자 */
  box: HTMLElement | null;
  /** 세션을 만들기 전까지 대신 보일 홈 패널 */
  pending: ReactNode;
  /** 세션을 닫고 홈 상태로 돌아간다. */
  onEnd: () => void;
}

/**
 * PC 홈 위 공부 세션
 *
 * 휴대폰 세션 화면과 같은 게이트를 지난 뒤에 세션을 만들어, 서버 진행 기록을 받기 전에 0분부터 시작하지 않는다.
 * 그 사이에는 홈 패널을 그대로 보여 시작 버튼이 눌린 모양으로 남는다.
 * 과목은 홈 목록에서 고른 값이라 다시 확인하지 않는다.
 * 가이드와 종료 안내 창이 상자를 기준으로 놓여 상자가 그려진 뒤에 세션을 만든다.
 * 꺼진 자율 모드 기록은 휴대폰 세션 화면과 같은 확인 창을 상자 안에 띄우고, 끝내기를 고르면 경로를 바꾸지 않고 홈 상태로 돌아온다.
 */
export function PcStudySession({ request, content, box, pending, onEnd }: PcStudySessionProps) {
  const gate = useSessionGate(request.subjectId, true);
  const endResumable = async () => {
    await gate.endResumable();
    clearPcSessionMarker();
    // 나간 시점으로 확정한 기록이 오늘 집계에 들어간다.
    void queryClient.invalidateQueries({ queryKey: statsKeys.all });
    onEnd();
  };
  // 새로고침 뒤 이어 가려던 세션이 이미 확정돼 서버에 없으면 표시를 지우고 홈으로 둔다.
  // 조회가 실패했으면 기록이 남아 있을 수 있어 표시를 남긴 채 홈으로 두고, 다음 새로고침이 다시 이어 간다.
  const nothingToResume = request.resume && gate.ready && gate.restored === null;
  const restoreFailed = gate.restoreFailed;
  useEffect(() => {
    if (!nothingToResume) return;
    if (!restoreFailed) clearPcSessionMarker();
    onEnd();
  }, [nothingToResume, restoreFailed, onEnd]);
  if (!gate.ready || nothingToResume || box === null) return pending;
  if (gate.askAwayMin !== null) {
    return (
      <>
        {pending}
        <SessionResumeDialog
          awayMin={gate.askAwayMin}
          place="room"
          container={box}
          onResume={async () => {
            // 창을 연 채 2시간이 지나면 서버가 확정해서 이어받을 기록이 없어 끝내기와 같게 처리한다.
            if (!gate.acceptResume()) await endResumable();
          }}
          onEnd={endResumable}
        />
      </>
    );
  }
  // 사용자가 바뀌면 앞 사용자의 세션을 이어받지 않게 통째로 새로 만든다.
  return (
    <PcSessionScreen
      key={gate.userId}
      userId={gate.userId}
      restored={gate.restored}
      resumeAway={gate.resumeAway}
      initialSubjectId={gate.initialSubjectId}
      camera={request.camera}
      content={content}
      box={box}
      onEnd={onEnd}
    />
  );
}

interface PcSessionScreenProps {
  userId: number | null;
  restored: RestoredSession | null;
  resumeAway: boolean;
  initialSubjectId: number | undefined;
  camera: CameraAdapter | undefined;
  content: HomeV3ContentProps;
  box: HTMLElement;
  onEnd: () => void;
}

/**
 * PC 공부 중 화면
 *
 * 마운트하면 세션이 시작되고, 공부하는 동안만 이 탭에 세션 표시를 남긴다.
 * 패널은 홈과 같은 진행 띠와 공부 카드를 그리고, 공부 카드 시간에는 이번 세션을 더한다.
 * 진행 띠의 시작 버튼은 막아 공부 중에 세션 요청이 새로 나가지 않게 한다.
 * 종료 확인 창은 휴대폰 세션 화면과 같은 다크 창이라 세션 색 변수를 단 자리에 띄운다.
 * 결과 화면이 홈 위 창으로 바뀌기 전까지는 지금 결과 화면을 창 전체로 연다.
 * 카메라 창과 패널은 마지막에 만진 쪽이 위이고, 크게 본 카메라는 패널과 레일 아래에 깔려 공부를 멈추거나 끝낼 수 있다.
 * 숨긴 카메라는 휴대폰의 심플 모드와 같은 표시 기록으로 센다.
 * 다른 탭으로 옮겨도 카메라 프레임과 감지가 계속 돌아서 관리 모드도 멈추지 않는다.
 * 1분 미만·자동 종료·제출 실패는 휴대폰과 같은 안내를 상자 가운데 창으로 보이고, 미달 안내는 확인하면 홈 상태로 돌아온다.
 * ponytail: 기기 등록 전이라 저장하지 못한 세션은 PC 홈에 신원이 늘 있어 오지 않는다고 보고 따로 그리지 않는다.
 */
function PcSessionScreen({
  userId,
  restored,
  resumeAway,
  initialSubjectId,
  camera,
  content,
  box,
  onEnd,
}: PcSessionScreenProps) {
  const { t } = useTranslation(["study-session", "desktop", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  // 엔진 호출보다 위에 둬서 선언 전 참조가 생기지 않게 한다.
  const goToResult = (sessions: StudySessionResponse[], startedAtMs: number) =>
    navigate(
      { pathname: "/room/1/result", search: location.search },
      { state: { sessions, startedAtMs }, replace: true },
    );
  const {
    phase,
    startedAtMs,
    endReason,
    endedWithoutFocus,
    sessionState,
    focusSec,
    studySec,
    cameraOn,
    cameraStream,
    cameraFacing,
    videoRef,
    displayUsage,
    displayContextRef,
    subjectSelection,
    selectSubject,
    pause,
    resume,
    endAndSubmit,
    prefetchMascotLook,
  } = useSoloSessionEngine({
    userId,
    restored,
    resumeAway,
    initialSubjectId,
    camera,
    keepMeasuringWhenHidden: true,
    notify: showToast,
    onResult: goToResult,
  });
  const openResult = (sessions: StudySessionResponse[]) => goToResult(sessions, startedAtMs);
  const studying = phase.name === "studying";
  const paused = sessionState.kind === "PAUSE";
  const tone: StudyTone | undefined = !studying
    ? undefined
    : paused
      ? "pause"
      : sessionState.kind === "DISTRACTION"
        ? "distract"
        : "focus";
  const [cameraHidden, setCameraHidden] = useState(false);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [front, setFront] = useState<"panel" | "camera">("panel");
  const showCameraRef = useRef<HTMLButtonElement>(null);
  const hideCameraRef = useRef<HTMLButtonElement>(null);
  const cameraView: CameraView =
    !cameraOn || cameraHidden ? "simple" : cameraExpanded ? "expanded" : "pip";
  // 실제 전이만 센다. 같은 화면을 다시 그린 것은 switchTo가 null을 돌려준다.
  useEffect(() => {
    const change = displayUsage.switchTo(cameraView);
    if (change === null) return;
    if (change.from === "pip" && cameraView === "expanded") trackCameraPipExpanded();
    if (change.from === "expanded" && cameraView === "pip") {
      trackCameraPipShrunk({ expandedSec: change.sec });
    }
  }, [cameraView, displayUsage]);
  const space = useTimerBackground();
  useLayoutEffect(() => {
    const spaceInfo = spaceTrack(space);
    displayContextRef.current = {
      spaceKind: spaceInfo.kind,
      ...(spaceInfo.item && { spaceItem: spaceInfo.item }),
      faceMask: false,
    };
  });
  const [exitOpen, setExitOpen] = useState(false);
  const [dialogLayer, setDialogLayer] = useState<HTMLDivElement | null>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  // 제출 중·제출 실패에도 표시를 남겨, 그 사이 새로고침하면 서버 진행 기록으로 다시 열어 종료를 다시 누를 수 있게 한다.
  const keepMarker = studying || phase.name === "submitting" || phase.name === "error";
  useEffect(() => {
    if (!keepMarker || userId === null) return;
    writePcSessionMarker(userId);
    return clearPcSessionMarker;
  }, [keepMarker, userId]);
  // 저장이 끝나면 서버 기록에 이번 세션이 들어가 다시 더하면 두 번 센다.
  const stats =
    phase.name === "done"
      ? content.stats
      : addSessionToToday(content.stats, { studySec, focusSec });

  // 처음 관리 모드면 시작하자마자 가이드를 연다.
  const [guide, setGuide] = useState<"first" | "help" | null>(() =>
    cameraOn && userId !== null && sessionGuideState(userId) !== "seen" ? "first" : null,
  );
  const pausedBeforeGuideRef = useRef(false);
  const pauseRef = useRef<HTMLButtonElement>(null);
  // 보는 동안 순공이 흐르지 않게 멈추고, 원래 멈춰 있었으면 닫아도 풀지 않는다.
  function openGuide(kind: "first" | "help") {
    pausedBeforeGuideRef.current = paused;
    if (!paused) pause();
    setGuide(kind);
  }
  function closeGuide() {
    // 휴대폰 가이드와 달리 어떻게 닫아도 본 것으로 남겨 다음 시작에 다시 뜨지 않는다.
    if (userId !== null) markSessionGuideSeen(userId);
    if (!pausedBeforeGuideRef.current) resume();
    setGuide(null);
  }
  // 첫 가이드를 보는 동안 순공이 흐르지 않게 시작하자마자 멈춘다.
  // 개발 모드가 effect를 두 번 돌려도 이미 멈춘 세션은 다시 멈추지 않는다.
  const pauseForFirstGuide = useEffectEvent(() => {
    if (guide === "first" && !paused) pause();
  });
  useEffect(() => {
    pauseForFirstGuide();
  }, []);

  function hideCamera() {
    // 숨기기 버튼이 막히며 포커스를 잃지 않게 새로 생긴 카메라 보기로 옮긴다.
    flushSync(() => {
      setCameraExpanded(false);
      setCameraHidden(true);
    });
    showCameraRef.current?.focus();
  }
  function showCamera() {
    flushSync(() => setCameraHidden(false));
    hideCameraRef.current?.focus();
  }
  function togglePause() {
    // 두 햅틱 모두 일시정지 상태에서 울려 진동이 기기 조작 감지로 이어지지 않는다.
    if (paused) {
      haptic("medium");
      resume();
    } else {
      pause();
      haptic("light");
    }
  }
  function requestExit() {
    trackStudySessionExitRequested("single");
    // 결과 화면이 처음 그림부터 고른 마스코트를 그리도록 확인 창을 읽는 사이에 모습을 다시 받는다.
    prefetchMascotLook();
    setExitOpen(true);
  }
  function cancelExit() {
    trackStudySessionExitCancelled("single");
    setExitOpen(false);
  }
  function confirmExit() {
    haptic("medium");
    setExitOpen(false);
    void endAndSubmit(MANUAL_END_REASON);
  }

  return (
    <>
      <PcStudyPanel
        stats={stats}
        tone={tone}
        layer={front === "panel" ? 12 : 10}
        onActivate={() => setFront("panel")}
        headerActions={
          <>
            {cameraOn && cameraHidden && (
              <button
                ref={showCameraRef}
                type="button"
                onClick={showCamera}
                className={PANEL_HEADER_TEXT_BUTTON_CLASS}
              >
                {t("desktop:session.showCamera")}
              </button>
            )}
            {cameraOn && (
              <button
                type="button"
                aria-label={t("desktop:session.help")}
                disabled={!studying}
                onClick={() => openGuide("help")}
                className={`${PANEL_HEADER_ICON_BUTTON_CLASS} disabled:opacity-40`}
              >
                <CircleHelp aria-hidden="true" className="size-5" />
              </button>
            )}
          </>
        }
      >
        <HomeBandBlock {...content} startingStudy studying />
        <div data-pc-guide="stats">
          <HomeStudyCard stats={stats} tone={tone}>
            <HomeSubjectSelect
              subjects={content.subjects}
              subjectId={subjectSelection}
              starting={!studying}
              menuOpen={content.menuOpen}
              onMenuOpenChange={content.onMenuOpenChange}
              onSelect={(id) => {
                if (id !== subjectSelection) selectSubject(id);
              }}
            />
          </HomeStudyCard>
        </div>
        <PcSessionControls
          paused={paused}
          saving={phase.name === "submitting"}
          disabled={!studying}
          onTogglePause={togglePause}
          onExit={requestExit}
          pauseRef={pauseRef}
          exitRef={exitRef}
        />
      </PcStudyPanel>
      {cameraOn && (
        <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs leading-4 text-white/55">
          {t("cameraPrompt.notice")}
        </p>
      )}
      {cameraOn && (
        <PcCameraWindow
          stream={cameraStream}
          facing={cameraFacing}
          videoRef={videoRef}
          hidden={cameraHidden}
          expanded={cameraExpanded}
          onExpandedChange={setCameraExpanded}
          onHide={hideCamera}
          onActivate={() => setFront("camera")}
          layer={cameraExpanded ? 5 : front === "camera" ? 12 : 10}
          hideButtonRef={hideCameraRef}
        />
      )}
      <div ref={setDialogLayer} style={sessionSurfaceStyle} className="theme-dark" />
      <SessionConfirmDialog
        open={exitOpen && studying}
        container={dialogLayer}
        title={t("exitConfirm.title")}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={t("exitConfirm.cancel")}
        confirmLabel={t("exitConfirm.confirm")}
        returnFocus={() => exitRef.current}
        onCancel={cancelExit}
        onConfirm={confirmExit}
      />
      {guide !== null && studying && (
        <PcSessionGuide box={box} onClose={closeGuide} returnFocus={() => pauseRef.current} />
      )}
      {phase.name === "done" && endedWithoutFocus && (
        <PcSessionEndDialog container={box} title={t("noFocusEnd.title")}>
          <NoFocusEndNotice
            onGoHome={() => {
              trackSessionNoticeConfirmed({ notice: "sub_minute", roomType: "single" });
              onEnd();
            }}
            className={NOTICE_IN_DIALOG}
          />
        </PcSessionEndDialog>
      )}
      {phase.name === "done" && !endedWithoutFocus && autoEndNoticeVisible(phase, endReason) && (
        <PcSessionEndDialog container={box} title={t("autoEnd.title")}>
          <AutoEndNotice
            trigger={endReason.trigger}
            focusSec={focusSec}
            studySec={studySec}
            onSeeResult={() => {
              trackSessionNoticeConfirmed({ notice: "auto_end", roomType: "single" });
              openResult(phase.sessions);
            }}
            className={NOTICE_IN_DIALOG}
          />
        </PcSessionEndDialog>
      )}
      {phase.name === "error" && (
        <PcSessionEndDialog container={box} title={phase.message}>
          <p className="text-center text-sm leading-5 text-foreground">{phase.message}</p>
          <Button className="mt-5 min-h-12" onClick={() => void endAndSubmit()}>
            {t("common:actions.retry")}
          </Button>
        </PcSessionEndDialog>
      )}
    </>
  );
}
