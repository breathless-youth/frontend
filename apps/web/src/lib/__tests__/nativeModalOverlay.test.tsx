import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { __resetModalOverlayForTests, useModalOverlayOpen } from "@/lib/nativeModalOverlay";

/**
 * 모달이 열렸는지를 `aria-modal="true"` 요소의 존재로 본다 — 모달마다 훅을 부르게 하면
 * 새 모달을 만드는 사람이 빠뜨리는 순간 네이티브 탭 바가 다시 눌린다.
 */

function Probe() {
  return <span data-testid="state">{useModalOverlayOpen() ? "open" : "closed"}</span>;
}

afterEach(() => {
  __resetModalOverlayForTests();
  document.body.innerHTML = "";
});

function addModal(attributes: Record<string, string>): HTMLElement {
  const element = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
  return element;
}

describe("useModalOverlayOpen", () => {
  it("모달이 없으면 닫힘이다", () => {
    const { getByTestId } = render(<Probe />);

    expect(getByTestId("state").textContent).toBe("closed");
  });

  it("aria-modal 요소가 붙으면 열림이 된다", async () => {
    const { getByTestId } = render(<Probe />);

    addModal({ role: "dialog", "aria-modal": "true" });

    await waitFor(() => {
      expect(getByTestId("state").textContent).toBe("open");
    });
  });

  it("모달이 떨어지면 닫힘으로 돌아온다", async () => {
    const { getByTestId } = render(<Probe />);
    const modal = addModal({ role: "dialog", "aria-modal": "true" });
    await waitFor(() => {
      expect(getByTestId("state").textContent).toBe("open");
    });

    modal.remove();

    await waitFor(() => {
      expect(getByTestId("state").textContent).toBe("closed");
    });
  });

  it("aria-modal 없는 오버레이는 열림으로 보지 않는다 — 토스트가 탭 이동을 막으면 안 된다", async () => {
    const { getByTestId } = render(<Probe />);

    addModal({ role: "status" });

    await waitFor(() => {
      expect(getByTestId("state").textContent).toBe("closed");
    });
  });
});
