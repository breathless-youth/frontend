import {
  recordStatus,
  startSession,
  summarizeSession,
  type StudySession,
  type StudySessionSummary,
  type StudyStatus,
} from "@focuson/study-core";
import { useEffect, useRef, useState } from "react";

/**
 * 브라우저용 세션 집계 훅. 모바일의 `useStudySession`(VisionEngine 기반)과 달리 여기서는
 * `useFocusDetector`가 이미 만들어낸 `isFocused` boolean을 그대로 STUDYING/AWAY로 매핑하는
 * 단순한 형태로 충분하다 — 웹은 지금 싱글 카메라 감지만 하고 PAUSED/CAMERA_OFF 같은 사용자
 * 주도 상태는 아직 없다(추후 필요하면 모바일처럼 게이트를 추가한다).
 * 계산 자체는 @focuson/study-core를 공유하므로 웹에서 별도로 재구현하지 않는다.
 */
export function useWebStudySession(isFocused: boolean): StudySessionSummary {
  const sessionRef = useRef<StudySession>(startSession(Date.now()));
  const [summary, setSummary] = useState<StudySessionSummary>(() =>
    summarizeSession(sessionRef.current, Date.now()),
  );

  useEffect(() => {
    const status: StudyStatus = isFocused ? "STUDYING" : "AWAY";
    const now = Date.now();
    sessionRef.current = recordStatus(sessionRef.current, { status, timestampMs: now });
    setSummary(summarizeSession(sessionRef.current, now));
  }, [isFocused]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSummary(summarizeSession(sessionRef.current, Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return summary;
}
