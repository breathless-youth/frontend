import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { PcCameraWindow } from "../PcCameraWindow";

class Pointer extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}

function Harness({ onActivate = vi.fn() }: { onActivate?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div data-testid="box">
      <PcCameraWindow
        stream={null}
        facing="front"
        videoRef={videoRef}
        hidden={hidden}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onHide={() => setHidden(true)}
        onActivate={onActivate}
        layer={10}
      />
    </div>
  );
}

const windowName = () => i18n.t("desktop:session.camera.window");
const cameraWindow = () => screen.getByRole("group", { name: windowName() });

function press(from: [number, number], to: [number, number]) {
  const target = cameraWindow();
  fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], pointerId: 1, button: 0 });
  fireEvent.pointerMove(target, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(target, { clientX: to[0], clientY: to[1], pointerId: 1, button: 0 });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("PointerEvent", Pointer);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const size =
      this.dataset.testid === "box" ? { width: 1200, height: 800 } : { width: 288, height: 162 };
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      ...size,
      toJSON() {},
    } as DOMRect;
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PcCameraWindow", () => {
  it("처음에는 상자 오른쪽 아래에 있다", () => {
    render(<Harness />);

    expect(cameraWindow().style.right).toBe("24px");
    expect(cameraWindow().style.top).toBe(`${800 - 162 - 16}px`);
  });

  it("창을 누르기만 해서는 크기가 바뀌지 않고 크게·작게 버튼으로만 바뀐다", () => {
    render(<Harness />);

    press([1000, 700], [1000, 700]);
    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.expand") }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.camera.expand") }));
    fireEvent.pointerDown(cameraWindow(), { pointerId: 2, button: 0, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(cameraWindow(), { pointerId: 2, button: 0, clientX: 500, clientY: 400 });
    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.shrink") }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.camera.shrink") }));
    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.expand") }),
    ).toBeInTheDocument();
  });

  it("끌면 옮기고 자리를 기억한다", () => {
    render(<Harness />);

    press([1000, 700], [900, 600]);

    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.expand") }),
    ).toBeInTheDocument();
    expect(cameraWindow().style.right).toBe("124px");
    expect(JSON.parse(localStorage.getItem("focusmakers.pc.cameraWindow") ?? "null")).toMatchObject(
      {
        right: 124,
        top: 522,
      },
    );
  });

  it("방향키로 옮긴다", () => {
    render(<Harness />);
    cameraWindow().focus();

    fireEvent.keyDown(cameraWindow(), { key: "ArrowLeft" });

    expect(cameraWindow().style.right).toBe("40px");
  });

  it("숨겨도 영상 요소는 그대로 남고, 영상에는 녹화 차단 표식이 붙는다", async () => {
    render(<Harness />);
    const video = document.querySelector("video");

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.hide") }),
    );

    expect(document.querySelector("video")).toBe(video);
    // 숨긴 창은 화면 낭독기에서 빠져 이름이 계산되지 않으므로 붙인 이름표로 찾는다.
    const hiddenWindow = screen.getByLabelText(windowName());
    expect(hiddenWindow).toHaveAttribute("inert");
    expect(hiddenWindow).toHaveAttribute("aria-hidden", "true");
    expect(hiddenWindow).toHaveClass("pointer-events-none");
    expect(video).toHaveClass("amp-block", "sentry-block");
  });

  it("누르거나 포커스가 들어오면 위로 올려 달라고 알린다", () => {
    const onActivate = vi.fn();
    render(<Harness onActivate={onActivate} />);

    fireEvent.pointerDown(cameraWindow(), { pointerId: 1, button: 0 });

    expect(onActivate).toHaveBeenCalled();
  });
});
