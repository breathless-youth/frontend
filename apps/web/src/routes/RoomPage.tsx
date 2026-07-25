import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import type { StudySessionResponse } from "@focuson/types";

import { submitStudySession } from "@/features/study-session/submitStudySession";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Phase =
  | { name: "studying" }
  | { name: "submitting" }
  | { name: "done"; sessions: StudySessionResponse[] }
  | { name: "error"; message: string }
  | { name: "unsaved"; studySec: number };

/**
 * 최소 타이머 룸(디자인 미적용, SCRUM-147). 측정은 입장~퇴장 타이머뿐이라
 * studySec = focusSec = 세션 길이, events = []로 제출한다 — Vision 도입 시
 * 이 값들만 실제 측정값으로 교체한다(제출 경로는 submitStudySession 그대로).
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const parsedUserId = Number(searchParams.get("userId"));
  const userId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;

  const startedAtMsRef = useRef(Date.now());
  // 최초 종료 클릭 시점에 고정 — 재시도해도 같은 세션으로 멱등 제출되게 한다.
  const endedAtMsRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "studying" });

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

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-medium">스터디룸 #{id}</h1>

      {phase.name === "studying" && (
        <>
          <p className="font-mono text-4xl font-semibold">{formatElapsed(elapsedSec)}</p>
          {userId === null && (
            <p className="text-muted-foreground text-xs">
              userId가 없어 이 세션은 서버에 저장되지 않습니다 (주소에 ?userId=N 필요)
            </p>
          )}
          <button
            type="button"
            onClick={() => void endAndSubmit()}
            className="rounded-full bg-black px-6 py-3 text-white"
          >
            공부 종료
          </button>
        </>
      )}

      {phase.name === "submitting" && <p className="text-sm">저장 중...</p>}

      {phase.name === "done" &&
        phase.sessions.map((session) => (
          <div key={session.id} className="border-border w-full max-w-md rounded-2xl border p-4">
            <p className="text-muted-foreground text-sm">귀속 날짜</p>
            <p className="text-xl font-semibold">{session.statDate}</p>
            <p className="text-muted-foreground mt-2 text-sm">총 공부 시간</p>
            <p className="text-xl font-semibold">{formatElapsed(session.studySec)}</p>
            <p className="text-muted-foreground mt-2 text-sm">순공 시간</p>
            <p className="text-xl font-semibold">{formatElapsed(session.focusSec)}</p>
            <p className="text-muted-foreground mt-2 text-sm">집중률</p>
            <p className="text-xl font-semibold">{session.focusRate}%</p>
          </div>
        ))}

      {phase.name === "error" && (
        <>
          <p className="text-sm text-red-600">{phase.message}</p>
          <button
            type="button"
            onClick={() => void endAndSubmit()}
            className="rounded-full bg-black px-6 py-3 text-white"
          >
            다시 제출
          </button>
        </>
      )}

      {phase.name === "unsaved" && (
        <p className="text-sm">
          공부 시간 {formatElapsed(phase.studySec)} — userId가 없어 서버에 저장되지 않았습니다.
        </p>
      )}
    </main>
  );
}
