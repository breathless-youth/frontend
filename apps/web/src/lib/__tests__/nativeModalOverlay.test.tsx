import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  __resetModalOverlayForTests,
  COVERS_TAB_BAR_ATTR,
  useModalOverlayCoversTabBar,
  useModalOverlayOpen,
} from "@/lib/nativeModalOverlay";

/**
 * 모달이 열렸는지를 `aria-modal="true"` 요소의 존재로 본다 — 모달마다 훅을 부르게 하면
 * 새 모달을 만드는 사람이 빠뜨리는 순간 네이티브 탭 바가 다시 눌린다.
 */

function Probe() {
  return <span data-testid="state">{useModalOverlayOpen() ? "open" : "closed"}</span>;
}

function CoversProbe() {
  return <span data-testid="covers">{useModalOverlayCoversTabBar() ? "covers" : "no"}</span>;
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

  it("퇴장 애니메이션 중(data-state=closed)인 모달은 걷어내기 전에도 닫힘이다 — 탭 바가 시트와 함께 돌아와야 한다", async () => {
    const { getByTestId } = render(<Probe />);
    const modal = addModal({ role: "dialog", "aria-modal": "true", "data-state": "open" });
    await waitFor(() => {
      expect(getByTestId("state").textContent).toBe("open");
    });

    modal.setAttribute("data-state", "closed");

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

describe("useModalOverlayCoversTabBar", () => {
  it("바텀시트(data-covers-tab-bar)가 붙으면 덮음이고 다이얼로그는 아니다", async () => {
    const { getByTestId } = render(<CoversProbe />);

    const dialog = addModal({ role: "dialog", "aria-modal": "true" });
    await waitFor(() => {
      expect(getByTestId("covers").textContent).toBe("no");
    });
    dialog.remove();

    const sheet = addModal({ role: "dialog", "aria-modal": "true", [COVERS_TAB_BAR_ATTR]: "" });
    await waitFor(() => {
      expect(getByTestId("covers").textContent).toBe("covers");
    });
    sheet.remove();
    await waitFor(() => {
      expect(getByTestId("covers").textContent).toBe("no");
    });
  });
});
