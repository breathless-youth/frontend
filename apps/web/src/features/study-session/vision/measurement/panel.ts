import type { Measurement } from "./measurement";
import type { ScenarioRunner, ThermalTimer } from "./runner";
import { clockText, thermalStatusLine } from "./runner";

/**
 * 측정 진행 패널 — **평범한 DOM이다. React 컴포넌트가 아니다.**
 *
 * 세션 화면의 컴포넌트 트리에 손을 대지 않으려고 이렇게 만들었다. 트리에 끼워 넣으면 지울 때
 * 화면 코드 여러 곳을 되돌려야 하는데, 이 도구는 측정이 끝나면 통째로 사라진다.
 *
 * 화면에 대해 지키는 것 셋.
 * - 컨테이너는 터치를 통과시키고 **버튼만** 받는다. 프리뷰와 세션 조작을 막지 않는다.
 * - 컨테이너에 **명시 역할(`role`)을 주지 않는다.** 세션 화면의 접근성 트리에 상태 알림이
 *   끼어들면 스크린리더 사용자에게 없는 상태를 알리게 되고, 기존 테스트의 역할 질의도 흔들린다
 *   (`components/DevVisionFailureNotice.tsx`와 같은 판단). 버튼 넷은 조작 대상이라 암묵 역할과
 *   탭 순서를 갖는다 — 눌러야 하는 것이므로 그게 맞다.
 * - 프리뷰 중앙과 하단 조작부를 피해 왼쪽 위에 붙고, 개발용 배너·복구 다이얼로그(`z-50`)보다
 *   **아래에** 쌓인다. 측정 도구가 실패 안내나 복구 선택을 덮으면 안 된다.
 */

export interface MeasurementPanelOptions {
  readonly measurement: Measurement;
  readonly runner: ScenarioRunner;
  readonly thermal: ThermalTimer;
  readonly rehearsal: boolean;
  /** 엎드림 판정이 켜져 있는가. 점검 줄이 꺼져 있을 때만 표시를 더한다. */
  readonly faceLostEnabled: boolean;
  /** 시나리오 한 바퀴에 걸리는 시간. 문서에 손으로 적지 않고 화면이 말한다. */
  readonly oneRoundSec?: number;
  /** 진단이 꺼져 있으면 아예 붙지 않는다. */
  readonly enabled?: boolean;
  /** 클립보드 접근점. 웹뷰에서 권한이 다를 수 있어 주입으로 열어 둔다. */
  readonly copy?: (text: string) => Promise<void>;
}

/** 화면을 다시 그리는 주기. 남은 시간이 1초 단위라 1초면 충분하다. */
const REPAINT_MS = 1000;

export interface MeasurementPanel {
  refresh(): void;
  destroy(): void;
}

const NOT_MOUNTED: MeasurementPanel = {
  refresh() {},
  destroy() {},
};

function defaultCopy(text: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) {
    return Promise.reject(new Error("clipboard unavailable"));
  }
  return clipboard.writeText(text);
}

