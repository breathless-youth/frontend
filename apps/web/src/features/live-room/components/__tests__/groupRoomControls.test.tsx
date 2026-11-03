import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  pressNative,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { GroupRoomTopBar } from "../GroupRoomTopBar";
import { MicButton } from "../MicButton";
import { TimerButton } from "../TimerButton";

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.restoreAllMocks();
});

/** 앱 glass 버튼을 그리는 앱의 그룹 공부방 */
function enterApp() {
  const postMessage = enterGlassChrome("/social/groups/10/room", "button,button-style");
  measureControlsNow();
  return postMessage;
}

function inlineControl(postMessage: ReturnType<typeof enterApp>, id: string) {
  return lastInlineControls(postMessage).find((control) => control.id === id);
}

function topBarProps(
  overrides: Partial<ComponentProps<typeof GroupRoomTopBar>> = {},
): ComponentProps<typeof GroupRoomTopBar> {
  return {
    subject: null,
    focusSec: 0,
    studySec: 0,
    paused: false,
    hidden: false,
    othersMuted: false,
    flipDisabled: false,
    onOpenSubject: vi.fn(),
    onToggleOthersMuted: vi.fn(),
    onFlipCamera: vi.fn(),
    ...overrides,
  };
}

describe("MicButton", () => {
  it("꺼짐과 켜짐을 이름과 눌림 상태로 알린다", () => {
    const { rerender } = render(<MicButton on={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "마이크 켜기" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(<MicButton on onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "마이크 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("앱 부품으로 그리면 꺼짐은 사선 마이크와 경고 색이다", () => {
    const postMessage = enterApp();
    const { rerender } = render(<MicButton on={false} onToggle={vi.fn()} />);
    expect(inlineControl(postMessage, "room-mic")).toMatchObject({
      systemImage: "mic.slash.fill",
      tone: "danger",
      accessibilityLabel: "마이크 켜기",
    });

    rerender(<MicButton on onToggle={vi.fn()} />);

    expect(inlineControl(postMessage, "room-mic")).toMatchObject({
      systemImage: "mic.fill",
      tone: "default",
      accessibilityLabel: "마이크 끄기",
    });
  });

  it("앱 부품을 눌러도 같은 처리기를 부르고, 숨으면 흐려지고 잠그면 누를 수 없다", () => {
    const postMessage = enterApp();
    const onToggle = vi.fn();
    const { rerender } = render(<MicButton on={false} onToggle={onToggle} />);

    pressNative("room-mic", 0);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<MicButton on={false} hidden inactive onToggle={onToggle} />);
    expect(inlineControl(postMessage, "room-mic")).toMatchObject({ faded: true, disabled: true });
  });
});

describe("TimerButton", () => {
  it("타이머가 켜져 있으면 켜짐 표시와 채운 파랑 역할이다", () => {
    render(<TimerButton on expanded={false} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "타이머" })).toHaveAttribute("data-on", "true");
    cleanup();

    const postMessage = enterApp();
    render(<TimerButton on expanded={false} onOpen={vi.fn()} />);

    expect(inlineControl(postMessage, "room-timer")).toMatchObject({
      systemImage: "timer",
      tone: "prominent",
      accessibilityLabel: "타이머",
    });
  });

  it("꺼져 있으면 기본 역할이고 누르면 시트를 연다", async () => {
    const onOpen = vi.fn();
    render(<TimerButton on={false} expanded={false} onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "타이머" });

    expect(button).toHaveAttribute("data-on", "false");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.setup().click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("GroupRoomTopBar", () => {
  it("왼쪽 위 과목 글자는 색 점과 이름이고 누르면 과목 화면을 연다", async () => {
    const onOpenSubject = vi.fn();
    render(
      <GroupRoomTopBar
        {...topBarProps({ subject: { name: "국어", colorIndex: 3 }, onOpenSubject })}
      />,
    );
    const label = screen.getByRole("button", { name: /국어/ });

    expect(within(label).getByTestId("subject-color-dot")).toHaveStyle({
      backgroundColor: "var(--subject-3)",
    });
    await userEvent.setup().click(label);
    expect(onOpenSubject).toHaveBeenCalledWith(label);
  });

  it("과목을 고르지 않았으면 색 점 없이 과목 글자만 둔다", () => {
    render(<GroupRoomTopBar {...topBarProps()} />);
    const label = screen.getByRole("button", { name: "과목" });

    expect(within(label).queryByTestId("subject-color-dot")).toBeNull();
  });

  it("가운데 위에 내 순공과 총 시간을 둔다", () => {
    render(<GroupRoomTopBar {...topBarProps({ focusSec: 2538, studySec: 2730 })} />);

    expect(screen.getByText("00:42:18")).toBeInTheDocument();
    expect(screen.getByText("총 00:45:30")).toBeInTheDocument();
  });

  it("측정이 멈추면 순공 뱃지가 멈춘 상태로 읽힌다", () => {
    const { rerender } = render(<GroupRoomTopBar {...topBarProps()} />);
    expect(screen.getByTestId("group-room-focus-badge")).toHaveAttribute("data-state", "focus");

    rerender(<GroupRoomTopBar {...topBarProps({ paused: true })} />);

    expect(screen.getByTestId("group-room-focus-badge")).toHaveAttribute("data-state", "paused");
  });

  it("다른 사람 소리 끄기는 누른 상태를 알린다", async () => {
    const onToggleOthersMuted = vi.fn();
    const { rerender } = render(<GroupRoomTopBar {...topBarProps({ onToggleOthersMuted })} />);
    const button = screen.getByRole("button", { name: "다른 사람 소리 끄기" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.setup().click(button);
    expect(onToggleOthersMuted).toHaveBeenCalledOnce();

    rerender(<GroupRoomTopBar {...topBarProps({ othersMuted: true })} />);
    expect(screen.getByRole("button", { name: "다른 사람 소리 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("카메라 전환은 카메라가 꺼진 동안 누를 수 없다", async () => {
    const onFlipCamera = vi.fn();
    const { rerender } = render(<GroupRoomTopBar {...topBarProps({ onFlipCamera })} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "카메라 전환" }));
    expect(onFlipCamera).toHaveBeenCalledOnce();

    rerender(<GroupRoomTopBar {...topBarProps({ onFlipCamera, flipDisabled: true })} />);
    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeDisabled();
  });

  it("조작이 숨으면 순공 뱃지만 남고 나머지는 누를 수 없다", () => {
    render(<GroupRoomTopBar {...topBarProps({ hidden: true })} />);

    for (const name of ["과목", "다른 사람 소리 끄기", "카메라 전환"]) {
      expect(screen.getByRole("button", { name, hidden: true }).closest("[inert]")).not.toBeNull();
    }
    expect(screen.getByTestId("group-room-focus-badge").closest("[inert]")).toBeNull();
  });

  it("버튼을 눌러도 화면 탭으로 번지지 않는다", () => {
    const onSurfacePointerDown = vi.fn();
    render(
      <div onPointerDown={onSurfacePointerDown}>
        <GroupRoomTopBar {...topBarProps()} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "다른 사람 소리 끄기" }));

    expect(onSurfacePointerDown).not.toHaveBeenCalled();
  });
});
