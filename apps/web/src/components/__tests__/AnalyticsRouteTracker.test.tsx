import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { consumeStudyResultExit } from "@/lib/amplitude";

import { AnalyticsRouteTracker } from "../AnalyticsRouteTracker";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  consumeStudyResultExit: vi.fn(),
}));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsRouteTracker />
    </MemoryRouter>,
  );
}

describe("AnalyticsRouteTracker — 결과 이탈 예약 소비", () => {
  afterEach(() => {
    vi.mocked(consumeStudyResultExit).mockClear();
  });

  it("현재 경로를 그대로 넘긴다 — 내 몫인지 판단은 예약에 못박힌 경로가 한다", () => {
    for (const path of ["/home", "/social", "/records"]) {
      vi.mocked(consumeStudyResultExit).mockClear();
      renderAt(`${path}?userId=7`);
      expect(consumeStudyResultExit).toHaveBeenCalledWith(path);
    }
  });

  it("이미 떠 있는 홈이 다시 보이게 되면 또 확인한다 — 네이티브 모달 닫힘 경로", () => {
    const { unmount } = renderAt("/home?userId=7");
    vi.mocked(consumeStudyResultExit).mockClear();

    setVisibility("hidden");
    expect(consumeStudyResultExit).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);

    unmount();
    setVisibility("visible");
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);
  });
});
