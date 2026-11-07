import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  FOCUS_START_SOURCES,
  trackFocusStartTapped,
  trackStudySessionHelpCompleted,
  trackStudySessionHelpDismissed,
  type FocusStartSource,
} from "@/lib/amplitude";
import { subscribeToNativeMessages } from "@/lib/bridge";
import { haptic } from "@/lib/haptics";
import { hasRankingTab } from "@/lib/rankingCapability";
import { requestSessionStart, SubjectStartUnavailableError } from "@/lib/sessionStart";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/** 집중 시작이 넘긴 누른 자리. 그 경로로 오지 않았으면 null이다. */
function focusStartSourceOf(state: unknown): FocusStartSource | null {
  const source =
    typeof state === "object" && state !== null ? (state as { source?: unknown }).source : null;
  return FOCUS_START_SOURCES.find((known) => known === source) ?? null;
}

/** 과목은 플래너가 넘긴 선택만 받는다. URL은 과목 시작 요청의 출처로 쓰지 않는다. */
function plannerSubjectIdOf(state: unknown): number | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const value = state as { source?: unknown; initialSubjectId?: unknown };
  return value.source === "planner" &&
    typeof value.initialSubjectId === "number" &&
    Number.isSafeInteger(value.initialSubjectId) &&
    value.initialSubjectId > 0
    ? value.initialSubjectId
    : undefined;
}

/**
 * 첫 세션 가이드
 *
 * 가이드를 안 본 계정이 집중 시작을 누르면 세션 시작 요청 대신 이 화면으로 온다(`useFocusStart`).
 * 앱은 세션 시작 요청을 받아야 카메라 권한을 묻고 세션 화면을 열므로, 이 화면이 떠 있는 동안에는 권한 창도 세션도 없다.
 * 세션 시작이 네이티브 경로면 권한 창 뒤에 홈이 먼저 보이지 않게 가이드를 유지하다가, 세션이나 거부 안내가 탭을 덮으면 그 뒤에서 이전 화면으로 돌아간다.
 * 권한 창에 답하는 시간은 정할 수 없어 시간으로 닫지 않는다.
 * `tab-focus`는 `ranking=1`과 같은 바이너리(26.42.0)부터 온다.
 * 그 표시가 없는 구버전 앱은 세션이나 거부 안내를 열기 직전에 보내는 권한 결과(`camera_permission_gate_resolved`, 1.0.2(8)부터)로 판단한다.
 * 집중 시작 이벤트(`focus_start_tapped`)는 카메라 권한 결과의 분모라 실제로 시작할 때 누른 자리와 함께 보낸다.
 * 신호가 끝내 오지 않아도 갇히지 않게, 시작 요청을 보낸 뒤에는 `나중에 시작할게요`와 Escape로 나갈 수 있다.
 */
export function SessionGuidePage() {
  // 신원은 브리지 왕복 뒤에 오므로 정해진 뒤에 판정한다. 그 전에 판정하면 안 본 계정도 홈으로 튕긴다.
  const identityPending = useIdentityPending();
  const userId = useUserId();
  if (identityPending) {
    return <main className="theme-dark relative h-svh bg-background" />;
  }
  return <SessionGuide key={userId} userId={userId} />;
}

function SessionGuide({ userId }: { userId: number | null }) {
  const { t } = useTranslation(["planner", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const source = focusStartSourceOf(location.state);
  const initialSubjectId = plannerSubjectIdOf(location.state);
  // 끝까지 보면 기록이 남아도 이 화면이 다시 판정해 튕기지 않도록 들어올 때 한 번만 읽는다.
  const [guideNeeded] = useState(
    () => source !== null && userId !== null && sessionGuideState(userId) !== "seen",
  );
  const [step, setStep] = useState(0);
  const startingRef = useRef(false);
  const requestPendingRef = useRef(false);
  const completedRef = useRef(false);
  const stopWaitingRef = useRef<() => void>(() => {});
  useSessionHelpFunnel(guideNeeded, step, "auto");
  useEffect(() => () => stopWaitingRef.current(), []);

  // 돌아갈 화면과 누른 자리는 집중 시작으로 왔을 때만 있다. 주소로 직접 열면 홈으로 보낸다.
  if (!guideNeeded || userId === null || source === null) {
    return <Navigate to={{ pathname: "/home", search: location.search }} replace />;
  }

  const leave = () => {
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
    // 요청이 실패해 다시 누른 것은 새 시작이 아니라 분모에 다시 세지 않는다.
    if (!completedRef.current) {
      trackFocusStartTapped(source);
    }
    complete("start");
    requestPendingRef.current = true;
    const tabFocusSupported = hasRankingTab();
    // 신호를 놓치지 않게 시작을 요청하기 전에 구독한다.
    const stopWaiting = subscribeToNativeMessages((message) => {
      const covered = tabFocusSupported
        ? message.type === "tab-focus" && !message.focused
        : message.type === "track-event" && message.name === "camera_permission_gate_resolved";
      if (covered) {
        stopWaiting();
        leave();
      }
    });
    stopWaitingRef.current = stopWaiting;
    const navigateToSession = () => {
      const search = new URLSearchParams(location.search);
      search.delete("initialSubjectId");
      if (source === "planner") {
        search.delete("date");
        search.delete("from");
      }
      if (initialSubjectId !== undefined) search.set("initialSubjectId", String(initialSubjectId));
      void navigate({ pathname: "/room/1", search: search.toString() }, { replace: true });
    };
    const request =
      initialSubjectId === undefined
        ? requestSessionStart(userId, navigateToSession)
        : requestSessionStart(userId, navigateToSession, { subjectId: initialSubjectId });
    request
      .catch((error: unknown) => {
        console.warn("[session-guide] failed to start session", error);
        stopWaiting();
        startingRef.current = false;
        if (error instanceof SubjectStartUnavailableError) {
          showToast(t("studyStart.updateApp"));
          leave();
        } else {
          showToast(t("common:errors.retryLater"));
        }
      })
      .finally(() => {
        requestPendingRef.current = false;
      });
  };

  return (
    <main className="theme-dark relative h-svh bg-background" style={sessionSurfaceStyle}>
      <SessionHelpScreen
        step={step}
        onStepChange={setStep}
        onComplete={start}
        onLater={() => {
          if (requestPendingRef.current) {
            return;
          }
          complete("later");
          leave();
        }}
        onDismiss={() => {
          if (requestPendingRef.current) {
            return;
          }
          // 이미 끝까지 본 노출은 중단으로 세지 않는다.
          if (!completedRef.current) {
            trackStudySessionHelpDismissed({
              step: step + 1,
              stepId: SESSION_HELP_STEPS[step].id,
              trigger: "auto",
              roomType: "single",
              reason: "escape",
            });
          }
          leave();
        }}
      />
    </main>
  );
}
