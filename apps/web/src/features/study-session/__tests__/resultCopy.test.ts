import { describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

// 문구 상수 파일(resultCopy.ts)의 focusRateLabel이 카탈로그 키로 옮겨 갔다.
const focusRateLabel = (percent: number) => i18n.t("study-session:result.focusRate", { percent });

describe("focusRateLabel", () => {
  it("'N% 집중' 형식이다", () => {
    expect(focusRateLabel(80)).toBe("80% 집중");
  });
});
