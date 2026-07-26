import { useCallback, useEffect, useRef, useState } from "react";

import type { StudySessionResponse } from "@focuson/types";

import type { CameraAdapter, CameraFlipResult } from "./adapters/cameraAdapter";
import { createMockCameraAdapter } from "./adapters/cameraAdapter";
import type { FocusDetector } from "./adapters/focusDetector";
import { createMockFocusDetector } from "./adapters/focusDetector";
import type { DetectionParams, DetectionState, TriggerSignals } from "./detection";
import {
  DEFAULT_DETECTION_PARAMS,
  NO_TRIGGER_SIGNALS,
  createDetectionState,
  stepDetection,
} from "./detection";
import type { PauseTrigger, SessionState } from "./sessionState";
import { FOCUS_STATE, distractionState, isSameSessionState, pauseState } from "./sessionState";
import type { SessionTimeline, SessionTotals } from "./sessionTimeline";
import {
  closeSessionTimeline,
  computeSessionTotals,
  createSessionTimeline,
  currentState,
  toStatusEvents,
  transition,
} from "./sessionTimeline";
import { submitStudySession } from "./submitStudySession";

/** URL 쿼리 등 외부 입력에서 온 userId 문자열을 검증한다 — 양의 정수만 유효, 그 외 null. */
export function parseUserId(raw: string | null): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** 제출 라이프사이클. 세션 내부 상태(FOCUS/DISTRACTION/PAUSE)와는 **다른 축**이다. */
export type StudyRoomPhase =
  | { name: "studying" }
  | { name: "submitting" }
  | { name: "done"; sessions: StudySessionResponse[] }
  | { name: "error"; message: string }
  | { name: "unsaved"; studySec: number };

const ZERO_TOTALS: SessionTotals = { studySec: 0, focusSec: 0, pauseSec: 0, distractionSec: 0 };

export interface StudyRoomSessionOptions {
  /** 기본값은 mock. 실제 구현체는 실기기 스파이크 이후 별도 티켓에서 주입한다. */
  readonly camera?: CameraAdapter;
  readonly detector?: FocusDetector;
  /** 감지 유지시간 — 하드코딩하지 않고 주입한다(mvp-scope.md "감지 파라미터", 튜닝 예정). */
  readonly detectionParams?: DetectionParams;
  /** 타이머·감지 판정 주기(ms). 초 표시는 1초마다 바뀌지만 감지 판정은 더 촘촘해야 한다. */
  readonly tickMs?: number;
}

/**
 * 스터디룸 세션 로직 — 입장 시각 기록, **순공·총 공부 2축 타이머**, 세션 상태 머신,
 * 상태 이벤트(`StatusEventPayload[]`) 누적, 종료 시 세션 제출.
 *
 * 계산은 전부 순수 모듈(`sessionTimeline`·`detection`)에 있고 이 훅은 배선만 한다.
 * 세션 중에는 어떤 API도 호출하지 않는다(오프라인에서 세션이 완전히 동작해야 한다) —
 * 제출은 종료 시 1회, 서버는 앱이 잰 studySec/focusSec을 그대로 저장한다.
 */
