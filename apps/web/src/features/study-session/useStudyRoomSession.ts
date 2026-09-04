import { useCallback, useEffect, useRef, useState } from "react";

import type { StatusEventPayload, StudySessionResponse } from "@focusmakers/types";

import * as Sentry from "@sentry/react";

import {
  trackStudySessionEnded,
  trackStudySessionPaused,
  trackStudySessionResumed,
  trackStudySessionStarted,
  trackStudySessionSubmitted,
  type StudyRoomType,
} from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { reportHandled } from "@/lib/sentry";

import type { CameraAdapter, CameraFlipResult } from "./adapters/cameraAdapter";
import { createMockCameraAdapter } from "./adapters/cameraAdapter";
import type { FocusDetector } from "./adapters/focusDetector";
import { createMockFocusDetector } from "./adapters/focusDetector";
import type { SystemPauseSource } from "./adapters/systemPauseSource";
import { createSystemPauseSource } from "./adapters/systemPauseSource";
import type { DetectionParams, DetectionState, TriggerSignals } from "./detection";
import {
  DEFAULT_DETECTION_PARAMS,
  NO_TRIGGER_SIGNALS,
  createDetectionState,
  stepDetection,
} from "./detection";
import type { PauseTrigger, SessionEndReason, SessionState } from "./sessionState";
import {
  FOCUS_STATE,
  MANUAL_END_REASON,
  autoEndReason,
  distractionState,
  isSameSessionState,
  pauseState,
} from "./sessionState";
import type { SessionTimeline, SessionTotals } from "./sessionTimeline";
import {
  closeSessionTimeline,
  computeSessionTotals,
  createSessionTimeline,
  currentState,
  currentStateSinceMs,
  toStatusEvents,
  transition,
} from "./sessionTimeline";
import { reportActiveSession } from "./reportActiveSession";
import type { RestoredSession } from "./restoreActiveSession";
import type { SessionTuningConfig } from "./sessionTuning";
import { DEFAULT_SESSION_TUNING } from "./sessionTuning";
import { submitStudySession } from "./submitStudySession";
import type { PausedSnapshot } from "./usePauseAutoEnd";
import { usePauseAutoEnd } from "./usePauseAutoEnd";

export { parseUserId } from "@/lib/userId";

/** 제출 라이프사이클. 세션 내부 상태(FOCUS/DISTRACTION/PAUSE)와는 **다른 축**이다. */
export type StudyRoomPhase =
  | { name: "studying" }
  | { name: "submitting" }
  | { name: "done"; sessions: StudySessionResponse[] }
  | { name: "error"; message: string }
  | { name: "unsaved"; studySec: number };

export interface StudyRoomSessionOptions {
  /** 기본값은 mock. 실제 구현체는 실기기 스파이크 이후 별도 티켓에서 주입한다. */
  readonly camera?: CameraAdapter;
  readonly detector?: FocusDetector;
  /** 화면 꺼짐·백그라운드 신호원. 기본값은 표준 Page Visibility 기반 구현. */
  readonly systemPause?: SystemPauseSource;
  /** 감지 유지시간 — 하드코딩하지 않고 주입한다(mvp-scope.md "감지 파라미터", 튜닝 예정). */
  readonly detectionParams?: DetectionParams;
  /** 타이머·감지 판정 주기(ms). 초 표시는 1초마다 바뀌지만 감지 판정은 더 촘촘해야 한다. */
  readonly tickMs?: number;
  /**
   * 세션 튜닝 파라미터 — 지금은 일시정지 자동 종료 임계값(S3-8) 하나뿐이다.
   * 기본값은 `autoEndPauseMinutes: 20`(2026-07-26 리더 확정). 테스트는 짧은 값을 주입해
   * 감시를 빠르게 재현한다.
   */
  readonly tuning?: SessionTuningConfig;
  /** 자동 종료 감시 주기(ms) — 테스트 주입용. */
  readonly autoEndPollMs?: number;
  /**
   * 서버에서 받아 온 진행중 세션. 있으면 그 값에서 이어서 시작한다.
   * 마운트 시점에 한 번만 읽는다 — 세션이 도는 중에 바뀌면 타이머가 흔들린다.
   */
  readonly restored?: RestoredSession | null;
  /**
   * 계측용 룸 종류(BY-472) — 소셜룸(`LiveRoomSession`)이 이 훅을 재사용하므로, 이 값
   * 없이는 `study_session_*` 이벤트에서 개인/그룹 세션이 구분되지 않아 F1 퍼널이 오염된다.
   * 세션 로직에는 관여하지 않는다.
   */
  readonly roomType?: StudyRoomType;
}