export function mountMeasurementPanel(options: MeasurementPanelOptions): MeasurementPanel {
  const {
    measurement,
    runner,
    thermal,
    rehearsal,
    faceLostEnabled,
    oneRoundSec = 0,
    enabled = true,
    copy = defaultCopy,
  } = options;

  const doc = globalThis.document;
  if (!enabled || doc === undefined) {
    return NOT_MOUNTED;
  }

  let copyNotice = "";

  const root = doc.createElement("div");
  root.setAttribute("data-measure-panel", "");
  root.style.cssText = [
    "position:fixed",
    "left:8px",
    "top:calc(env(safe-area-inset-top) + 8px)",
    "z-index:40",
    "max-width:250px",
    "padding:8px 10px",
    "border-radius:8px",
    "background:rgba(17,17,17,0.82)",
    "color:#fff",
    "font:11px/15px ui-monospace,monospace",
    // 자기 버튼 밖의 터치는 그대로 통과시킨다. 프리뷰와 세션 조작을 가리지 않는다.
    "pointer-events:none",
    "white-space:pre-wrap",
  ].join(";");

  const body = doc.createElement("div");
  const controls = doc.createElement("div");
  controls.style.cssText = "display:flex;gap:4px;margin-top:6px;flex-wrap:wrap";

  function makeButton(action: string, label: string, onClick: () => void): HTMLButtonElement {
    const element = doc.createElement("button");
    element.type = "button";
    element.setAttribute("data-measure-action", action);
    element.textContent = label;
    element.style.cssText = [
      "pointer-events:auto",
      // 실기기에서 열다섯 번 넘게 누르는 도구다. 저장소 규칙대로 44픽셀을 지킨다.
      "min-width:44px",
      "min-height:44px",
      "padding:4px 6px",
      "border:0",
      "border-radius:5px",
      "background:#333",
      "color:#fff",
      "font:11px/14px ui-monospace,monospace",
    ].join(";");
    element.addEventListener("click", onClick);
    return element;
  }

  function preflightLine(): string {
    const preflight = measurement.preflight();
    const mark = (value: string): string => (value === "ready" ? "ok" : `⚠${value}`);
    const camera = preflight.camera ?? "⚠대기";
    // 엎드림은 기본 꺼짐이다. 16분을 돌고 나서야 "왜 SLEEP_FACE가 한 번도 안 잡혔지"로
    // 헤매지 않도록, 꺼져 있다는 사실을 점검 단계에서부터 보여준다.
    const faceLost = faceLostEnabled ? "" : " 엎드림꺼짐";
    // 보정 전후로 눈 감김 임계가 달라진다. 같은 자세인데 판정이 바뀐 이유가 여기서 보여야 한다.
    // 창 횟수를 붙이는 것은 보정이 한 번이 아니라 계속 돌기 때문이다 — 40초 준비 구간에서 실제로
    // 돌았는지를 측정하는 사람이 바로 본다.
    const calibration = preflight.calibrated
      ? ` 보정ok(${preflight.calibrationWindows})`
      : " 보정중";
    return `점검 진단ok 객체${mark(preflight.detector)} 얼굴${mark(preflight.face)} 카메라${camera}${calibration}${faceLost}`;
  }

  function scenarioLines(): string {
    const state = runner.state();
    if (state.finished) {
      return "시나리오 끝 — 덩어리를 복사하세요";
    }
    const phase = state.phase === "prepare" ? "준비" : state.phase === "observe" ? "관찰" : "완료";
    const remaining =
      state.phase === "done" ? "다음을 누르세요" : `${phase} ${state.remainingSec}초`;
    const round = oneRoundSec === 0 ? "" : ` · 한 바퀴 약 ${Math.round(oneRoundSec / 60)}분`;
    const started = state.idle ? "\n세션이 시작되면 진행이 열립니다" : `\n${remaining}`;
    return (
      [
        `${state.scenario.id} ${state.scenario.name} (${state.index + 1}/${state.total})${round}`,
        state.scenario.instruction,
        // 기대는 사람이 읽는 문장이다. 패널은 이것을 보여줄 뿐 맞았는지 판단하지 않는다.
        `기대: ${state.scenario.expected}`,
      ].join("\n") + started
    );
  }

  /** 판단하지 않는다. 이 구간에서 전이가 몇 번 있었는지만 보여 준다. */
  function observationLine(): string {
    return `\n이 구간 전이 ${measurement.stats().segmentTransitions}건`;
  }

  function thermalLines(): string {
    const state = thermal.state();
    if (state.elapsedSec === 0 && state.marks.length === 0 && !state.aborted) {
      return "";
    }
    const serious =
      state.seriousAtSec === null
        ? state.aborted
          ? " · Serious 미도달"
          : ""
        : ` · Serious ${clockText(state.seriousAtSec)}`;
    return `\n${thermalStatusLine(state, measurement.stats())}${serious}`;
  }

  function render(): void {
    const rehearsalLine = rehearsal ? "⚠ 리허설 — 이 수치는 본 측정이 아니다\n" : "";
    const notice = copyNotice === "" ? "" : `\n${copyNotice}`;
    body.textContent = `${rehearsalLine}${preflightLine()}\n\n${scenarioLines()}${observationLine()}${thermalLines()}${notice}`;
    updateStageControls();
  }

  controls.append(
    makeButton("next", "다음", () => {
      runner.next();
      render();
    }),
    makeButton("repeat", "다시", () => {
      runner.repeat();
      render();
    }),
    makeButton("copy", "복사", () => {
      void copy(measurement.dump()).then(
        () => {
          copyNotice = "덩어리를 복사했습니다";
          render();
        },
        () => {
          // 조용히 실패하면 16분을 돌고도 자료가 없다. 웹뷰에서 권한이 다를 수 있어 대안을 띄운다.
          copyNotice = "복사 권한이 막혔습니다 — 콘솔에서 window.__focusonMeasure.dump()";
          render();
        },
      );
    }),
  );

  /**
   * 열 단계는 사람이 누른다. Safari에는 thermal state를 읽는 API가 없어 자동화할 수 없다.
   *
   * ⚠️ **버튼을 다시 만들지 않는다.** 1초마다 노드를 갈아 끼우면 누르는 순간 대상이 사라져
   * 클릭이 삼켜질 수 있다. Serious는 누른 순간이 곧 측정값이라 그 한 번이 그대로 손실이다.
   * 그래서 한 번만 만들고 보이고 숨기는 것만 바꾼다.
   */
  const stageControls = doc.createElement("div");
  stageControls.style.cssText = "display:flex;gap:4px;margin-top:4px;flex-wrap:wrap";

  const stageButtons = {
    start: makeButton("thermal-start", "발열 시작", () => {
      thermal.start();
      render();
    }),
    fair: makeButton("thermal-fair", "Fair", () => {
      thermal.mark("fair");
      render();
    }),
    serious: makeButton("thermal-serious", "Serious", () => {
      thermal.mark("serious");
      render();
    }),
    critical: makeButton("thermal-critical", "Critical", () => {
      thermal.mark("critical");
      render();
    }),
    undo: makeButton("thermal-undo", "되돌리기", () => {
      thermal.undo();
      render();
    }),
    abort: makeButton("thermal-abort", "중단", () => {
      thermal.abort();
      render();
    }),
  };
  stageControls.append(...Object.values(stageButtons));

  function show(element: HTMLButtonElement, visible: boolean): void {
    element.style.display = visible ? "" : "none";
  }

  function updateStageControls(): void {
    const state = thermal.state();
    const ended = !state.running && state.seriousAtSec !== null && !state.aborted;
    show(stageButtons.start, !state.running);
    show(stageButtons.fair, state.running);
    show(stageButtons.serious, state.running);
    // Serious 뒤에도 Critical은 받는다. 열이 오르는 곡선이 거기서 끝나지 않는다.
    show(stageButtons.critical, state.running || ended);
    show(stageButtons.undo, state.running || ended);
    // 끝난 회차에는 중단이 없다. 기준값을 얻은 회차에 미도달 표시를 붙일 길을 아예 막는다.
    show(stageButtons.abort, state.running);
  }

  root.append(body, controls, stageControls);
  doc.body.append(root);
  render();

  const timer = setInterval(() => {
    runner.tick();
    thermal.tick();
    render();
  }, REPAINT_MS);

  return {
    refresh() {
      runner.tick();
      thermal.tick();
      render();
    },
    destroy() {
      clearInterval(timer);
      root.remove();
    },
  };
}
