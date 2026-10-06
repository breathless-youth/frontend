import type { SessionRecoveryResponse } from "@focusmakers/types";

import type { PhotoTap } from "@/features/study-session/adapters/focusDetector";
import { SUB_MINUTE_SEC } from "@/features/study-session/formatDuration";
import type { EndedSession } from "@/features/study-session/useStudyRoomSession";
import { reportHandled } from "@/lib/sentry";

import { isCaptureDue, nextAnchorMs } from "./captureSchedule";
import type { PhotoSpec } from "./photoFrame";
import type { TimelapseSettings } from "./timelapseSettings";
import { loadTimelapseSettings } from "./timelapseSettings";
import type { TimelapseStore, TimelapseSummary } from "./timelapseStore";
import { getTimelapseStore } from "./timelapseStore";

/**
 * 싱글룸 세션 하나의 타임랩스 촬영
 *
 * 감지기에 촬영 창구를 주고, 세션 시작과 종료에 맞춰 보관소 기록을 열고 닫는다.
 * 감지기는 세션 시작 시각이 정해지기 전에 만들어지므로 창구는 먼저 주고 기록은 나중에 연다.
 * 기록이 열리기 전에는 찍을 차례가 오지 않는다.
 */
export interface TimelapseRecorder {
  readonly photoTap: PhotoTap;
  /**
   * 이어받은 세션이면 같은 기록에 이어 찍는다.
   * 같은 시각으로 여러 번 불러도 한 번만 연다.
   */
  begin(startedAtMs: number): void;
  /**
   * 세션당 한 번만 처리한다.
   * 그 뒤 들어온 사진은 버린다.
   */
  finish(ended: EndedSession): void;
  /** 테스트가 쌓인 저장 작업이 끝나기를 기다릴 때 쓴다. */
  idle(): Promise<void>;
}

export interface TimelapseRecorderDeps {
  readonly store?: TimelapseStore;
  readonly loadSettings?: () => Promise<TimelapseSettings>;
  readonly now?: () => number;
}

interface ActiveTimelapse {
  readonly startedAtMs: number;
  readonly spec: PhotoSpec;
  intervalMs: number;
  /** 다음 차례를 재는 기준 시각이라 실제 찍은 시각보다 앞설 수 있다. */
  lastShotAtMs: number | null;
}

/**
 * 보고용 오류
 *
 * 메시지만 옮겨 담아 사진 바이트나 좌표가 딸려 나가지 않게 한다.
 */
function plainError(error: unknown): Error {
  return new Error(error instanceof Error ? error.message : String(error));
}

/**
 * 끝난 세션의 타임랩스 정리
 *
 * 기기가 잰 순공 시간이 1분 이상이면 남기고 아니면 지운다.
 * 1분 미만 세션은 결과 화면이 없어 다시 볼 곳이 없다.
 * 제출에 실패한 세션은 기기 요약으로 먼저 목록에 오르고 다음 실행의 복구 응답이 더 짧은 순공을 줄 수 있어 촬영 중 기록만 지운다.
 */
export async function settleTimelapse(
  store: TimelapseStore,
  startedAtMs: number,
  summary: TimelapseSummary,
  nowMs: number,
): Promise<void> {
  if (summary.focusSec >= SUB_MINUTE_SEC) {
    await store.finalize(startedAtMs, summary);
  } else {
    await store.discard(startedAtMs);
  }
  await store.sweep(nowMs);
}

/**
 * 앱 실행 복구나 새 세션 시작이 서버에서 마감한 옛 세션의 타임랩스 정리
 *
 * 서버가 구간을 주지 않아 요약에 타임라인이 없다.
 * 세션 시작을 기기 저장소 사정으로 막지 않도록 던지지 않는다.
 */
export async function settleRecoveredTimelapse(
  recovered: SessionRecoveryResponse,
  store: TimelapseStore = getTimelapseStore(),
): Promise<void> {
  try {
    await settleTimelapse(
      store,
      Date.parse(recovered.startedAt),
      {
        endedAtMs: Date.parse(recovered.endedAt),
        studySec: recovered.studySec,
        focusSec: recovered.focusSec,
      },
      Date.now(),
    );
  } catch (error: unknown) {
    reportHandled(plainError(error), "timelapse-store");
  }
}

export function createTimelapseRecorder(deps: TimelapseRecorderDeps = {}): TimelapseRecorder {
  const {
    store = getTimelapseStore(),
    loadSettings = loadTimelapseSettings,
    now = Date.now,
  } = deps;

  let active: ActiveTimelapse | null = null;
  let finished = false;
  let queue: Promise<void> = Promise.resolve();
  const reported = new Set<string>();

  /**
   * 실패 보고
   *
   * 같은 종류의 실패는 사진마다 되풀이되므로 세션에 한 번만 보낸다.
   */
  function report(tag: string, error: unknown): void {
    if (reported.has(tag)) {
      console.warn(`[${tag}]`, error);
      return;
    }
    reported.add(tag);
    reportHandled(plainError(error), tag);
  }

  /**
   * 저장 작업 줄 세우기
   *
   * 기록을 열기 전에 사진이 들어가거나 정리가 마지막 사진보다 먼저 도는 일을 막는다.
   * 타임랩스가 세션 진행을 막으면 안 되므로 실패는 여기서 삼킨다.
   */
  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error: unknown) => {
      report("timelapse-store", error);
    });
  }

  return {
    photoTap: {
      due() {
        if (active === null || finished) {
          return null;
        }
        return isCaptureDue(now(), active.lastShotAtMs, active.intervalMs) ? active.spec : null;
      },
      save(photo) {
        const current = active;
        if (current === null || finished) {
          return;
        }
        const atMs = now();
        // 저장이 끝나기 전에 다음 틱이 와도 같은 차례를 두 번 찍지 않게 바로 올린다.
        current.lastShotAtMs = nextAnchorMs(atMs, current.lastShotAtMs, current.intervalMs);
        enqueue(async () => {
          const record = await store.addPhoto(current.startedAtMs, photo, atMs);
          if (record !== null) {
            current.intervalMs = record.intervalMs;
          }
        });
      },
      fail(error) {
        report("timelapse-photo", error);
      },
    },

    begin(startedAtMs) {
      enqueue(async () => {
        if (finished || active?.startedAtMs === startedAtMs) {
          return;
        }
        // 지난 기록 정리가 실패해도 이번 세션의 촬영은 열어야 한다.
        await store.sweep(now()).catch((error: unknown) => {
          report("timelapse-store", error);
        });
        const record = await store.begin(startedAtMs, await loadSettings());
        if (record === null || finished) {
          return;
        }
        active = {
          startedAtMs,
          spec: { aspect: record.settings.aspect, mask: record.settings.info.faceMask },
          intervalMs: record.intervalMs,
          lastShotAtMs: null,
        };
      });
    },

    finish(ended) {
      if (finished) {
        return;
      }
      finished = true;
      const summary: TimelapseSummary = {
        endedAtMs: ended.endedAtMs,
        studySec: ended.studySec,
        focusSec: ended.focusSec,
        events: ended.events,
      };
      enqueue(() => settleTimelapse(store, ended.startedAtMs, summary, now()));
    },

    idle: () => queue,
  };
}
