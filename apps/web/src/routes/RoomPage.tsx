import { useParams, useSearchParams } from "react-router-dom";

import {
  formatElapsed,
  parseUserId,
  useStudyRoomSession,
} from "@/features/study-session/useStudyRoomSession";

/**
 * 임시 검증용 룸 뷰(디자인 미적용) — 디자인 확정 시 이 파일만 새 화면으로 교체한다.
 * 세션 로직(타이머·제출·상태 전환)은 전부 useStudyRoomSession에 있으므로 여기엔 표시만 남긴다.
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));
  const { elapsedSec, phase, endAndSubmit } = useStudyRoomSession(userId);

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
