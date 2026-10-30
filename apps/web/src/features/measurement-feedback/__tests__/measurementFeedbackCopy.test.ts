import { describe, expect, it } from "vitest";

import { ANALYTICS_PARAM_VALUE_PATTERN } from "@focusmakers/types";

import { RATING_OPTIONS, REASON_OPTIONS } from "../measurementFeedbackCopy";

describe("measurementFeedbackCopy", () => {
  /** 이벤트가 앱 분석 스트림(Firebase)으로도 넘어가므로, 규칙을 벗어난 값은 네이티브에서 걸러진다. */
  it("선택지 값은 모두 분석 값 규칙을 통과한다", () => {
    for (const { value } of [...RATING_OPTIONS, ...REASON_OPTIONS]) {
      expect(value).toMatch(ANALYTICS_PARAM_VALUE_PATTERN);
    }
  });
});
