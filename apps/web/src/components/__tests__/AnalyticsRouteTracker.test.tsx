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

  it("홈 도착은 home, 기록 도착은 record로 소비하고 다른 화면은 건드리지 않는다", () => {
    renderAt("/home?userId=7");
    expect(consumeStudyResultExit).toHaveBeenCalledWith("home");

    renderAt("/records?userId=7");
    expect(consumeStudyResultExit).toHaveBeenCalledWith("record");

    vi.mocked(consumeStudyResultExit).mockClear();
    renderAt("/room/7/result");
    expect(consumeStudyResultExit).not.toHaveBeenCalled();
  });

  it("이미 떠 있는 홈이 다시 보이게 되면 또 확인한다 — 네이티브 모달 닫힘·탭 복귀 경로", () => {
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
