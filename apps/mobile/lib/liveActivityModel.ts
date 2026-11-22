import type { LiveActivitySnapshot } from "@focusmakers/types";

import { t } from "./i18n";

// 웹 `AWAY_LIMIT_MS`(apps/web/src/features/study-session/sessionTuning.ts)와 같은 값이어야 한다.
export const TIMER_AWAY_LIMIT_MS = 2 * 60 * 60 * 1000;
// 웹 싱글룸 `DEFAULT_SESSION_TUNING.autoEndPauseMinutes`와 같은 값이어야 한다.
export const PAUSE_AUTO_END_MS = 20 * 60 * 1000;

export type StudySessionActivityProps = {
  subject: string | null;
  // 일시정지 표시와 문구를 쓸지다. 딴짓 상태는 시간이 멈춰도 일시정지가 아니라서 시계 멈춤과 따로 둔다.
  paused: boolean;
  startedAtMs: number;
  // 시계가 멈춘 시각이다. null이면 OS가 계속 센다.
  pausedAtMs: number | null;
  statusText: string;
  endedTitle: string;
  endedBody: string;
  iconUri: string | null;
};

export type LiveActivityTexts = {
  timerRunning: string;
  cameraRunning: string;
  paused: string;
  endedTitle: string;
  endedPause: string;
  endedAway: string;
};

/**
 * 지금 기기 언어의 잠금화면 문구
 *
 * 위젯 레이아웃은 바깥 값을 참조할 수 없어 문구를 props로 넘긴다.
 */
export function buildLiveActivityTexts(): LiveActivityTexts {
  return {
    timerRunning: t("liveActivity.timerRunning"),
    cameraRunning: t("liveActivity.cameraRunning"),
    paused: t("liveActivity.paused"),
    endedTitle: t("liveActivity.endedTitle"),
    endedPause: t("liveActivity.endedPause"),
    endedAway: t("liveActivity.endedAway"),
  };
}

type DeriveInput = {
  snapshot: LiveActivitySnapshot;
  atMs: number;
  backgroundSinceMs: number | null;
  texts: LiveActivityTexts;
  iconUri: string | null;
};

/**
 * 스냅샷과 앱 위치로 정하는 잠금화면 모양과 끝나는 시각
 *
 * 앱 밖에서는 웹이 멈춰 있으므로 관리 모드 정지와 끝나는 시각을 여기서 정한다.
 * 직접 누른 일시정지는 웹이 일시정지 시작부터 20분을 세므로 스냅샷 시각을 기준으로 둔다.
 * 휴식은 앱을 나가는 순간 웹이 일시정지로 바꾸므로 나간 시각을 기준으로 둔다.
 * 딴짓은 화면 숫자가 멈춰 있으므로 스냅샷 시각 값에서 시계를 멈추고, 앱 밖에서는 휴식처럼 일시정지로 그린다.
 */
export function deriveActivity({
  snapshot,
  atMs,
  backgroundSinceMs,
  texts,
  iconUri,
}: DeriveInput): {
  props: StudySessionActivityProps;
  staleDate: Date | undefined;
} {
  const startedAtMs = atMs - snapshot.elapsedSec * 1000;
  const away = backgroundSinceMs !== null;
  const running = snapshot.state === "running";
  const stoppedByLeaving = away && running && snapshot.mode === "camera";
  const keepsRunningAway = away && running && !stoppedByLeaving;
  const paused = running ? stoppedByLeaving : snapshot.state !== "distracted" || away;

  let pausedAtMs: number | null = null;
  if (stoppedByLeaving) {
    pausedAtMs = backgroundSinceMs;
  } else if (!running) {
    pausedAtMs = atMs;
  }

  let staleDate: Date | undefined;
  if (backgroundSinceMs !== null) {
    if (keepsRunningAway) {
      staleDate = new Date(backgroundSinceMs + TIMER_AWAY_LIMIT_MS);
    } else if (snapshot.state === "paused") {
      staleDate = new Date(atMs + PAUSE_AUTO_END_MS);
    } else {
      staleDate = new Date(backgroundSinceMs + PAUSE_AUTO_END_MS);
    }
  }

  let statusText = texts.paused;
  if (!paused) {
    statusText = snapshot.mode === "timer" ? texts.timerRunning : texts.cameraRunning;
  }

  return {
    props: {
      subject: snapshot.subject,
      paused,
      startedAtMs,
      pausedAtMs,
      statusText,
      endedTitle: texts.endedTitle,
      endedBody: keepsRunningAway ? texts.endedAway : texts.endedPause,
      iconUri,
    },
    staleDate,
  };
}
