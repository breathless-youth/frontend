import type { LiveSnapshot, Measurement } from "./measurement";
import type { ThermalTimer } from "./runner";
import { clockText, thermalStatusLine } from "./runner";

/**
 * 측정 진행 패널 — **평범한 DOM이다. React 컴포넌트가 아니다.**
 *
 * 세션 화면의 컴포넌트 트리에 손을 대지 않으려고 이렇게 만들었다. 트리에 끼워 넣으면 지울 때
 * 화면 코드 여러 곳을 되돌려야 하는데, 이 도구는 측정이 끝나면 통째로 사라진다.
 *
 * 타이머로 시나리오를 돌리던 방식은 걷어냈다. 측정하는 사람이 **행동 버튼을 누르고 그 행동을
 * 한다** — 버튼이 구간 이름이 되고, 패널은 그 사이 눈이 어떻게 읽히는지를 매초 보여준다.
 * 잘 안 되는 것은 사람이 화면을 보고 말로 전한다. 패널은 판단하지 않는다.
 *
 * 화면에 대해 지키는 것 셋.
 * - 컨테이너는 터치를 통과시키고 **버튼만** 받는다. 프리뷰와 세션 조작을 막지 않는다.
 * - 컨테이너에 **명시 역할(`role`)을 주지 않는다.** 세션 화면의 접근성 트리에 상태 알림이
 *   끼어들면 스크린리더 사용자에게 없는 상태를 알리게 되고, 기존 테스트의 역할 질의도 흔들린다
 *   (`components/DevVisionFailureNotice.tsx`와 같은 판단). 버튼은 조작 대상이라 암묵 역할과
 *   탭 순서를 갖는다 — 눌러야 하는 것이므로 그게 맞다.
 * - 프리뷰 중앙과 하단 조작부를 피해 왼쪽 위에 붙고, 개발용 배너·복구 다이얼로그(`z-50`)보다
 *   **아래에** 쌓인다. 측정 도구가 실패 안내나 복구 선택을 덮으면 안 된다.
 */

export interface MeasurementPanelOptions {
  readonly measurement: Measurement;
  readonly thermal: ThermalTimer;
  /** 진단이 꺼져 있으면 아예 붙지 않는다. */
  readonly enabled?: boolean;
  /** 클립보드 접근점. 웹뷰에서 권한이 다를 수 있어 주입으로 열어 둔다. */
  readonly copy?: (text: string) => Promise<void>;
}

/**
 * 구간 버튼. 이름이 그대로 덩어리의 구간 이름이 된다.
 *
 * 순서는 측정 절차의 순서다 — 눈 감기와 뜨기가 짝이고, 그다음이 오탐 쪽 확인이다. 버튼 이름을
 * 여기서만 정하므로 런북은 이 목록을 옮겨 적지 않는다.
 */
export const SEGMENT_BUTTONS: readonly string[] = [
  "눈 감기",
  "눈 뜨기",
  "깜빡임",
  "내려다봄",
  "숙이고 감기",
  "꾸벅꾸벅",
  "몸만 배치",
  "휴대폰",
  "안경",
  "고개 젖힘",
  "기타",
];

/** 화면을 다시 그리는 주기. 눈 표본이 2초에 하나라 1초면 충분하다. */
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

