import { describe, expect, it } from "vitest";

import { MEASUREMENT_SCENARIOS, scaleScenarios, totalScenarioSec } from "../scenarios";

describe("MEASUREMENT_SCENARIOS", () => {
  it("비어 있지 않다 — 이 배열이 시나리오의 유일한 출처다", () => {
    expect(MEASUREMENT_SCENARIOS.length).toBeGreaterThan(0);
  });

  it("눈 시나리오와 몸만 배치 반대 검증까지 열셋이다", () => {
    expect(MEASUREMENT_SCENARIOS).toHaveLength(13);
    expect(MEASUREMENT_SCENARIOS.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining(["A5", "A14", "A16", "A17", "A18", "A19"]),
    );
  });

  it("엎드림 대신 몸만 배치를 재고, 노출 길이별 구간과 저조도는 없다", () => {
    const ids = MEASUREMENT_SCENARIOS.map((scenario) => scenario.id);

    expect(MEASUREMENT_SCENARIOS.find((scenario) => scenario.id === "A5")?.name).toBe("몸만 배치");
    for (const removed of ["A6", "A7", "A8", "A9", "A10", "A13"]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("번호가 중복되지 않는다", () => {
    const ids = MEASUREMENT_SCENARIOS.map((scenario) => scenario.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 시나리오가 안내 문구와 관찰 시간을 갖는다", () => {
    for (const scenario of MEASUREMENT_SCENARIOS) {
      expect(scenario.instruction.length).toBeGreaterThan(0);
      expect(scenario.observeSec).toBeGreaterThan(0);
      expect(scenario.prepareSec).toBeGreaterThanOrEqual(0);
    }
  });

  it("모든 시나리오가 기대 문장을 갖는다 — 덩어리를 읽는 사람이 이것으로 구간을 해석한다", () => {
    for (const scenario of MEASUREMENT_SCENARIOS) {
      expect(scenario.expected.length).toBeGreaterThan(0);
    }
  });

  it("기대 문장이 졸음이 나야 하는지 아닌지를 말한다", () => {
    for (const scenario of MEASUREMENT_SCENARIOS) {
      expect(scenario.expected).toContain("졸음");
    }
  });
});

describe("scaleScenarios", () => {
  it("리허설은 준비와 관찰을 함께 줄인다", () => {
    const scaled = scaleScenarios(MEASUREMENT_SCENARIOS, 10);
    const source = MEASUREMENT_SCENARIOS[0];
    const first = scaled[0];

    expect(scaled).toHaveLength(MEASUREMENT_SCENARIOS.length);
    expect(first?.observeSec).toBeLessThan(source?.observeSec ?? 0);
    expect(totalScenarioSec(scaled)).toBeLessThan(totalScenarioSec(MEASUREMENT_SCENARIOS));
  });

  it("줄여도 0초가 되지 않는다 — 0초 관찰은 아무것도 담지 못한다", () => {
    for (const scenario of scaleScenarios(MEASUREMENT_SCENARIOS, 1000)) {
      expect(scenario.observeSec).toBeGreaterThan(0);
    }
  });

  it("기대 문장은 줄이지 않는다 — 시간이 줄어도 무엇을 보려던 것인지는 그대로다", () => {
    const scaled = scaleScenarios(MEASUREMENT_SCENARIOS, 10);

    expect(scaled[0]?.expected).toBe(MEASUREMENT_SCENARIOS[0]?.expected);
  });

  it("1로 줄이면 원본과 같다", () => {
    expect(scaleScenarios(MEASUREMENT_SCENARIOS, 1)).toEqual(MEASUREMENT_SCENARIOS);
  });
});
