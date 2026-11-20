import type { RestoredSession } from "./restoreActiveSession";
import { AWAY_LIMIT_MS } from "./sessionTuning";

/**
 * 마지막 보고 때 일시정지 중이었는지
 *
 * 일시정지 중에 보고하면 서버가 준 마지막 이벤트가 보고 시각에 끝나는 PAUSE다.
 * 세션 훅의 복원과 이어 공부 판단이 같은 규칙을 써야 묻는 기록과 이어받는 모양이 어긋나지 않는다.
 */
export function wasPausedAtReport(restored: RestoredSession): boolean {
  const last = restored.events[restored.events.length - 1];
  return (
    last !== undefined &&
    last.status === "PAUSE" &&
    Date.parse(last.endedAt) === restored.reportedAtMs
  );
}

/**
 * 복원한 기록을 이어서 공부할지 묻는 판단
 *
 * ask는 자율 모드이고 일시정지 중이 아니었고 마지막 보고 뒤 2시간이 지나지 않은 기록이다.
 * expired는 같은 조건에서 2시간이 넘어 서버 확정이 늦은 기록이다.
 * 그 밖의 기록은 묻지 않고 지금처럼 일시정지로 이어받는다.
 */
export function resumeDecision(restored: RestoredSession, nowMs: number): "ask" | "expired" | null {
  if (restored.source !== "TIMER" || wasPausedAtReport(restored)) {
    return null;
  }
  return nowMs - restored.reportedAtMs <= AWAY_LIMIT_MS ? "ask" : "expired";
}

/**
 * 확인 창에 보일 앱 밖에 있던 분
 *
 * 몇 초만 나갔어도 0분으로 보이지 않게 최소 1분이다.
 */
export function awayMinutes(fromMs: number, nowMs: number): number {
  return Math.max(1, Math.floor((nowMs - fromMs) / 60_000));
}

const RESUME_MARKER_KEY = "focuson.recovery.resumeChosen";
const RESUME_MARKER_TTL_MS = 60_000;

/**
 * 홈에서 이어서 공부하기를 고른 표시
 *
 * 앱은 홈과 방을 서로 다른 웹뷰 문서로 열어서 같은 출처가 함께 쓰는 localStorage로 넘긴다.
 * 방이 다른 기록을 이어받지 않게 그 기록의 시작 시각을 함께 적는다.
 */
export function writeResumeMarker(startedAtMs: number, nowMs: number = Date.now()): void {
  try {
    localStorage.setItem(RESUME_MARKER_KEY, JSON.stringify({ startedAtMs, atMs: nowMs }));
  } catch (error) {
    console.warn("[recovery] could not save the resume choice", error);
  }
}

/**
 * 홈에서 고른 표시 읽기와 비우기
 *
 * 같은 기록을 1분 안에 골랐을 때만 참이다.
 * 낡은 표시가 다음 복원에서 묻는 단계를 건너뛰게 하지 않으려고 읽은 표시는 늘 비운다.
 * 읽지 못하면 거짓이라 방이 한 번 더 묻는다.
 */
export function consumeResumeMarker(startedAtMs: number, nowMs: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(RESUME_MARKER_KEY);
    if (raw === null) {
      return false;
    }
    localStorage.removeItem(RESUME_MARKER_KEY);
    const marker = JSON.parse(raw) as { startedAtMs?: unknown; atMs?: unknown };
    if (marker.startedAtMs !== startedAtMs || typeof marker.atMs !== "number") {
      return false;
    }
    const ageMs = nowMs - marker.atMs;
    return ageMs >= 0 && ageMs <= RESUME_MARKER_TTL_MS;
  } catch (error) {
    console.warn("[recovery] could not read the resume choice", error);
    return false;
  }
}
