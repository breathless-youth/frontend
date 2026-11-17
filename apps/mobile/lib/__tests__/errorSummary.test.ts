import { errorSummary } from "../errorSummary";

describe("로그용 오류 요약", () => {
  it("코드가 있으면 코드만 남긴다", () => {
    const error = Object.assign(new Error("failed for 1685"), { code: "googleMobileAds/no-fill" });
    expect(errorSummary(error)).toBe("code googleMobileAds/no-fill");
    expect(errorSummary({ code: 2, message: "failed for 1685" })).toBe("code 2");
  });

  it("코드가 없으면 오류 이름만 남기고 메시지는 남기지 않는다", () => {
    expect(errorSummary(new TypeError("failed for 1685"))).toBe("TypeError");
  });

  it("오류 객체가 아니면 unknown이다", () => {
    expect(errorSummary({ message: "1685" })).toBe("unknown");
    expect(errorSummary("1685")).toBe("unknown");
    expect(errorSummary(null)).toBe("unknown");
    expect(errorSummary(undefined)).toBe("unknown");
  });
});
