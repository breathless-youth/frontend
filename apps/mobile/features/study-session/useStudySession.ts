import {
  endSession as endStudySession,
  recordStatus,
  startSession,
  summarizeSession,
  type StudySession,
  type StudySessionSummary,
  type StudyStatus,
} from "@focuson/study-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VisionEngine } from "../../platform/vision";

export interface UseStudySessionResult {
  status: StudyStatus;
  summary: StudySessionSummary;
  isEnded: boolean;
  pause: () => void;
  resume: () => void;
  setCameraEnabled: (enabled: boolean) => void;
  end: () => void;
}

/**
 * `VisionEngine`(온디바이스 관측)과 `@focuson/study-core`(집계 계산)를 이어 붙여
 * 실시간 공부 상태/요약을 만든다. 카메라·Vision 구현과 세션 집계 로직은 분리된 채로 결합된다.
 * 사용자 주도 상태(PAUSED/CAMERA_OFF) 동안에는 vision 관측을 무시한다.
 */
export function useStudySession(engine: VisionEngine): UseStudySessionResult {
  const sessionRef = useRef<StudySession>(startSession(Date.now()));
  const gateRef = useRef<StudyStatus | null>(null);
  const [status, setStatus] = useState<StudyStatus>("STUDYING");
  const [summary, setSummary] = useState<StudySessionSummary>(() =>
    summarizeSession(sessionRef.current, Date.now()),
  );
  const [isEnded, setIsEnded] = useState(false);

  const apply = useCallback((next: StudyStatus, atMs: number) => {
    sessionRef.current = recordStatus(sessionRef.current, { status: next, timestampMs: atMs });
    setStatus(next);
    setSummary(summarizeSession(sessionRef.current, atMs));
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = engine.subscribe((observation) => {
      if (!mounted || gateRef.current) return;
      apply(observation.status, observation.timestampMs);
    });
    void engine.initialize().then(() => engine.start());
    return () => {
      mounted = false;
      unsubscribe();
      void engine.stop();
    };
  }, [engine, apply]);

  useEffect(() => {
    if (isEnded) return;
    const timer = setInterval(() => {
      setSummary(summarizeSession(sessionRef.current, Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [isEnded]);

  const pause = useCallback(() => {
    gateRef.current = "PAUSED";
    apply("PAUSED", Date.now());
    void engine.stop();
  }, [apply, engine]);

  const resume = useCallback(() => {
    gateRef.current = null;
    apply("STUDYING", Date.now());
    void engine.start();
  }, [apply, engine]);

  const setCameraEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        gateRef.current = null;
        apply("STUDYING", Date.now());
        void engine.start();
      } else {
        gateRef.current = "CAMERA_OFF";
        apply("CAMERA_OFF", Date.now());
        void engine.stop();
      }
    },
    [apply, engine],
  );

  const end = useCallback(() => {
    const now = Date.now();
    sessionRef.current = endStudySession(sessionRef.current, now);
    setSummary(summarizeSession(sessionRef.current, now));
    setIsEnded(true);
    void engine.dispose();
  }, [engine]);

  return useMemo(
    () => ({ status, summary, isEnded, pause, resume, setCameraEnabled, end }),
    [status, summary, isEnded, pause, resume, setCameraEnabled, end],
  );
}
