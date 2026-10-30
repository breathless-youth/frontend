import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enterGlassChrome, resetGlassChrome } from "@/test/nativeControlStub";

import { PlannerPillButton } from "../PlannerPillButton";

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.restoreAllMocks();
});

describe("PlannerPillButton", () => {
  it.each(["records"] as const)(
    "%s 버튼은 글자 없이 아이콘만 보이고 이름은 타임테이블이다",
    (via) => {
      render(
        <MemoryRouter>
          <PlannerPillButton via={via} />
        </MemoryRouter>,
      );

      const button = screen.getByRole("button", { name: "타임테이블" });
      expect(button).toHaveTextContent(/^$/);
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    },
  );

  it.each(["records"] as const)("앱 모드의 %s 버튼은 플래너 그림의 원형 버튼으로 보낸다", (via) => {
    const postMessage = enterGlassChrome(`/${via}`);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(20, 100, 44, 44),
    );

    render(
      <MemoryRouter>
        <PlannerPillButton via={via} />
      </MemoryRouter>,
    );

    const sent = postMessage.mock.calls
      .map(([raw]) => JSON.parse(raw as string) as { type: string; controls?: unknown[] })
      .filter((message) => message.type === "set-inline-controls")
      .at(-1);
    expect(sent?.controls).toEqual([
      {
        id: `button-planner-${via}`,
        kind: "button",
        frame: { x: 20, y: 100, width: 44, height: 44 },
        title: null,
        systemImage: "calendar",
        image: "planner",
        shape: "circle",
        disabled: false,
        accessibilityLabel: "타임테이블",
      },
    ]);
  });
});