/**
 * 스터디룸 세션 로직 — 입장 시각 기록, **순공·총 공부 2축 타이머**, 세션 상태 머신,
 * 상태 이벤트(`StatusEventPayload[]`) 누적, 종료 시 세션 제출.
 *
 * 계산은 전부 순수 모듈(`sessionTimeline`·`detection`)에 있고 이 훅은 배선만 한다.
 * 세션 중에는 일정 주기로 진행 스냅샷만 서버에 보고하고(비정상 종료 대비), 최종 제출은 종료 시
 * 1회 한다. 서버는 앱이 잰 studySec/focusSec을 그대로 저장한다.
 */
export function useStudyRoomSession(userId: number | null, options: StudyRoomSessionOptions = {}) {
  const [camera] = useState<CameraAdapter>(() => options.camera ?? createMockCameraAdapter());
  const [detector] = useState<FocusDetector>(() => options.detector ?? createMockFocusDetector());
  const [detectionParams] = useState<DetectionParams>(
    () => options.detectionParams ?? DEFAULT_DETECTION_PARAMS,
  );
  const [systemPause] = useState<SystemPauseSource>(
    () => options.systemPause ?? createSystemPauseSource(),
  );
  const [tuning] = useState<SessionTuningConfig>(() => options.tuning ?? DEFAULT_SESSION_TUNING);
  const tickMs = options.tickMs ?? 200;
  // 계측 전용 — 마운트 후 바뀌지 않는다(옵션 전체가 마운트 1회 계약).
  const roomType: StudyRoomType = options.roomType ?? "single";

  /**
   * 복원 초기 상태. 마운트 시점에 한 번만 읽는다 — 세션이 도는 중에 바뀌면 타이머가 흔들린다.
   *
   * 앱이 죽어 있던 공백을 일시정지 구간으로 열어 두면, 그 시간이 공부시간에 안 들어가고
   * 20분 자동 종료 시계도 저절로 그 시점을 가리킨다. 공백을 위한 별도 계산이 필요 없다.
   *
   * 크래시 시점에 이미 일시정지 중이었으면 서버가 준 마지막 이벤트가 마지막 보고 시각에서
   * 끝나는 일시정지다. 그대로 두고 공백을 이어 붙이면 일시정지가 2회로 세져, 사용자가 한 번
   * 누른 것이 결과 화면에 두 번으로 보인다. 그래서 그 이벤트를 빼고 그 시작 시각부터 연다.
   */
  const [initial] = useState(() => {
    const restored = options.restored ?? null;
    if (restored === null) {
      const startedAtMs = Date.now();
      return {
        startedAtMs,
        timeline: createSessionTimeline(startedAtMs),
        baseStudySec: 0,
        baseFocusSec: 0,
        priorEvents: [] as StatusEventPayload[],
        serverSeenMs: 0,
      };
    }
    const priorEvents = [...restored.events];
    const last = priorEvents[priorEvents.length - 1];
    const mergeable =
      last !== undefined &&
      last.status === "PAUSE" &&
      Date.parse(last.endedAt) === restored.reportedAtMs;
    if (mergeable) {
      priorEvents.pop();
    }
    const gapFromMs = mergeable ? Date.parse(last.startedAt) : restored.reportedAtMs;
    return {
      startedAtMs: restored.startedAtMs,
      timeline: createSessionTimeline(gapFromMs, pauseState("BACKGROUND")),
      baseStudySec: restored.baseStudySec,
      baseFocusSec: restored.baseFocusSec,
      priorEvents,
      serverSeenMs: restored.reportedAtMs,
    };
  });

  const startedAtMsRef = useRef(initial.startedAtMs);
  // 최초 종료 클릭 시점에 고정 — 재시도해도 같은 세션으로 멱등 제출되게 한다.
  const endedAtMsRef = useRef<number | null>(null);
  // 종료 사유도 같은 이유로 최초 1회만 고정한다 — 재시도가 사유를 덮어쓰면 자동 종료로 끝난
  // 세션이 수동 종료로 둔갑해 S3-8 대신 엉뚱한 화면이 뜬다.
  const endReasonRef = useRef<SessionEndReason | null>(null);
  const timelineRef = useRef<SessionTimeline>(initial.timeline);

  /** 분석 이벤트 전용 카운터 — 세션 로직에는 관여하지 않는다. */
  const endTrackedRef = useRef(false);
  const submitAttemptRef = useRef(0);
  // 제출 in-flight 중 재진입 차단 — 일시정지 감시자와 유예 감시가 같은 복귀 이벤트에서
  // 동시에 발화할 수 있고, "다시 제출" 연타도 같은 경로다. 서버는 멱등이지만
  // 시도 계측(attempt)이 부풀고 타임라인 닫기가 중복 실행된다.
  const submitInFlightRef = useRef(false);
  // 진행 스냅샷 보고 가드 — 겹침·정지·중복보고를 각각 막는다.
  const snapshotInFlightRef = useRef(false);
  const snapshotStoppedRef = useRef(false);
  const snapshotErrorReportedRef = useRef(false);

  const signalsRef = useRef<TriggerSignals>({ ...NO_TRIGGER_SIGNALS });
  const detectionRef = useRef<DetectionState>(createDetectionState(startedAtMsRef.current));

  /** 서버에서 받아 온 누적값 위에 지금 타임라인이 잰 값을 얹는다. */
  const withBase = useCallback(
    (computed: SessionTotals): SessionTotals => ({
      studySec: initial.baseStudySec + computed.studySec,
      focusSec: initial.baseFocusSec + computed.focusSec,
      pauseSec: computed.pauseSec,
      distractionSec: computed.distractionSec,
    }),
    [initial.baseFocusSec, initial.baseStudySec],
  );

  /** 서버가 준 이벤트 뒤에 지금 타임라인이 만든 이벤트를 잇는다. */
  const allEvents = useCallback(
    (untilMs: number): StatusEventPayload[] => [
      ...initial.priorEvents,
      ...toStatusEvents(timelineRef.current, untilMs),
    ],
    [initial.priorEvents],
  );

  const [sessionState, setSessionState] = useState<SessionState>(() =>
    currentState(initial.timeline),
  );
  const [totals, setTotals] = useState<SessionTotals>(() =>
    withBase(computeSessionTotals(initial.timeline, Date.now())),
  );
  const [cameraFacing, setCameraFacing] = useState(camera.facing);
  const [isCameraRunning, setIsCameraRunning] = useState(camera.isRunning);
  const [phase, setPhase] = useState<StudyRoomPhase>({ name: "studying" });
  const [endReason, setEndReason] = useState<SessionEndReason | null>(null);
  /**
   * 일시정지 시작 **벽시계** 시각 스냅샷 — 자동 종료 감시자(`usePauseAutoEnd`)의 유일한 입력.
   * 트리거는 여기 실려 있지만 S3-8 문구 선택용일 뿐 임계값 판정에는 쓰이지 않는다.
   */
  const [pausedSnapshot, setPausedSnapshot] = useState<PausedSnapshot | null>(() => {
    // 복원은 일시정지로 시작하는데 applyState를 거치지 않으므로 여기서 직접 심는다.
    // 빠뜨리면 자동 종료 감시자가 복원 세션을 아예 안 본다.
    const state = currentState(initial.timeline);
    return state.kind === "PAUSE"
      ? { sinceMs: currentStateSinceMs(initial.timeline), trigger: state.trigger }
      : null;
  });

  /** 타임라인에 구간을 끊고 화면 상태를 맞춘다 — 상태 전이의 단일 통로. */
  const applyState = useCallback((next: SessionState, atMs: number = Date.now()) => {
    timelineRef.current = transition(timelineRef.current, next, atMs);
    setSessionState((prev) => (isSameSessionState(prev, next) ? prev : next));
    // 전이 **후의** 타임라인에서 읽는다 — `transition`이 같은 상태를 무시했을 수도 있어
    // `next`를 그대로 믿으면 일시정지 시작 시각이 매번 갱신돼 자동 종료가 영원히 안 온다.
    const applied = currentState(timelineRef.current);
    setPausedSnapshot((prev) => {
      if (applied.kind !== "PAUSE") {
        return prev === null ? prev : null;
      }
      const sinceMs = currentStateSinceMs(timelineRef.current);
      return prev !== null && prev.sinceMs === sinceMs && prev.trigger === applied.trigger
        ? prev
        : { sinceMs, trigger: applied.trigger };
    });
  }, []);

  /**
   * 세션 시작 이벤트 — 스터디룸 진입이 곧 세션 시작이다(별도 시작 버튼이 없다).
   * 세션 완주율(시작 대비 `study_session_ended`)의 분모가 된다.
   *
   * 계측만 하고 세션 로직에는 관여하지 않으므로 의존성 없는 마운트 1회 이펙트로 둔다.
   */
  useEffect(() => {
    trackStudySessionStarted(roomType);
  }, [roomType]);

  /**
   * 에러 이벤트에 "세션의 어느 단계였나"를 싣는다(BY-372). setPhase 호출부마다 심지 않고
   * phase.name 변화를 여기서 한 번에 관측한다 — 전환 지점이 늘어도 이 코드는 안 바뀐다.
   * DSN 미설정이면 둘 다 no-op. 값은 phase명(enum)뿐 — 개인정보 없음.
   */
  useEffect(() => {
    Sentry.setTag("session_phase", phase.name);
    Sentry.addBreadcrumb({ category: "session", message: `phase → ${phase.name}`, level: "info" });
    return () => {
      // setTag는 전역 스코프에 남는다 — 언마운트 시 지우지 않으면 결과·홈 등 세션 밖
      // 라우트의 에러에 마지막 phase가 그대로 실려 세션 에러처럼 보인다.
      Sentry.setTag("session_phase", undefined);
    };
  }, [phase.name]);

  // 웹뷰인지 브라우저 단독인지 — 브리지 관련 에러 분류의 핵심 축. 마운트 1회.
  useEffect(() => {
    Sentry.setTag("bridge", isNativeBridgeAvailable() ? "webview" : "browser");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const starting = camera.start();
    // 동기 시작 어댑터(mock)는 여기서 이미 반영된다. 비동기 어댑터만 아래 then에서 뒤늦게 반영한다 —
    // 값이 그대로면 setState 자체를 호출하지 않아 불필요한 리렌더가 생기지 않는다.
    const runningAfterCall = camera.isRunning;
    setIsCameraRunning(runningAfterCall);
    void starting.then(() => {
      if (!cancelled && camera.isRunning !== runningAfterCall) {
        setIsCameraRunning(camera.isRunning);
      }
    });
    detector.start();
    const unsubscribe = detector.subscribe((signal) => {
      const next = { ...signalsRef.current, [signal.trigger]: signal.active };
      signalsRef.current = next;
      // 신호가 바뀐 시각을 다음 tick이 아니라 **수신 시각**으로 기록한다.
      // tick에서만 반영하면 유지시간 판정이 최대 tickMs만큼 늦어진다.
      detectionRef.current = stepDetection(detectionRef.current, next, Date.now(), detectionParams);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      detector.stop();
      camera.stop();
      setIsCameraRunning(false);
    };
  }, [camera, detectionParams, detector]);

  useEffect(() => {
    if (phase.name !== "studying") {
      return;
    }
    const timer = setInterval(() => {
      const nowMs = Date.now();

      detectionRef.current = stepDetection(
        detectionRef.current,
        signalsRef.current,
        nowMs,
        detectionParams,
      );

      // 일시정지 중에는 감지가 상태를 덮어쓰지 않는다 — 재개 시점에 다시 반영된다.
      if (currentState(timelineRef.current).kind !== "PAUSE") {
        const active = detectionRef.current.active;
        applyState(active === null ? FOCUS_STATE : distractionState(active), nowMs);
      }

      const next = withBase(computeSessionTotals(timelineRef.current, nowMs));
      setTotals((prev) =>
        prev.studySec === next.studySec &&
        prev.focusSec === next.focusSec &&
        prev.pauseSec === next.pauseSec &&
        prev.distractionSec === next.distractionSec
          ? prev
          : next,
      );
    }, tickMs);
    return () => clearInterval(timer);
  }, [applyState, detectionParams, phase.name, tickMs, withBase]);

  // studying 동안만 30초마다 진행 스냅샷을 서버에 보고한다. 강제종료로 최종 제출이 안 와도
  // 서버가 마지막 스냅샷으로 세션을 자동 확정한다.
  useEffect(() => {
    if (phase.name !== "studying" || userId === null) {
      return;
    }
    const timer = setInterval(() => {
      if (snapshotStoppedRef.current || snapshotInFlightRef.current) {
        return;
      }
      const nowMs = Date.now();
      const totals = withBase(computeSessionTotals(timelineRef.current, nowMs));
      const events = allEvents(nowMs);
      snapshotInFlightRef.current = true;
      reportActiveSession({
        userId,
        startedAtMs: startedAtMsRef.current,
        reportedAtMs: nowMs,
        studySec: totals.studySec,
        focusSec: totals.focusSec,
        events,
      })
        .catch((error: unknown) => {
          // 네트워크 실패(ApiError 아님)는 조용히 다음 주기에 다시 보낸다.
          if (!(error instanceof ApiError)) {
            return;
          }
          // 400·404·409는 그 세션 보고를 멈춘다. 409는 세션이 이미 확정된 상태라 재시도하지
          // 않는다. 5xx는 일시 장애로 보고 다음 주기에 다시 보낸다.
          if (error.status === 400 || error.status === 404 || error.status === 409) {
            snapshotStoppedRef.current = true;
          }
          if (!snapshotErrorReportedRef.current) {
            snapshotErrorReportedRef.current = true;
            reportHandled(error, "session-snapshot");
          }
        })
        .finally(() => {
          snapshotInFlightRef.current = false;
        });
    }, 30_000);
    return () => clearInterval(timer);
  }, [allEvents, phase.name, userId, withBase]);

  /**
   * 수동 일시정지 / 백그라운드 전환 — 서버에는 둘 다 PAUSE 하나로 나간다.
   *
   * ⚠️ **이미 일시정지면 트리거가 달라도 구간을 다시 끊지 않는다.** `isSameSessionState`는
   * PAUSE끼리도 `trigger`를 비교하므로, 가드가 없으면 "수동 일시정지 중 화면이 꺼지는" 흔한
   * 경로에서 `MANUAL` → `BACKGROUND` 전이가 일어나 PAUSE 구간이 **2개로 쪼개진다**.
   * 그러면 `eventCounts.PAUSE`가 2가 되어 S4·S5에 "일시정지 2회"로 표시된다 —
   * 사용자는 한 번 눌렀는데. 6차 확정("트리거는 2개, 상태와 이벤트는 1개")의 직접 위반이다.
   * 트리거는 내부 계측용이므로 **먼저 들어온 트리거를 유지**한다. (qa-WG2 F1 실측 재현)
   */
  const pause = useCallback(
    (trigger: PauseTrigger = "MANUAL") => {
      if (currentState(timelineRef.current).kind === "PAUSE") {
        return;
      }
      applyState(pauseState(trigger));
      // 닫힌 타임라인(세션 종료 뒤)에는 전이가 적용되지 않는다 — 실제로 멈췄을 때만 찍는다.
      if (currentState(timelineRef.current).kind === "PAUSE") {
        trackStudySessionPaused(trigger, roomType);
      }
    },
    [applyState, roomType],
  );

  /** 재개 — 집중으로 돌아가고, 감지가 아직 살아 있으면 다음 tick에서 비집중으로 다시 넘어간다. */
  const resume = useCallback(() => {
    const before = currentState(timelineRef.current);
    const pausedSinceMs = currentStateSinceMs(timelineRef.current);
    applyState(FOCUS_STATE);
    // 정지 중이 아닐 때의 resume(카메라 켜기 확인 등 중복 호출)은 찍지 않는다.
    if (before.kind === "PAUSE" && currentState(timelineRef.current).kind !== "PAUSE") {
      trackStudySessionResumed({
        pauseSec: Math.round((Date.now() - pausedSinceMs) / 1000),
        trigger: before.trigger,
        roomType,
      });
    }
  }, [applyState, roomType]);

  /**
   * **확정: 수동 재개**(2026-07-26 리더 확정). 화면 꺼짐·백그라운드에서 돌아와도 세션은
   * 자동으로 재개되지 않는다 — 사용자가 일시정지 화면의 재개 버튼을 직접 눌러야 한다.
   * 그래서 복귀 시 상태를 바꾸지 않는다(no-op) — 이건 임시가 아니라 확정된 동작이다.
   */
  const onReturnFromBackground = useCallback(() => {
    // 의도적 no-op — 자동 재개하지 않는다(확정 정책).
  }, []);

  /**
   * 화면 꺼짐·백그라운드 → **수동 일시정지와 같은 `pause()` 통로**로 들어간다(2026-07-26 확정).
   * 트리거만 `"BACKGROUND"`로 다르고 상태·화면·문구·시간 처리·서버 전송은 완전히 동일하다 —
   * 별도 상태나 별도 화면을 만들지 않는다.
   *
   * 복귀는 위 `onReturnFromBackground`로 넘긴다(수동 재개 확정 — 자동으로 이어지지 않는다).
   */
  useEffect(() => {
    if (phase.name !== "studying") {
      return;
    }
    return systemPause.subscribe({
      onLeave: () => {
        pause("BACKGROUND");
      },
      onReturn: onReturnFromBackground,
    });
  }, [onReturnFromBackground, pause, phase.name, systemPause]);

  const flipCamera = useCallback(async (): Promise<CameraFlipResult> => {
    const result = await camera.flip();
    if (result.ok) {
      setCameraFacing(result.facing);
    }
    // 전환은 기존 스트림을 먼저 정지하므로(Android는 기존 카메라를 놓아야 반대 카메라가
    // 열린다) 복원까지 실패하면 카메라가 실제로 꺼진다. 여기서 실행 상태를 다시 읽지 않으면
    // 화면과 상대에게 나가는 발행이 낡은 "켜짐"으로 남는다.
    setIsCameraRunning(camera.isRunning);
    return result;
  }, [camera]);

  /**
   * 세션 종료 + 제출. `reason`은 **최초 호출에만** 반영된다(재시도는 사유를 바꾸지 않는다).
   *
   * TODO(미정: 자동 종료 `endedAt` 기준 — 리더/BE 협의). 지금은 수동·자동 모두 "종료가
   * 판정된 시각"으로 고정한다(`Date.now()`). 자동 종료의 경우 (a) 일시정지 시작 시각과
   * (b) 자동 종료 판정 시각(= 일시정지 시작 + N분) 중 어느 쪽을 보낼지 확정되지 않았다
   * (SCR-S3-7·S3-8 Current Limitations). 어느 쪽이든 **이 한 줄만** 바꾸면 된다 —
   * 시각 계산을 다른 곳으로 흩뜨리지 않는다. 서버 검증
   * (`studySec ≤ (endedAt − startedAt) − PAUSE 합`)과 S4 헤더의 시각 범위가 여기에 달려 있다.
   */
  const endAndSubmit = useCallback(
    async (reason: SessionEndReason = MANUAL_END_REASON) => {
      if (submitInFlightRef.current) {
        return;
      }
      endReasonRef.current ??= reason;
      setEndReason(endReasonRef.current);
      // 서버가 마지막으로 본 시각보다 앞설 수 없다. 세션 도중 단말 시계가 뒤로 조정되면
      // 종료 시각이 시작 시각에 붙어, 제출 클램프가 이어받은 누적값을 통째로 깎아 낸다.
      // 서버가 준 이벤트도 세션 구간 밖으로 밀려나 검증에 걸린다.
      endedAtMsRef.current ??= Math.max(Date.now(), initial.serverSeenMs);
      const endedAtMs = endedAtMsRef.current;
      timelineRef.current = closeSessionTimeline(timelineRef.current, endedAtMs);
      const closed = timelineRef.current;
      const finalTotals = withBase(computeSessionTotals(closed, endedAtMs));
      const events = allEvents(endedAtMs);
      setTotals(finalTotals);

      // 종료 집계는 세션당 한 번만 — 제출 재시도가 세션 수를 부풀리면 완주율이 망가진다.
      // 제출 성공/실패는 아래 `study_session_submitted`가 시도마다 따로 기록한다.
      if (!endTrackedRef.current) {
        endTrackedRef.current = true;
        // 인자 `reason`이 아니라 **최초로 확정된** 사유를 쓴다 — 재시도가 사유를 바꾸지 않듯
        // 계측도 최초 값을 따라야 한다. 이름을 달리해 두 값이 다를 수 있음을 드러낸다.
        const finalReason = endReasonRef.current;
        trackStudySessionEnded({
          roomType,
          studySec: finalTotals.studySec,
          focusSec: finalTotals.focusSec,
          pauseSec: finalTotals.pauseSec,
          distractionSec: finalTotals.distractionSec,
          endReason: finalReason?.kind ?? "MANUAL",
          pauseTrigger: finalReason?.kind === "AUTO" ? finalReason.trigger : null,
          willSubmit: userId !== null,
          // 서버에 보내는 events와 같은 집계 — 비집중 건별 이벤트 대신 여기서 센다(2026-09-05 재검토).
          awayCount: events.filter((event) => event.status === "AWAY").length,
          phoneCount: events.filter((event) => event.status === "PHONE").length,
          deviceCount: events.filter((event) => event.status === "DEVICE").length,
          pauseCount: events.filter((event) => event.status === "PAUSE").length,
        });
      }

      if (userId === null) {
        setPhase({ name: "unsaved", studySec: finalTotals.studySec });
        return;
      }
      setPhase({ name: "submitting" });
      submitInFlightRef.current = true;
      submitAttemptRef.current += 1;
      const attempt = submitAttemptRef.current;
      try {
        const sessions = await submitStudySession({
          userId,
          startedAtMs: startedAtMsRef.current,
          endedAtMs,
          studySec: finalTotals.studySec,
          focusSec: finalTotals.focusSec,
          events,
        });
        trackStudySessionSubmitted(true, attempt, roomType);
        setPhase({ name: "done", sessions });
      } catch (error) {
        trackStudySessionSubmitted(false, attempt, roomType);
        // 사용자의 공부 기록이 저장되지 못한 순간 — 재시도 UI가 있지만 발생 자체를 남긴다(BY-372).
        reportHandled(error, "session-submit");
        setPhase({
          name: "error",
          message: error instanceof Error ? error.message : "세션 제출에 실패했습니다",
        });
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [allEvents, initial.serverSeenMs, roomType, userId, withBase],
  );

  /**
   * 일시정지 자동 종료 감시 — **감시자는 이것 하나뿐이다**(S3-8).
   *
   * 수동 일시정지든 화면 꺼짐·백그라운드든 같은 `pausedSnapshot` 위에서 같은 임계값으로
   * 판정한다 — 트리거별 타이머를 따로 만들지 않는다(2026-07-26 확정: N값 공용 파라미터).
   * 세션이 이미 끝났으면(`phase !== "studying"`) 감시하지 않는다.
   *
   * ⚠️ 미정(리더 확인): 일시정지 중 종료 확인 다이얼로그(S3-7)를 열어 둔 채 임계값에 도달하면
   * 지금은 자동 종료가 그대로 발동해 `phase`가 바뀌고 다이얼로그가 사라지며 S3-8로 전환된다
   * (스펙의 "제안 기본값"과 같은 동작). 확정 사항이 아니므로 다른 동작이 정해지면 여기서 막는다.
   */
  const handleAutoEnd = useCallback(
    (trigger: PauseTrigger) => {
      void endAndSubmit(autoEndReason(trigger));
    },
    [endAndSubmit],
  );

  usePauseAutoEnd({
    paused: phase.name === "studying" ? pausedSnapshot : null,
    config: tuning,
    onAutoEnd: handleAutoEnd,
    // 화면 꺼짐 중에는 인터벌이 스로틀될 수 있다 — 복귀 시점에 경과를 다시 계산하려면
    // 훅과 **같은** 신호원을 봐야 한다(어댑터 인스턴스를 새로 만들지 않는다).
    systemPause,
    pollMs: options.autoEndPollMs,
  });

  /**
   * `stream`은 실제 어댑터에만 있다(mock에는 없다) — 없으면 null이고, 그러면
   * CameraPreviewSurface가 목업 서피스를 그린다.
   *
   * ⚠️ **불변식**: 이 값은 state가 아니라 가변 어댑터에서 렌더 중에 읽는다. 그래서
   * "스트림이 바뀌면 반드시 `isCameraRunning` 또는 `cameraFacing` 전이가 함께 일어난다"는
   * 조건에 기대고 있다 — 리렌더를 일으키는 것은 그 두 state뿐이다. 스트림만 조용히 바뀌는
   * 어댑터 동작을 추가하면 프리뷰가 갱신되지 않으므로, 그때는 스트림도 state로 올려야 한다.
   */
  const cameraStream = camera.stream ?? null;

  return {
    /** 순공 시간(초) — 비집중·일시정지에서 멈춘다. */
    focusSec: totals.focusSec,
    /** 총 공부 시간(초) — 일시정지에서만 멈춘다. */
    studySec: totals.studySec,
    /** 일시정지 누적(초) — 벽시계 기준 별도 집계(2026-07-26 확정). */
    pauseSec: totals.pauseSec,
    sessionState,
    phase,
    /**
     * 세션이 어떻게 끝났는가 — 종료 전에는 `null`. 서버로 보내지 않는 **클라이언트 내부 값**이며
     * 종료 후 어떤 화면(S3-8 vs 일반 결과)을 보여줄지, S3-8 본문을 무엇으로 쓸지에만 쓴다.
     */
    endReason,
    cameraFacing,
    isCameraRunning,
    cameraStream,
    pause,
    resume,
    onReturnFromBackground,
    flipCamera,
    endAndSubmit,
  };
}
