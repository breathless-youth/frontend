import { useEffect, useRef, useState } from "react";

import type { StudySessionResponse } from "@focuson/types";

import { submitStudySession } from "./submitStudySession";

/** URL 쿼리 등 외부 입력에서 온 userId 문자열을 검증한다 — 양의 정수만 유효, 그 외 null. */
export function parseUserId(raw: string | null): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** 초를 H:MM:SS로 표시한다. */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type StudyRoomPhase =
  | { name: "studying" }
  | { name: "submitting" }
  | { name: "done"; sessions: StudySessionResponse[] }
  | { name: "error"; message: string }
  | { name: "unsaved"; studySec: number };

/**
 * 스터디룸 세션 로직 — 입장 시각 기록, 경과 타이머, 종료 시 세션 제출과 상태 전환.
 * UI와 무관한 훅이라 디자인 확정 후의 새 룸 화면이 그대로 가져다 쓴다.
 * 지금은 Vision이 없어 studySec = focusSec = 세션 길이, events = []로 제출한다 —
 * Vision 도입 시 이 값들만 실제 측정값으로 교체한다(제출 경로는 submitStudySession 그대로).
 */
export function useStudyRoomSession(userId: number | null) {
  const startedAtMsRef = useRef(Date.now());
  // 최초 종료 클릭 시점에 고정 — 재시도해도 같은 세션으로 멱등 제출되게 한다.
  const endedAtMsRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<StudyRoomPhase>({ name: "studying" });

  useEffect(() => {
    if (phase.name !== "studying") {
      return;
    }
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtMsRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase.name]);

  async function endAndSubmit() {
    endedAtMsRef.current ??= Date.now();
    const endedAtMs = endedAtMsRef.current;
    const studySec = Math.floor((endedAtMs - startedAtMsRef.current) / 1000);
    if (userId === null) {
      setPhase({ name: "unsaved", studySec });
      return;
    }
    setPhase({ name: "submitting" });
    try {
      const sessions = await submitStudySession({
        userId,
        startedAtMs: startedAtMsRef.current,
        endedAtMs,
        studySec,
        focusSec: studySec,
        events: [],
      });
      setPhase({ name: "done", sessions });
    } catch (error) {
      setPhase({
        name: "error",
        message: error instanceof Error ? error.message : "세션 제출에 실패했습니다",
      });
    }
  }

  return { elapsedSec, phase, endAndSubmit };
}
