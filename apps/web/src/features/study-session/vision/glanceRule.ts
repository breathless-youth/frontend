import {
  GLANCE_HEAD_MOVE_DEG,
  GLANCE_REST_MAX_BLINKS,
  GLANCE_REST_OPEN_TICKS,
} from "./visionConfig";

/**
 * 시선 이동과 눈 감김을 가르는 규칙 — **순수 상태기계**다(설계 "시선 이동 vs 감김").
 *
 * 카메라가 눈을 위에서 보는 자세에서는 뜬 눈이 감김으로 읽히고, 눈에서 나오는 어떤 신호로도
 * 그것을 가르지 못한다(2026-09-22 실측: 눈 점수·EAR·내려다봄 점수·화소 대비 전부). 대신 **고개**로
 * 가른다 — 아래를 보는 시선 이동에는 고개 각도 변화가 따라오고, 졸음으로 인한 감김에는 따라오지
 * 않는다(미국 특허 11144756의 관찰). 절대 각도는 보지 않는다. 카메라 위치에 따라 공부 자세가
 * 15°든 25°든, 그 사람의 **쉬는 자세**에서 고개를 멈춘 채 시작된 감김만 감김이다.
 *
 * ## 쉬는 자세(`rest`)
 *
 * "눈을 뜬 채 있던 각도"다. 최근 `GLANCE_REST_OPEN_TICKS`개(30초)의 관측이 뜸이면 그 각도의
 * **중앙값**을 쉬는 자세로 잡는다. 앉아서 눈을 뜨고 있는 사람은 이 조건이 바로 성립하고, 책을 읽는
 * 사람은 눈 점수가 임계 근처에서 흔들려 뜸이 30초 이어지지 않으므로 읽는 자세가 쉬는 자세로 잡히지
 * 않는다.
 *
 * "뜸"은 **깜빡임을 허용**한다 — 감김이 `GLANCE_REST_MAX_BLINKS`개 이하이고 연속되지 않으면 된다.
 * 2초에 한 번 뜨는 표본에 깜빡임이 걸릴 확률은 틱당 5~15%라 30초(15틱)면 한 번 이상 걸릴 확률이
 * 80%다. 전부 뜸을 요구하면 쉬는 자세가 거의 서지 않는다(일곱째 회차: 준비 구간 눈 점수 상위 5%가
 * 0.626이었고 `눈 감기`가 전부 거부됐다). 읽는 동안의 흔들림은 감김이 절반 이상이고 연속되므로 이
 * 허용에 걸리지 않는다.
 *
 * 흔들림 조건은 두지 않는다 — 정면을 보고 가만히 있어도 각도 추정은 ±7° 흔들려(여섯째 회차 `눈 뜨기`
 * -7.5~2°) 그 조건으로는 쉬는 자세가 서지 않았다. 중앙값이면 그 흔들림을 흡수한다.
 *
 * ## 잠금 — **아래 방향, 두 틱 연속**
 *
 * 감김이 쉬는 자세보다 `GLANCE_HEAD_MOVE_DEG` 이상 **아래**(양수 쪽)에서 시작되고 다음 틱에도 아래에
 * 머물면 **시선 이동**이고, 그 뒤로는 눈이 잠깐 뜸으로 읽혀도 풀리지 않는다 — 고개가 쉬는 자세 근처로
 * 돌아온 채 눈을 뜨거나, 그 자리에서 뜬 눈이 30초 이어져 새 쉬는 자세가 잡힐 때만 풀린다.
 *
 * 방향을 보는 이유: 오탐을 내는 건 아래를 보는 것뿐이고, 눈을 감으면 고개가 살짝 젖혀지거나 각도
 * 추정이 튀어 -8~-11°까지 내려가는 틱이 있어(2·5·6회차 `눈 감기` 하위 5%) 방향을 안 보면 진짜
 * 감김이 시선 이동으로 잠긴다(여섯째 회차: 감김 33개 중 26개). 두 틱을 보는 이유: 각도 추정은 한
 * 틱짜리 튐이 있다(일곱째 회차 `눈 감기` 상위 5% 18.9°). 시작 틱은 판정 없음으로 두고 다음 틱에서
 * 아직 아래면 잠근다 — 진짜 감김은 2초를 잃을 뿐이고, 시선 이동은 고개가 내려간 채라 어차피 잠긴다.
 *
 * 첫 구현(2026-09-22)은 뜸 하나로 잠금을 풀었고, 읽는 동안 흔들리는 점수의 뜸 하나가 들어오자 다음
 * 감김이 "고개 정지 · 새 시작"으로 통과해 졸음이 섰다.
 *
 * 시선 이동으로 분류된 관측은 "판정 없음"이지 "눈 뜸"이 아니다 — 졸음을 세우지도 풀지도 않는다.
 *
 * 놓치는 것(리더 결정, 오탐 0이 우선): 고개를 내리면서 시작된 감김 전부. 숙인 채 자는 것과 고개를
 * 떨구며 꾸벅거리는 것이 여기 들어간다.
 */

