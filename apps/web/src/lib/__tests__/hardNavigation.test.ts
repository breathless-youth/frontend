import { afterEach, describe, expect, it, vi } from "vitest";

import { exitToPreviousDocument } from "@/lib/hardNavigation";

const ORIGIN = "https://app.test";

// jsdom의 location.replace는 재정의할 수 없어 location 객체째 바꿔 실제 이동 대신 호출을 센다.
function stubDocument({ referrer, historyLength }: { referrer: string; historyLength: number }) {
  const replace = vi.fn();
  vi.stubGlobal("location", { origin: ORIGIN, replace });
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
  Object.defineProperty(window.history, "length", { value: historyLength, configurable: true });
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  return { replace, back };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exitToPreviousDocument", () => {
  it("같은 출처에서 넘어왔고 뒤로 갈 항목이 있으면 이전 문서로 돌아간다", () => {
    const { replace, back } = stubDocument({
      referrer: `${ORIGIN}/home?userId=7`,
      historyLength: 2,
    });

    exitToPreviousDocument("/home", "?userId=7");

    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("딥링크로 열렸으면 폴백 경로를 쿼리와 함께 문서 이동으로 연다", () => {
    const { replace, back } = stubDocument({ referrer: "", historyLength: 1 });

    exitToPreviousDocument("/home", "?userId=7&appVersion=26.46.0");

    expect(replace).toHaveBeenCalledWith("/home?userId=7&appVersion=26.46.0");
    expect(back).not.toHaveBeenCalled();
  });
});
