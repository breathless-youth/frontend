import { GLANCE_HEAD_MOVE_DEG } from "./visionConfig";

/**
 * 시선 이동과 눈 감김을 가르는 규칙 — **순수 상태기계**다(설계 §4 "시선 이동 vs 감김").
 *
 * 카메라가 눈을 위에서 보는 자세에서는 뜬 눈이 감김으로 읽히고, 눈에서 나오는 어떤 신호로도
 * 그것을 가르지 못한다(2026-09-22 실측: 눈 점수·EAR·내려다봄 점수·화소 대비 전부). 대신 **감김이
 * 시작되는 순간 고개가 움직였는가**로 가른다 — 아래를 보는 시선 이동에는 고개 각도 변화가 따라오고,
 * 졸음으로 인한 감김에는 따라오지 않는다(미국 특허 11144756의 관찰). 절대 각도는 보지 않는다.
 * 카메라 위치에 따라 공부 자세가 15°든 25°든, 거기서 고개를 멈춘 채 시작된 감김만 감김이다.
 *
 * 한 감김 구간은 시작 틱에서 한 번 분류되고, 다음 틱에서 한 번 더 확인된 뒤 눈이 다시 뜸으로
 * 읽힐 때까지 그 분류를 유지한다. 시선 이동으로 분류된 구간의 관측은 "판정 없음"이지 "눈 뜸"이
 * 아니다 — 졸음을 세우지도 풀지도 않는다.
 *
 * 놓치는 것(리더 결정, 오탐 0이 우선): 고개를 내리면서 시작된 감김 전부. 숙인 채 자는 것과
 * 고개를 떨구며 꾸벅거리는 것이 여기 들어간다.
 */

export type GlanceRun = "none" | "pending" | "closure" | "glance";

export interface GlanceState {
  /**
   * 지금 임계에서 뜬 눈을 본 적이 있는가. 없으면 감김을 받아들이지 않는다 — 세션 시작부터
   * 감김으로 읽히거나 보정으로 임계가 바뀌어 감김이 된 경우는 "시작 순간"이 없어 가를 수 없다.
   */
  readonly sawOpen: boolean;
  /** 직전 틱의 눈 상태. null은 판정이 없었다는 뜻이고, 그 뒤의 감김은 새 시작으로 본다. */
  readonly prevClosed: boolean | null;
  /** 마지막으로 안 고개 각도. 판정이 없던 틱에서도 남겨, 얼굴이 돌아왔을 때 그 사이 움직임을 잰다. */
  readonly prevPitch: number | null;
  /** 지금 감김 구간의 분류. `pending`은 시작 틱에서 움직임이 없었고 다음 틱 확인을 기다리는 상태. */
  readonly run: GlanceRun;
  /** 감김이 시작된 틱의 각도. `pending` 확인에 쓴다. */
  readonly onsetPitch: number | null;
}

export const INITIAL_GLANCE_STATE: GlanceState = {
  sawOpen: false,
  prevClosed: null,
  prevPitch: null,
  run: "none",
  onsetPitch: null,
};

export interface GlanceTick {
  /** 이 틱의 눈이 임계 이상인가. null이면 판정 없음(얼굴 없음·게이트·보정 전). */
  readonly closed: boolean | null;
  /** 이 틱의 고개 각도. 자세 행렬이 없으면 null. */
  readonly pitch: number | null;
}

export interface GlanceStep {
  readonly state: GlanceState;
  /** 이 틱의 감김 판정을 규칙에 넘겨도 되는가. false면 관측을 "판정 없음"으로 바꾼다. */
  readonly accept: boolean;
}

/** 두 각도 사이가 시선 이동으로 볼 만큼 큰가. 한쪽이라도 모르면 null — 모르는 것을 움직임으로 치지 않는다. */
function movedBetween(a: number | null, b: number | null): boolean | null {
  if (a === null || b === null) {
    return null;
  }
  return Math.abs(a - b) >= GLANCE_HEAD_MOVE_DEG;
}

export function stepGlance(state: GlanceState, tick: GlanceTick): GlanceStep {
  const { closed, pitch } = tick;

  if (closed === null) {
    // 판정 없는 틱. 눈 상태는 잊되 각도는 남긴다. 받아들일 판정이 없으므로 accept는 의미가 없다.
    return {
      state: { ...state, prevClosed: null, prevPitch: pitch ?? state.prevPitch },
      accept: false,
    };
  }

  if (!closed) {
    return {
      state: { sawOpen: true, prevClosed: false, prevPitch: pitch, run: "none", onsetPitch: null },
      accept: true,
    };
  }

  if (!state.sawOpen) {
    // 뜬 눈을 본 적 없는 감김 — 시작 순간이 없다.
    return { state: { ...state, prevClosed: true, prevPitch: pitch }, accept: false };
  }

  if (state.prevClosed !== true) {
    // 감김 시작. 직전에 안 각도와 비교한다. 각도를 모르면(자세 행렬 없음) 감김으로 둔다 —
    // 규칙이 없던 때의 동작이고, 행렬은 프로덕션에서 항상 켜져 있다.
    const moved = movedBetween(state.prevPitch, pitch);
    const run: GlanceRun = moved === true ? "glance" : "pending";
    return {
      state: { ...state, prevClosed: true, prevPitch: pitch, run, onsetPitch: pitch },
      accept: run !== "glance",
    };
  }

  if (state.run === "pending") {
    // 시작 다음 틱. 시작 뒤에 고개가 내려간 것도 시선 이동이다(특허의 "전후 2초" 창).
    const moved = movedBetween(state.onsetPitch, pitch);
    const run: GlanceRun = moved === true ? "glance" : "closure";
    return { state: { ...state, prevPitch: pitch, run }, accept: run !== "glance" };
  }

  return { state: { ...state, prevPitch: pitch }, accept: state.run === "closure" };
}

/**
 * 임계가 생기거나 바뀌었을 때, 그 임계로 마지막 표본을 다시 채점해 상태를 세운다.
 *
 * 보정 창이 도는 동안은 임계가 없어 `closed`가 null이고, 그대로 두면 보정 직후의 감김을 "뜬 눈을
 * 본 적 없는 감김"으로 영영 거부한다. 마지막 표본이 새 임계에서 뜸이었으면 뜬 눈을 본 것이고 다음
 * 감김은 정상 시작이다. 감김이었으면 시작 순간을 모르는 감김이라 뜸을 볼 때까지 거부한다 — 임계가
 * 내려가면서 읽고 있던 눈이 감김으로 바뀌는 경우가 여기 걸린다. 감김 구간은 어느 쪽이든 닫는다.
 */
export function reclassifyGlanceForThreshold(
  state: GlanceState,
  lastClosed: boolean,
  lastPitch: number | null,
): GlanceState {
  return {
    sawOpen: !lastClosed,
    prevClosed: lastClosed,
    prevPitch: lastPitch ?? state.prevPitch,
    run: "none",
    onsetPitch: null,
  };
}