/** `candidate`: 시작 틱이 아래였다. 다음 틱에도 아래면 잠그고, 아니면 튐이었다. */
export type GlanceRun = "none" | "candidate" | "pending" | "closure";

export type GlanceReject = "glance" | "no-rest";

export interface GlanceSample {
  /** 두 눈 중 덜 감긴 쪽의 감김 점수. 눈 판정이 없으면 null. 임계는 나중에 대므로 점수 그대로 든다. */
  readonly closure: number | null;
  readonly pitch: number | null;
}

export interface GlanceState {
  /** 최근 관측. 쉬는 자세 판정에 필요한 만큼만 든다. 임계가 바뀌어도 이 점수를 새 임계로 다시 읽는다. */
  readonly history: readonly GlanceSample[];
  /** 쉬는 자세의 각도. 아직 못 잡았으면 null — 그동안은 감김을 받아들이지 않는다. */
  readonly rest: number | null;
  /** 시선 이동 잠금. 고개가 쉬는 자세로 돌아오거나 새 쉬는 자세가 잡힐 때까지 감김을 받아들이지 않는다. */
  readonly glanced: boolean;
  /** 지금 감김 구간의 분류. `pending`은 시작 틱에서 움직임이 없었고 다음 틱 확인을 기다리는 상태. */
  readonly run: GlanceRun;
  readonly onsetPitch: number | null;
}

export const INITIAL_GLANCE_STATE: GlanceState = {
  history: [],
  rest: null,
  glanced: false,
  run: "none",
  onsetPitch: null,
};

export interface GlanceStep {
  readonly state: GlanceState;
  /** 이 틱의 감김 판정을 규칙에 넘겨도 되는가. false면 관측을 "판정 없음"으로 바꾼다. */
  readonly accept: boolean;
  /** 거부 이유. 덩어리에서 "시선 이동"과 "쉬는 자세 없음"을 갈라 읽기 위해서다. */
  readonly reject: GlanceReject | null;
}

const HISTORY_LENGTH = GLANCE_REST_OPEN_TICKS + 1;

function isClosed(sample: GlanceSample, threshold: number): boolean | null {
  return sample.closure === null ? null : sample.closure >= threshold;
}

/** `pitch`가 `from`보다 시선 이동으로 볼 만큼 **아래**인가. 한쪽이라도 모르면 null — 모르는 것을 움직임으로 치지 않는다. */
function downFrom(from: number | null, pitch: number | null): boolean | null {
  if (from === null || pitch === null) {
    return null;
  }
  return pitch - from >= GLANCE_HEAD_MOVE_DEG;
}

/**
 * 최근 `GLANCE_REST_OPEN_TICKS`개가 뜸(깜빡임 허용)이면 그 각도의 중앙값. 판정 없는 관측이 섞여
 * 있으면 null — 그 사이 무엇을 했는지 모른다. 각도를 모르는 관측은 중앙값에서 뺀다.
 */
function restFromHistory(history: readonly GlanceSample[], threshold: number): number | null {
  if (history.length < GLANCE_REST_OPEN_TICKS) {
    return null;
  }
  const recent = history.slice(-GLANCE_REST_OPEN_TICKS);
  let blinks = 0;
  let previousClosed = false;
  for (const sample of recent) {
    const closed = isClosed(sample, threshold);
    if (closed === null) {
      return null;
    }
    if (closed) {
      blinks += 1;
      if (previousClosed || blinks > GLANCE_REST_MAX_BLINKS) {
        return null;
      }
    }
    previousClosed = closed;
  }
  const pitches = recent
    .flatMap((sample) =>
      sample.pitch === null || isClosed(sample, threshold) ? [] : [sample.pitch],
    )
    .sort((a, b) => a - b);
  if (pitches.length === 0) {
    return null;
  }
  return pitches[Math.floor((pitches.length - 1) / 2)] ?? null;
}

