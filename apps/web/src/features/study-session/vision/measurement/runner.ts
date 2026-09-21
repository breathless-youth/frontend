import type { MeasurementStats } from "./measurement";

/**
 * 발열 회차 — 시계를 주입받고 DOM은 모른다.
 *
 * **합격 판정을 하지 않는다.** 시나리오를 시간으로 돌리던 진행기도 걷어냈다 — 구간은 측정하는
 * 사람이 패널 버튼으로 연다(`panel.ts`). 이 모듈에 남은 것은 발열 회차의 시계와 열 단계 기록뿐이다.
 */

/**
 * 발열 회차 — **상한이 없다.**
 *
 * 기준이 "16분 동안 어땠나"에서 "**Serious까지 몇 분 걸렸나**"로 바뀌었다. 그래서 시간이 아니라
 * 열 단계가 회차를 끝낸다.
 *
 * ⚠️ 단계는 사람이 누른다. Safari/WebKit에는 기기 온도나 thermal state를 읽는 API가 없어
 * 자동화할 방법이 자체가 없다. 측정하는 사람이 Instruments에서 단계가 바뀌는 것을 보고 누르고,
 * 그 시각이 경과 몇 분 몇 초인지로 기록된다. 그래서 되돌리는 수단이 반드시 있어야 한다 —
 * 잘못 누른 한 번이 그 회차의 기준값을 통째로 바꾼다.
 */
export type ThermalStage = "fair" | "serious" | "critical";

export interface ThermalMark {
  readonly stage: ThermalStage;
  /** 회차 시작 이후 경과 초. */
  readonly atSec: number;
}

export interface ThermalTimerState {
  /** 몇 번째 회차인가. 다시 시작하면 늘어난다 — 앞 회차를 덮지 않기 위해서다. */
  readonly round: number;
  readonly running: boolean;
  readonly elapsedSec: number;
  readonly minute: number;
  readonly marks: readonly ThermalMark[];
  /** 중단으로 끝났다. Serious 미도달이라는 뜻이다. */
  readonly aborted: boolean;
  /** 이번 회차의 기준값. 도달하지 못했으면 null. */
  readonly seriousAtSec: number | null;
}

export interface ThermalTimerOptions {
  readonly now: () => number;
  /** 1분이 지날 때마다. Instruments 기록 시점을 놓치지 않게 하는 것이 전부다. */
  readonly onMinute?: (minute: number) => void;
  /** 단계·중단·시작으로 요약이 바뀌었다. 덩어리에 싣는 쪽이 받는다. */
  readonly onChange?: (state: ThermalTimerState) => void;
}

export interface ThermalTimer {
  state(): ThermalTimerState;
  start(): void;
  /** 측정하는 사람이 Instruments에서 그 단계를 보고 누른다. */
  mark(stage: ThermalStage): void;
  /** 마지막으로 누른 단계를 무른다. */
  undo(): void;
  /** 상한이 아니라 빠져나가는 문이다. 그때까지 잰 값과 미도달 사실이 남는다. */
  abort(): void;
  tick(): void;
}