export function useStudyRoomSession(userId: number | null, options: StudyRoomSessionOptions = {}) {
  const [camera] = useState<CameraAdapter>(() => options.camera ?? createMockCameraAdapter());
  const [detector] = useState<FocusDetector>(() => options.detector ?? createMockFocusDetector());
  const [detectionParams] = useState<DetectionParams>(
    () => options.detectionParams ?? DEFAULT_DETECTION_PARAMS,
  );
  const tickMs = options.tickMs ?? 200;

  const startedAtMsRef = useRef(Date.now());
  // 최초 종료 클릭 시점에 고정 — 재시도해도 같은 세션으로 멱등 제출되게 한다.
  const endedAtMsRef = useRef<number | null>(null);
  const timelineRef = useRef<SessionTimeline>(createSessionTimeline(startedAtMsRef.current));

  const signalsRef = useRef<TriggerSignals>({ ...NO_TRIGGER_SIGNALS });
  const detectionRef = useRef<DetectionState>(createDetectionState(startedAtMsRef.current));

  const [sessionState, setSessionState] = useState<SessionState>(FOCUS_STATE);
  const [totals, setTotals] = useState<SessionTotals>(ZERO_TOTALS);
  const [cameraFacing, setCameraFacing] = useState(camera.facing);
  const [isCameraRunning, setIsCameraRunning] = useState(camera.isRunning);
  const [phase, setPhase] = useState<StudyRoomPhase>({ name: "studying" });

  /** 타임라인에 구간을 끊고 화면 상태를 맞춘다 — 상태 전이의 단일 통로. */
  const applyState = useCallback((next: SessionState, atMs: number = Date.now()) => {
    timelineRef.current = transition(timelineRef.current, next, atMs);
    setSessionState((prev) => (isSameSessionState(prev, next) ? prev : next));
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

      const next = computeSessionTotals(timelineRef.current, nowMs);
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
  }, [applyState, detectionParams, phase.name, tickMs]);

  /** 수동 일시정지 / 백그라운드 전환 — 서버에는 둘 다 PAUSE 하나로 나간다. */
  const pause = useCallback(
    (trigger: PauseTrigger = "MANUAL") => {
      applyState(pauseState(trigger));
    },
    [applyState],
  );

  /** 재개 — 집중으로 돌아가고, 감지가 아직 살아 있으면 다음 tick에서 비집중으로 다시 넘어간다. */
  const resume = useCallback(() => {
    applyState(FOCUS_STATE);
  }, [applyState]);

  /**
   * TODO(미정: 자동/수동 재개 — 리더 확인). 화면 꺼짐·백그라운드 복귀 시 자동 재개할지
   * 일시정지 화면에서 수동 재개할지는 `design.md` 백로그 6 / 6차 인터뷰에 "구현 시 결정,
   * 임의 확정 금지"로 남아 있다. 인터페이스만 두고 동작은 스펙 확정 후 WG2가 채운다.
   * 현재 상태: **미구현 — 복귀해도 PAUSE 유지(정책 미확정)**.
   */
  const onReturnFromBackground = useCallback(() => {
    // 의도적 no-op.
  }, []);

  const flipCamera = useCallback(async (): Promise<CameraFlipResult> => {
    const result = await camera.flip();
    if (result.ok) {
      setCameraFacing(result.facing);
    }
    return result;
  }, [camera]);

  const endAndSubmit = useCallback(async () => {
    endedAtMsRef.current ??= Date.now();
    const endedAtMs = endedAtMsRef.current;
    timelineRef.current = closeSessionTimeline(timelineRef.current, endedAtMs);
    const closed = timelineRef.current;
    const finalTotals = computeSessionTotals(closed, endedAtMs);
    const events = toStatusEvents(closed, endedAtMs);
    setTotals(finalTotals);

    if (userId === null) {
      setPhase({ name: "unsaved", studySec: finalTotals.studySec });
      return;
    }
    setPhase({ name: "submitting" });
    try {
      const sessions = await submitStudySession({
        userId,
        startedAtMs: startedAtMsRef.current,
        endedAtMs,
        studySec: finalTotals.studySec,
        focusSec: finalTotals.focusSec,
        events,
      });
      setPhase({ name: "done", sessions });
    } catch (error) {
      setPhase({
        name: "error",
        message: error instanceof Error ? error.message : "세션 제출에 실패했습니다",
      });
    }
  }, [userId]);

  return {
    /** 순공 시간(초) — 비집중·일시정지에서 멈춘다. */
    focusSec: totals.focusSec,
    /** 총 공부 시간(초) — 일시정지에서만 멈춘다. */
    studySec: totals.studySec,
    /** 일시정지 누적(초) — 벽시계 기준 별도 집계(2026-07-26 확정). */
    pauseSec: totals.pauseSec,
    sessionState,
    phase,
    cameraFacing,
    isCameraRunning,
    pause,
    resume,
    onReturnFromBackground,
    flipCamera,
    endAndSubmit,
  };
}
