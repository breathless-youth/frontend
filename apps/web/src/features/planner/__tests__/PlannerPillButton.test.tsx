import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  pressNative,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { PlannerPillButton } from "../PlannerPillButton";

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.restoreAllMocks();
});

describe("PlannerPillButton", () => {
  it("업데이트 점의 뜻을 읽을 수 있고 웹에서 누르면 확인 콜백도 실행한다", () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <PlannerPillButton via="home" showUpdateDot onOpen={onOpen} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "플래너" });
    expect(button).toHaveAccessibleDescription("새 플래너를 확인해 보세요");
    expect(screen.getByTestId("planner-update-dot")).toBeVisible();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("점이 있을 때는 앱에서도 버튼과 점을 함께 웹으로 그리고 확인 뒤 네이티브로 돌아간다", () => {
    const post = enterGlassChrome("/home");
    measureControlsNow();
    function Button() {
      const [unread, setUnread] = useState(true);
      return (
        <PlannerPillButton via="home" showUpdateDot={unread} onOpen={() => setUnread(false)} />
      );
    }
    const view = render(
      <MemoryRouter>
        <Button />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "플래너" });
    expect(button).toBeVisible();
    expect(screen.getByTestId("planner-update-dot")).toBeVisible();
    expect(lastInlineControls(post)).toHaveLength(0);
    fireEvent.click(button);
    expect(screen.queryByTestId("planner-update-dot")).not.toBeInTheDocument();
    expect(view.container.querySelector("button")).not.toBeVisible();
    expect(lastInlineControls(post)[0]?.accessibilityLabel).toBe("플래너");
  });

  it("점이 사라진 네이티브 버튼도 기존 열기 경로를 실행한다", () => {
    enterGlassChrome("/home");
    measureControlsNow();
    const onOpen = vi.fn();
    const view = render(
      <MemoryRouter>
        <PlannerPillButton via="home" onOpen={onOpen} />
      </MemoryRouter>,
    );
    expect(view.container.querySelector("button")).not.toBeVisible();
    pressNative("button-planner-home", 0);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it.each(["home", "records"] as const)("%s 버튼은 글자 없이 플래너 아이콘만 보인다", (via) => {
    render(
      <MemoryRouter>
        <PlannerPillButton via={via} />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "플래너" });
    expect(button).toHaveTextContent(/^$/);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["home", "records"] as const)(
    "앱 모드의 %s 버튼은 플래너 그림의 원형 버튼으로 보낸다",
    (via) => {
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
          accessibilityLabel: "플래너",
        },
      ]);
    },
  );
});
