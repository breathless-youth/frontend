import { describe, expect, it } from "vitest";

import { representativeStatus } from "../checkpoint";

describe("representativeStatus", () => {
  it("자리 이탈이 섞이면 무조건 AWAY다 (away > device > phone)", () => {
    expect(representativeStatus(["phone", "away"])).toBe("AWAY");
    expect(representativeStatus(["away", "device", "phone"])).toBe("AWAY");
  });

  it("자리 이탈이 없으면 기기 조작이 휴대폰보다 우선한다", () => {
    expect(representativeStatus(["phone", "device"])).toBe("DEVICE");
    expect(representativeStatus(["phone"])).toBe("PHONE");
  });

  it("빈 배열은 방어적으로 AWAY다 (측정 불가=자리 이탈과 동일 취급 원칙)", () => {
    expect(representativeStatus([])).toBe("AWAY");
  });
});
