import { describe, expect, it } from "vitest";

import type { GlanceState } from "../glanceRule";
import { INITIAL_GLANCE_STATE, reclassifyGlanceForThreshold, stepGlance } from "../glanceRule";
import { GLANCE_HEAD_MOVE_DEG } from "../visionConfig";

const BIG = GLANCE_HEAD_MOVE_DEG + 10;
const SMALL = GLANCE_HEAD_MOVE_DEG / 2;

function run(ticks: readonly { closed: boolean | null; pitch: number | null }[]): {
  accepts: boolean[];
  state: GlanceState;
} {
  let state = INITIAL_GLANCE_STATE;
  const accepts: boolean[] = [];
  for (const tick of ticks) {
    const step = stepGlance(state, tick);
    state = step.state;
    accepts.push(step.accept);
  }
  return { accepts, state };
}

describe("stepGlance — 감김의 시작 순간으로 가른다", () => {
  it("고개가 멈춘 채 시작된 감김은 받아들인다 — 앉아서 조는 사람", () => {
    const { accepts, state } = run([
      { closed: false, pitch: 0 },
      { closed: true, pitch: 1 },
      { closed: true, pitch: 2 },
      { closed: true, pitch: 1 },
    ]);
    expect(accepts).toEqual([true, true, true, true]);
    expect(state.run).toBe("closure");
  });

  it("고개를 내리면서 시작된 감김은 시선 이동이다 — 눈이 다시 뜰 때까지 판정 없음", () => {
    const { accepts, state } = run([
      { closed: false, pitch: 0 },
      { closed: true, pitch: BIG },
      { closed: true, pitch: BIG },
      { closed: true, pitch: BIG + 1 },
    ]);
    expect(accepts).toEqual([true, false, false, false]);
    expect(state.run).toBe("glance");
  });

  it("시작 다음 틱에 고개가 내려가도 시선 이동이다 — 앞뒤 한 틱 창", () => {
    const { accepts } = run([
      { closed: false, pitch: 0 },
      { closed: true, pitch: SMALL },
      { closed: true, pitch: BIG },
      { closed: true, pitch: BIG },
    ]);
    expect(accepts).toEqual([true, true, false, false]);
  });

  it("눈이 다시 뜨면 구간이 닫히고, 그 뒤 고개를 멈춘 채 감으면 다시 받아들인다", () => {
    const { accepts } = run([
      { closed: false, pitch: 0 },
      { closed: true, pitch: BIG }, // 시선 이동
      { closed: false, pitch: 0 }, // 고개 들고 뜸
      { closed: true, pitch: 0 }, // 정지 감김
      { closed: true, pitch: 0 },
    ]);
    expect(accepts).toEqual([true, false, true, true, true]);
  });

  it("뜬 눈을 본 적 없는 감김은 받아들이지 않는다 — 세션 시작부터 감김", () => {
    const { accepts } = run([
      { closed: true, pitch: 0 },
      { closed: true, pitch: 0 },
    ]);
    expect(accepts).toEqual([false, false]);
  });

  it("판정 없는 틱을 사이에 두고 감김이 오면 새 시작으로 보고, 그 사이 움직임을 마지막 각도와 잰다", () => {
    // 뜸(0°) → 얼굴 없음 → 감김(20°): 얼굴이 없던 사이 고개가 내려간 것이다.
    const { accepts } = run([
      { closed: false, pitch: 0 },
      { closed: null, pitch: null },
      { closed: true, pitch: BIG },
    ]);
    expect(accepts).toEqual([true, false, false]);
  });

  it("각도를 모르면 감김으로 둔다 — 규칙이 없던 때의 동작", () => {
    const { accepts } = run([
      { closed: false, pitch: null },
      { closed: true, pitch: null },
      { closed: true, pitch: null },
    ]);
    expect(accepts).toEqual([true, true, true]);
  });

  it("임계가 생길 때 마지막 표본이 뜸이었으면 다음 감김은 정상 시작이다 — 보정 직후의 감김", () => {
    // 보정 창 동안은 임계가 없어 판정 없음(closed null)만 지나간다.
    const during = run([
      { closed: null, pitch: 0 },
      { closed: null, pitch: 0 },
    ]);
    const calibrated = reclassifyGlanceForThreshold(during.state, false, 0);
    expect(stepGlance(calibrated, { closed: true, pitch: 1 }).accept).toBe(true);
    // 같은 자리에서 고개를 내리며 감기면 시선 이동이다.
    expect(stepGlance(calibrated, { closed: true, pitch: BIG }).accept).toBe(false);
  });

  it("임계가 바뀔 때 마지막 표본이 감김이면 뜸을 볼 때까지 거부한다 — 임계가 내려가며 읽던 눈이 감김이 된 경우", () => {
    const first = run([
      { closed: false, pitch: 0 },
      { closed: false, pitch: 0 },
    ]);
    const lowered = reclassifyGlanceForThreshold(first.state, true, 20);
    const step = stepGlance(lowered, { closed: true, pitch: 20 });
    expect(step.accept).toBe(false);
    const reopened = stepGlance(step.state, { closed: false, pitch: 0 });
    expect(stepGlance(reopened.state, { closed: true, pitch: 0 }).accept).toBe(true);
  });
});
