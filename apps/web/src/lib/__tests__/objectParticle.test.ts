import { describe, expect, it } from "vitest";

import { objectParticle } from "../objectParticle";

describe("objectParticle", () => {
  it("받침이 있으면 을, 없으면 를이다", () => {
    expect(objectParticle("국어")).toBe("를");
    expect(objectParticle("수학")).toBe("을");
    expect(objectParticle("한국사")).toBe("를");
    expect(objectParticle("사회문화")).toBe("를");
    expect(objectParticle("물리학")).toBe("을");
  });

  it("숫자는 읽는 소리의 받침으로 고른다", () => {
    expect(objectParticle("수학1")).toBe("을");
    expect(objectParticle("수학2")).toBe("를");
    expect(objectParticle("화학10")).toBe("을");
  });

  it("한글·숫자가 아니면 를이다", () => {
    expect(objectParticle("Math")).toBe("를");
    expect(objectParticle("")).toBe("를");
  });
});
