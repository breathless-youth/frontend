import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { SessionHelpScreen } from "@/features/study-session/components/SessionHelpScreen";
import {
  SESSION_HELP_STEPS,
  markSessionGuideSeen,
  sessionGuideState,
} from "@/features/study-session/sessionGuide";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useSessionHelpFunnel } from "@/features/study-session/useSessionHelpFunnel";
import {
  trackFocusStartTapped,
  trackStudySessionHelpCompleted,
  trackStudySessionHelpDismissed,
  type FocusStartSource,
} from "@/lib/amplitude";
import { subscribeToNativeMessages } from "@/lib/bridge";
import { haptic } from "@/lib/haptics";
import { requestSessionStart } from "@/lib/sessionStart";
import { useUserId } from "@/lib/userId";

/** 세션이나 거부 안내가 덮었다는 신호(`tab-focus`)가 없는 26.42.0 미만 앱에서 가이드를 닫기까지 기다리는 시간 */
const COVER_WAIT_MS = 10_000;

/**
 * 첫 세션 가이드
 *
 * 가이드를 안 본 계정이 집중 시작을 누르면 세션 시작 요청 대신 이 화면으로 온다(`useFocusStart`).
 * 앱은 세션 시작 요청을 받아야 카메라 권한을 묻고 세션 화면을 열므로, 이 화면이 떠 있는 동안에는 권한 창도 세션도 없다.
 * 세션 시작이 네이티브 경로면 권한 창 뒤에 홈이 먼저 보이지 않게 가이드를 유지하다가, 세션이나 거부 안내가 탭을 덮으면 그 뒤에서 이전 화면으로 돌아간다.
 * 집중 시작 이벤트(`focus_start_tapped`)는 카메라 권한 결과의 분모라 실제로 시작할 때 누른 자리와 함께 보낸다.
 */
export function SessionGuidePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useUserId();
  // 끝까지 보면 기록이 남아도 이 화면이 다시 판정해 튕기지 않도록 들어올 때 한 번만 읽는다.
  const [guideNeeded] = useState(() => userId !== null && sessionGuideState(userId) !== "seen");
  const [step, setStep] = useState(0);
  const startingRef = useRef(false);
  const completedRef = useRef(false);
  const stopWaitingRef = useRef<() => void>(() => {});
  useSessionHelpFunnel(guideNeeded, step, "auto");
  useEffect(() => () => stopWaitingRef.current(), []);

  if (!guideNeeded || userId === null) {
    return <Navigate to={{ pathname: "/home", search: location.search }} replace />;
  }

  const state = location.state as { source?: FocusStartSource } | null;

  // 집중 시작으로 온 경우에만 돌아갈 화면이 있다. 주소로 직접 열면 홈으로 보낸다.
  const leave = () => {
    if (state?.source === undefined) {
      void navigate({ pathname: "/home", search: location.search }, { replace: true });
      return;
    }
    void navigate(-1);
  };

  const complete = (cta: "start" | "later") => {
    if (completedRef.current) {
      return;
    }
    completedRef.current = true;
    trackStudySessionHelpCompleted("auto", "single", cta);
    markSessionGuideSeen(userId);
  };

  const start = () => {
    if (startingRef.current) {
      return;
    }
    startingRef.current = true;
    haptic("medium");
    complete("start");
    trackFocusStartTapped(state?.source ?? "home");
    let coverTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // 신호를 놓치지 않게 시작을 요청하기 전에 구독한다.
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "tab-focus" && !message.focused) {
        leaveOnce();
      }
    });
    const stopWaiting = () => {
      stopped = true;
      unsubscribe();
      clearTimeout(coverTimer);
    };
    stopWaitingRef.current = stopWaiting;
    const leaveOnce = () => {
      if (stopped) {
        return;
      }
      stopWaiting();
      leave();
    };
    requestSessionStart(
      userId,
      () => void navigate({ pathname: "/room/1", search: location.search }, { replace: true }),
    )
      .then((route) => {
        if (route === "native" && !stopped) {
          coverTimer = setTimeout(leaveOnce, COVER_WAIT_MS);
        }
      })
      .catch((error: unknown) => {
        console.warn("[session-guide] failed to start session", error);
        stopWaiting();
        startingRef.current = false;
      });
  };

  return (
    <main className="theme-dark relative h-svh bg-background" style={sessionSurfaceStyle}>
      <SessionHelpScreen
        step={step}
        onStepChange={setStep}
        onComplete={start}
        onLater={() => {
          if (startingRef.current) {
            return;
          }
          complete("later");
          leave();
        }}
        onDismiss={() => {
          if (startingRef.current) {
            return;
          }
          trackStudySessionHelpDismissed({
            step: step + 1,
            stepId: SESSION_HELP_STEPS[step].id,
            trigger: "auto",
            roomType: "single",
            reason: "escape",
          });
          leave();
        }}
      />
    </main>
  );
}