export function createThermalTimer(options: ThermalTimerOptions): ThermalTimer {
  const { now, onMinute, onChange } = options;

  let round = 0;
  let running = false;
  let started = false;
  let startedMs = 0;
  let minute = 0;
  let marks: ThermalMark[] = [];
  let aborted = false;
  /** 회차의 기준값이 확정된 시점의 경과. 확정 뒤에도 시계를 따라 자라면 기록이 달라진다. */
  let frozenSec = 0;

  /** 회차가 끝난 뒤에도 벽시계는 흐른다. Critical은 그 시각으로 기록한다. */
  function liveSec(): number {
    return started ? Math.floor((now() - startedMs) / 1000) : 0;
  }

  function elapsedSec(): number {
    if (!started) {
      return 0;
    }
    return running ? liveSec() : frozenSec;
  }

  function seriousAtSec(): number | null {
    return marks.find((mark) => mark.stage === "serious")?.atSec ?? null;
  }

  function snapshot(): ThermalTimerState {
    return {
      round,
      running,
      elapsedSec: elapsedSec(),
      minute,
      marks,
      aborted,
      seriousAtSec: seriousAtSec(),
    };
  }

  function changed(): void {
    onChange?.(snapshot());
  }

  return {
    state: snapshot,

    start() {
      round += 1;
      running = true;
      started = true;
      startedMs = now();
      frozenSec = 0;
      minute = 0;
      marks = [];
      aborted = false;
      changed();
    },

    mark(stage) {
      if (!started || aborted) {
        return;
      }
      if (!running && stage !== "critical") {
        // 회차가 끝난 뒤에는 Critical만 더 받는다. 열이 오르는 곡선은 Serious 뒤에도 이어진다.
        return;
      }
      marks = [...marks, { stage, atSec: liveSec() }];
      if (stage === "serious") {
        // Serious 도달이 이번 회차의 기준값이다. 분당 알림은 여기서 멈춘다.
        frozenSec = liveSec();
        running = false;
      }
      changed();
    },

    undo() {
      if (marks.length === 0) {
        return;
      }
      marks = marks.slice(0, -1);
      // Serious를 무르면 회차가 다시 돈다. 잘못 누른 것을 되돌리는 것이 이 버튼의 존재 이유다.
      running = started && !aborted && seriousAtSec() === null;
      changed();
    },

    abort() {
      if (seriousAtSec() !== null) {
        // 이미 기준값을 얻은 회차다. 여기에 미도달 표시가 붙으면 한 줄 안에서 도달 시각과
        // 미도달이 서로를 부정하고, 런북의 "미도달이면 버린다"가 멀쩡한 회차를 버리게 만든다.
        return;
      }
      frozenSec = elapsedSec();
      running = false;
      aborted = true;
      changed();
    },

    tick() {
      if (!running) {
        return;
      }
      const passed = Math.floor(liveSec() / 60);
      while (minute < passed) {
        minute += 1;
        onMinute?.(minute);
      }
    },
  };
}

export function clockText(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 발열 회차 한 줄. 패널과 콘솔이 같은 문장을 쓴다 — 콘솔 쪽은 1분마다 남아서 Instruments에
 * 적어 넣을 시점을 알린다.
 *
 * 상위값에 `~`를 붙이는 것은 **분당 요약 줄의 p95와 다른 값**이기 때문이다. 이쪽은 세션 전체를
 * 버킷으로 근사한 값이고, 분당 줄은 지난 1분의 정확한 값이다. 같은 이름으로 부르면 두 숫자가
 * 어긋날 때 어느 쪽이 틀렸는지를 찾게 된다.
 */
export function thermalStatusLine(state: ThermalTimerState, stats: MeasurementStats): string {
  const marks =
    state.marks.length === 0
      ? ""
      : ` · ${state.marks.map((mark) => `${mark.stage} ${clockText(mark.atSec)}`).join(" ")}`;
  const ended = state.aborted ? " · 중단(Serious 미도달)" : "";
  const over = stats.overLimit === 0 ? "" : ` · 2초 초과 ${stats.overLimit}회`;
  return `발열 ${state.round}회차 ${state.minute}분 · 경과 ${clockText(state.elapsedSec)} · drop=${stats.dropped} · 누적p95~ ${stats.objectP95 ?? "-"}/${stats.faceP95 ?? "-"}ms${over}${marks}${ended}`;
}

export interface ReportingThermalOptions {
  readonly now: () => number;
  /** 지금까지의 진행 통계. 분당 줄에 실린다. */
  readonly stats: () => MeasurementStats;
  readonly log: (line: string) => void;
  readonly onSummary?: (state: ThermalTimerState) => void;
}

/**
 * 타이머에 콘솔 알림과 요약 전달을 붙인다.
 *
 * 배선을 이 함수 안에 모으는 이유는, 배선이 빠져도 아무도 모르던 일이 실제로 있었기 때문이다.
 * 여기 있으면 테스트가 붙잡는다.
 */
export function createReportingThermalTimer(options: ReportingThermalOptions): ThermalTimer {
  const { now, stats, log, onSummary } = options;

  const timer = createThermalTimer({
    now,
    onMinute: () => {
      log(thermalStatusLine(timer.state(), stats()));
    },
    onChange: (state) => {
      onSummary?.(state);
    },
  });
  return timer;
}