export function stepGlance(
  state: GlanceState,
  sample: GlanceSample,
  threshold: number | null,
): GlanceStep {
  const history = [...state.history, sample].slice(-HISTORY_LENGTH);
  const base: GlanceState = { ...state, history };

  if (threshold === null || sample.closure === null) {
    // 판정 없는 틱(보정 전·얼굴 없음·게이트). 기록만 남긴다. 감김 구간은 닫는다 — 공백 뒤의 감김은
    // 새 시작이다.
    return { state: { ...base, run: "none", onsetPitch: null }, accept: false, reject: null };
  }

  const closed = sample.closure >= threshold;
  const { pitch } = sample;

  if (state.run === "candidate") {
    // 시작 틱이 아래였다. 눈 상태와 무관하게 고개가 아직 아래면 잠그고, 아니면 한 틱 튐이었다.
    if (downFrom(state.rest, pitch) === true) {
      return {
        state: { ...base, glanced: true, run: "none", onsetPitch: null },
        accept: !closed,
        reject: closed ? "glance" : null,
      };
    }
  }

  if (!closed) {
    const fresh = restFromHistory(history, threshold);
    if (fresh !== null) {
      // 뜬 눈으로 30초 있었다. 여기가 쉬는 자세이고, 잠금이 있었다면 여기서 푼다.
      return {
        state: { ...base, rest: fresh, glanced: false, run: "none", onsetPitch: null },
        accept: true,
        reject: null,
      };
    }
    const back = state.glanced && downFrom(state.rest, pitch) === false;
    return {
      state: { ...base, glanced: back ? false : state.glanced, run: "none", onsetPitch: null },
      accept: true,
      reject: null,
    };
  }

  // 감김.
  if (pitch === null) {
    // 각도를 모르면 감김으로 둔다 — 규칙이 없던 때의 동작이고, 행렬은 프로덕션에서 켜져 있다.
    return { state: { ...base, run: "closure", onsetPitch: null }, accept: true, reject: null };
  }
  if (state.glanced) {
    return { state: { ...base, run: "none", onsetPitch: null }, accept: false, reject: "glance" };
  }

  const previous = state.history[state.history.length - 1];
  const previousClosed = previous === undefined ? null : isClosed(previous, threshold);

  if (previousClosed !== true || state.run === "candidate") {
    // 감김 시작(튐으로 끝난 candidate 다음 틱도 새 시작이다). 쉬는 자세는 저장된 것보다 방금
    // 관측에서 잡힌 것이 새롭다.
    const rest = restFromHistory(state.history, threshold) ?? state.rest;
    if (rest === null) {
      // 쉬는 자세를 모른다 — 세션 시작부터 감김이거나, 뜬 눈이 30초 이어진 적이 없다.
      return {
        state: { ...base, run: "none", onsetPitch: null },
        accept: false,
        reject: "no-rest",
      };
    }
    if (downFrom(rest, pitch) === true) {
      // 아래에서 시작했다. 다음 틱에도 아래면 잠근다. 이 틱은 판정 없음.
      return {
        state: { ...base, rest, run: "candidate", onsetPitch: pitch },
        accept: false,
        reject: "glance",
      };
    }
    return {
      state: { ...base, rest, run: "pending", onsetPitch: pitch },
      accept: true,
      reject: null,
    };
  }

  if (state.run === "pending") {
    // 시작 다음 틱. 시작 뒤에 고개가 내려간 것도 시선 이동이다(특허의 "전후 2초" 창).
    if (downFrom(state.onsetPitch, pitch) === true) {
      return {
        state: { ...base, glanced: true, run: "none", onsetPitch: null },
        accept: false,
        reject: "glance",
      };
    }
    return { state: { ...base, run: "closure" }, accept: true, reject: null };
  }

  const accept = state.run === "closure";
  return { state: base, accept, reject: accept ? null : "glance" };
}