function score(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function yesNo(value: boolean | null): string {
  return value === null ? "-" : value ? "○" : "×";
}

/**
 * 눈이 지금 어떻게 읽히는지 세 줄. 값은 전부 판정이 실제로 쓰는 것과 같은 자리의 값이다.
 *
 * 1줄: 상태와 구간. 2줄: 눈 점수가 임계를 넘는지. 3줄: 비율 규칙과 원신호, 얼굴·사람.
 * 4줄: 보정. 세션 시작 30초쯤 `보정중`이 기준값으로 바뀌는 것이 여기서 보인다. 그 전에는
 * 눈 판정을 쉬므로 이 줄이 바뀐 뒤에 첫 감김을 시작해야 한다.
 */
function deg(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)}°`;
}

/** 건너뛴 이유를 사람이 읽는 말로. 게이트 이름은 코드가 유일한 출처다(`sleepRules.ts`). */
function skipLabel(reason: string | null): string {
  switch (reason) {
    case "looking-down":
      return "(내려다봄)";
    case "eyes-active":
      return "(눈 움직임)";
    case "face-too-small":
      return "(멀다)";
    case "blendshapes-missing":
      return "(점수없음)";
    default:
      return "";
  }
}

export function liveLines(live: LiveSnapshot): string {
  const segment =
    live.segment === null
      ? "구간 없음 — 버튼을 누르세요"
      : `구간 ${live.segment} ${live.segmentSec}초`;
  const closed = live.closed === null ? "판정 없음" : live.closed ? "감김" : "뜸";
  const age = live.eyeAgeSec === null ? "표본 없음" : `표본 ${live.eyeAgeSec}초 전`;
  const ratio = live.ratio === null ? "비율 창 안 참" : `비율 ${live.ratio.toFixed(2)}`;
  const calibration =
    live.calibration === null
      ? "보정중 (판정 쉼)"
      : `보정 기준 ${score(live.calibration.baseline)} → 임계 ${score(live.calibration.threshold)} · 창 ${live.calibration.windows}회`;
  return [
    `상태 ${live.state} ${live.stateSec}초 · ${segment}`,
    `눈 L${score(live.eyeLeft)} R${score(live.eyeRight)} → ${score(live.eyeMin)} · 다듬 ${score(live.eyeSmoothed)} · 임계 ${score(live.threshold)} → ${closed}`,
    `고개 ${deg(live.headPitchDeg)} · 깜빡임 ${live.blinkActive ? `${live.blinkEvents30s}회/30초` : "계측 안 함"}`,
    `${ratio} · 원신호 눈${yesNo(live.sleepEyes)} 꾸벅${yesNo(live.sleepDrowsy)} · 얼굴${yesNo(live.facePresent)}${skipLabel(live.faceSkip)} 사람 ${score(live.person)} · ${age}`,
    calibration,
  ].join("\n");
}

export function mountMeasurementPanel(options: MeasurementPanelOptions): MeasurementPanel {
  const { measurement, thermal, enabled = true, copy = defaultCopy } = options;

  const doc = globalThis.document;
  if (!enabled || doc === undefined) {
    return NOT_MOUNTED;
  }

  let copyNotice = "";

  const root = doc.createElement("div");
  root.setAttribute("data-measure-panel", "");
  // 눈 점수와 보정값은 얼굴에서 나온 측정치다. 카메라 프리뷰와 같은 표식을 붙여 Sentry·Amplitude
  // 세션 리플레이가 이 글자를 녹화하지 못하게 한다. 전역 설정은 영상만 막는다.
  root.className = "amp-block sentry-block";
  root.style.cssText = [
    "position:fixed",
    "left:8px",
    "top:calc(env(safe-area-inset-top) + 8px)",
    "z-index:40",
    "max-width:320px",
    "padding:8px 10px",
    "border-radius:8px",
    "background:rgba(17,17,17,0.86)",
    "color:#fff",
    "font:12px/17px ui-monospace,monospace",
    // 자기 버튼 밖의 터치는 그대로 통과시킨다. 프리뷰와 세션 조작을 가리지 않는다.
    "pointer-events:none",
    "white-space:pre-wrap",
  ].join(";");

  const body = doc.createElement("div");
  const segmentControls = doc.createElement("div");
  segmentControls.style.cssText = "display:flex;gap:4px;margin-top:6px;flex-wrap:wrap";
  const controls = doc.createElement("div");
  controls.style.cssText = "display:flex;gap:4px;margin-top:4px;flex-wrap:wrap";

  const BUTTON_BACKGROUND = "#333";
  const ACTIVE_BACKGROUND = "#2a6b3f";

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
      `background:${BUTTON_BACKGROUND}`,
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
    // 보정 전후로 눈 감김 임계가 달라진다. 같은 자세인데 판정이 바뀐 이유가 여기서 보여야 한다.
    const calibration = preflight.calibrated
      ? ` 보정ok(${preflight.calibrationWindows})`
      : " 보정중";
    return `점검 진단ok 객체${mark(preflight.detector)} 얼굴${mark(preflight.face)} 카메라${camera}${calibration}`;
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

  /**
   * 구간 버튼은 한 번만 만든다. 매초 노드를 갈아 끼우면 누르는 순간 대상이 사라져 클릭이
   * 삼켜질 수 있다. 지금 열린 구간의 버튼만 색을 바꿔 어느 행동 중인지 보여준다.
   */
  const segmentButtons = SEGMENT_BUTTONS.map((label) =>
    makeButton(`segment:${label}`, label, () => {
      measurement.mark(label);
      render();
    }),
  );
  segmentControls.append(...segmentButtons);

  function updateSegmentButtons(current: string | null): void {
    for (const button of segmentButtons) {
      const active = current !== null && button.textContent === current;
      button.style.background = active ? ACTIVE_BACKGROUND : BUTTON_BACKGROUND;
      if (active) {
        button.setAttribute("aria-pressed", "true");
      } else {
        button.removeAttribute("aria-pressed");
      }
    }
  }

  /**
   * 조각의 뜻에 따라 색을 고른다. 감김·졸음은 빨강, 뜸·집중은 초록, 켜진 원신호는 주황,
   * 보정 전은 노랑. 글자는 그대로 두고 색만 입히므로 텍스트로 읽는 테스트와 사람이 같은 것을 본다.
   */
  function chipColor(text: string): string | null {
    if (/감김|SLEEP/.test(text)) {
      return "#ff6b6b";
    }
    if (/→ 뜸|FOCUS/.test(text)) {
      return "#3ddc84";
    }
    if (/○/.test(text)) {
      return "#ffb020";
    }
    if (/보정중/.test(text)) {
      return "#ffd866";
    }
    return null;
  }

  function appendLine(text: string, dim: boolean): void {
    const line = doc.createElement("div");
    const chips = text.split(" · ");
    chips.forEach((chip, index) => {
      if (index > 0) {
        line.append(" · ");
      }
      const span = doc.createElement("span");
      span.textContent = chip;
      const color = dim ? null : chipColor(chip);
      if (color !== null) {
        span.style.color = color;
        span.style.fontWeight = "700";
      }
      line.append(span);
    });
    if (dim) {
      line.style.opacity = "0.75";
    }
    body.append(line);
  }

  function render(): void {
    const live = measurement.live();
    body.replaceChildren();
    appendLine(preflightLine(), true);
    body.append(doc.createElement("br"));
    for (const line of liveLines(live).split("\n")) {
      appendLine(line, false);
    }
    appendLine(observationLine().trim(), true);
    const thermal = thermalLines().trim();
    if (thermal !== "") {
      appendLine(thermal, false);
    }
    if (copyNotice !== "") {
      appendLine(copyNotice, false);
    }
    updateSegmentButtons(live.segment);
    updateStageControls();
  }

  controls.append(
    makeButton("copy", "복사", () => {
      void copy(measurement.dump()).then(
        () => {
          copyNotice = "덩어리를 복사했습니다";
          render();
        },
        () => {
          // 알리지 않고 실패하면 한참 돌고도 자료가 없다. 웹뷰에서 권한이 다를 수 있어 대안을 띄운다.
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

  root.append(body, segmentControls, controls, stageControls);
  doc.body.append(root);
  render();

  const timer = setInterval(() => {
    thermal.tick();
    render();
  }, REPAINT_MS);

  return {
    refresh() {
      thermal.tick();
      render();
    },
    destroy() {
      clearInterval(timer);
      root.remove();
    },
  };
}
