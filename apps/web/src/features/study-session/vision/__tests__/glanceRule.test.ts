import { describe, expect, it } from "vitest";

import type { GlanceSample, GlanceState } from "../glanceRule";
import { INITIAL_GLANCE_STATE, stepGlance } from "../glanceRule";
import { GLANCE_HEAD_MOVE_DEG, GLANCE_REST_OPEN_TICKS } from "../visionConfig";

const THRESHOLD = 0.45;
const OPEN = 0.2;
const CLOSED = 0.7;
const DOWN = GLANCE_HEAD_MOVE_DEG + 15;
const WOBBLE = GLANCE_HEAD_MOVE_DEG / 2;

function open(pitch: number | null = 0): GlanceSample {
  return { closure: OPEN, pitch };
}
function closed(pitch: number | null = 0): GlanceSample {
  return { closure: CLOSED, pitch };
}
/** 뜬 눈으로 30초 멈춰 있던 쉬는 자세. */
function resting(pitch = 0): GlanceSample[] {
  return Array.from({ length: GLANCE_REST_OPEN_TICKS }, () => open(pitch));
}

function run(
  samples: readonly GlanceSample[],
  threshold: number | null = THRESHOLD,
): { accepts: boolean[]; state: GlanceState } {
  let state = INITIAL_GLANCE_STATE;
  const accepts: boolean[] = [];
  for (const sample of samples) {
    const step = stepGlance(state, sample, threshold);
    state = step.state;
    accepts.push(step.accept);
  }
  return { accepts, state };
}

/** 쉬는 자세 뒤에 이어진 관측의 accept만 돌려준다. */
function after(rest: GlanceSample[], tail: GlanceSample[]): boolean[] {
  return run([...rest, ...tail]).accepts.slice(rest.length);
}

describe("stepGlance — 쉬는 자세에서 고개를 멈춘 채 시작된 감김만 감김이다", () => {
  it("앉아서 눈을 뜨고 있다가 그대로 감으면 받아들인다", () => {
    expect(after(resting(), [closed(1), closed(2), closed(1)])).toEqual([true, true, true]);
  });

  it("감으면서 고개가 뒤로 젖혀져도(음수) 감김이다 — 오탐을 내는 건 아래를 보는 것뿐", () => {
    expect(after(resting(), [closed(-10), closed(-8), closed(-11)])).toEqual([true, true, true]);
  });

  it("쉬는 자세는 30초 뜬 눈의 중앙값이다 — 정면을 봐도 각도는 ±7° 흔들린다", () => {
    const wobbly = [open(-7), open(2), open(0), open(-5), open(1), open(3), open(-2), open(0)];
    const rest = [...wobbly, ...resting(0)].slice(-GLANCE_REST_OPEN_TICKS);
    // 흔들린 자세에서 잡힌 쉬는 자세(중앙값 0 근처) 기준으로, 아래 15°는 시선 이동이고 1°는 감김이다.
    expect(after(rest, [closed(DOWN)])).toEqual([false]);
    expect(after(rest, [closed(1)])).toEqual([true]);
  });

  it("쉬는 자세에서 고개를 내리며 감기면 시선 이동이다", () => {
    expect(after(resting(), [closed(DOWN), closed(DOWN), closed(DOWN + 1)])).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("시작 다음 틱에 고개가 내려가도 시선 이동이다 — 앞뒤 한 틱 창", () => {
    expect(after(resting(), [closed(WOBBLE), closed(DOWN), closed(DOWN)])).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("읽는 동안 눈이 잠깐 뜸으로 읽혀도 잠금은 안 풀린다 — 흔들리는 점수의 뜸 하나로 풀면 다음 감김이 통과한다", () => {
    expect(
      after(resting(), [
        closed(DOWN),
        open(DOWN),
        closed(DOWN),
        open(DOWN),
        closed(DOWN),
        closed(DOWN),
      ]),
    ).toEqual([false, true, false, true, false, false]);
  });

  it("고개가 쉬는 자세로 돌아온 채 뜨면 풀리고, 그 뒤 정지 감김은 받아들인다", () => {
    expect(after(resting(), [closed(DOWN), closed(DOWN), open(1), closed(1), closed(0)])).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("내린 자리에서 뜬 눈이 30초 이어지면 거기가 새 쉬는 자세다 — 그 뒤 정지 감김은 받아들인다", () => {
    const tail = [closed(DOWN), ...resting(DOWN), closed(DOWN), closed(DOWN)];
    const accepts = after(resting(), tail);
    expect(accepts.slice(-2)).toEqual([true, true]);
  });

  it("쉬는 자세를 모르면 감김을 받아들이지 않는다 — 세션 시작부터 감김", () => {
    expect(run([closed(), closed()]).accepts).toEqual([false, false]);
  });

  it("뜬 눈이 30초 연속되지 않으면 쉬는 자세가 안 잡힌다 — 읽는 자세는 쉬는 자세가 아니다", () => {
    const flicker = [open(DOWN), closed(DOWN), open(DOWN), closed(DOWN), open(DOWN), open(DOWN)];
    expect(run([...flicker, closed(DOWN)]).accepts.at(-1)).toBe(false);
  });

  it("판정 없는 틱(얼굴 없음) 뒤의 감김은 새 시작이고 쉬는 자세와 비교한다", () => {
    const tail: GlanceSample[] = [{ closure: null, pitch: null }, closed(DOWN)];
    expect(after(resting(), tail)).toEqual([false, false]);
    const tailBack: GlanceSample[] = [{ closure: null, pitch: null }, closed(1)];
    expect(after(resting(), tailBack)).toEqual([false, true]);
  });

  it("각도를 모르면 감김으로 둔다 — 규칙이 없던 때의 동작", () => {
    expect(after(resting(null), [closed(null), closed(null)])).toEqual([true, true]);
  });

  it("보정 전 관측도 기록해서, 임계가 생기자마자 쉬는 자세가 선다", () => {
    // 보정 중(임계 null)의 뜬 눈 30초 → 임계가 생긴 첫 틱에 정지 감김.
    let state = INITIAL_GLANCE_STATE;
    for (const sample of resting()) {
      state = stepGlance(state, sample, null).state;
    }
    expect(stepGlance(state, closed(1), THRESHOLD).accept).toBe(true);
    expect(stepGlance(state, closed(DOWN), THRESHOLD).accept).toBe(false);
  });

  it("임계가 내려가며 읽던 눈이 감김이 되면 쉬는 자세와 비교한다 — 내린 자리면 시선 이동", () => {
    // 임계 0.45로 쉬는 자세(0°). 그 뒤 고개를 내려 0.4로 읽히는 동안은 뜸이라 잠금이 없다.
    let state = INITIAL_GLANCE_STATE;
    for (const sample of resting()) {
      state = stepGlance(state, sample, THRESHOLD).state;
    }
    state = stepGlance(state, { closure: 0.4, pitch: DOWN }, THRESHOLD).state;
    // 임계가 0.35로 내려가 같은 점수가 감김이 된다. 쉬는 자세(0°)에서 떨어진 자리라 시선 이동이다.
    expect(stepGlance(state, { closure: 0.4, pitch: DOWN }, 0.35).accept).toBe(false);
  });
});
