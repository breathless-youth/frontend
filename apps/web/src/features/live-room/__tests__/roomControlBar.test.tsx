import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  pressNative,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { RoomControlBar, roomBarButtonClassName } from "../components/RoomControlBar";

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.restoreAllMocks();
});

function renderBar(props: { hidden?: boolean; inactive?: boolean } = {}) {
  render(
    <RoomControlBar cameraOn {...props} onToggleCamera={() => {}} onExit={() => {}}>
      <button type="button" aria-label="과목">
        과
      </button>
      <button type="button" aria-label="배경음">
        음
      </button>
    </RoomControlBar>,
  );
  return screen.getByTestId("room-control-bar");
}

describe("RoomControlBar 가운데 자리", () => {
  it("과목과 배경음 버튼은 받은 순서대로 카메라와 나가기 사이에 그린다", () => {
    const bar = renderBar();

    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["카메라 끄기", "과목", "배경음", "나가기"]);
  });

  it("바를 숨기면 가운데 버튼도 inert 안에 들어간다", () => {
    renderBar({ hidden: true });

    for (const name of ["과목", "배경음"]) {
      expect(screen.getByRole("button", { name, hidden: true }).closest("[inert]")).toBe(
        screen.getByTestId("room-control-bar"),
      );
    }
  });

  it("자리에 넣는 버튼 모양은 켜진 카메라 버튼과 같다", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "카메라 끄기" })).toHaveClass(
      ...roomBarButtonClassName.split(" "),
    );
  });
});

describe("RoomControlBar 앱 glass 버튼", () => {
  function enterApp(controls = "segment,switch,button,button-style") {
    const postMessage = enterGlassChrome("/social/room/42", controls);
    measureControlsNow();
    return postMessage;
  }

  type BarProps = {
    cameraOn?: boolean;
    disabled?: boolean;
    hidden?: boolean;
    inactive?: boolean;
    onToggleCamera?: () => void;
    onExit?: () => void;
  };

  function bar({
    cameraOn = true,
    onToggleCamera = () => {},
    onExit = () => {},
    ...rest
  }: BarProps) {
    return (
      <RoomControlBar
        cameraOn={cameraOn}
        {...rest}
        onToggleCamera={onToggleCamera}
        onExit={onExit}
      />
    );
  }

  it("카메라와 나가기를 앱 버튼으로 등록하고 웹 원본을 숨긴다", () => {
    const postMessage = enterApp();

    render(bar({}));

    expect(lastInlineControls(postMessage)).toMatchObject([
      {
        id: "room-camera",
        systemImage: "video.fill",
        tone: "default",
        accessibilityLabel: "카메라 끄기",
        disabled: false,
        faded: false,
      },
      {
        id: "room-exit",
        systemImage: "rectangle.portrait.and.arrow.right",
        tone: "danger",
        accessibilityLabel: "나가기",
        disabled: false,
        faded: false,
      },
    ]);
    for (const button of screen.getByTestId("room-control-bar").querySelectorAll("button")) {
      expect(button).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("카메라를 끄면 사선 심볼과 경고 색으로 바뀐다", () => {
    const postMessage = enterApp();

    render(bar({ cameraOn: false }));

    expect(lastInlineControls(postMessage)[0]).toMatchObject({
      id: "room-camera",
      systemImage: "video.slash.fill",
      tone: "danger",
      accessibilityLabel: "카메라 켜기",
    });
  });

  it("바가 숨으면 흐려지고 다시 보이면 돌아온다", () => {
    const postMessage = enterApp();
    const { rerender } = render(bar({ hidden: true }));

    expect(lastInlineControls(postMessage).map(({ faded }) => faded)).toEqual([true, true]);

    rerender(bar({ hidden: false }));

    expect(lastInlineControls(postMessage).map(({ faded }) => faded)).toEqual([false, false]);
  });

  it("동작 줄이기처럼 이동 전환이 없으면 다시 보일 때 잰 좌표가 최종 자리다", () => {
    const postMessage = enterApp();
    const { rerender } = render(bar({ hidden: true }));
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(
      new DOMRect(20, 600, 54, 54),
    );

    rerender(bar({ hidden: false }));

    expect(lastInlineControls(postMessage).map(({ frame }) => frame.y)).toEqual([600, 600]);
  });

  it.each([["inactive" as const], ["disabled" as const]])(
    "%s 동안 앱 버튼도 누름을 막고 풀리면 돌아온다",
    (lock) => {
      const postMessage = enterApp();
      const { rerender } = render(bar({ [lock]: true }));

      expect(lastInlineControls(postMessage).map(({ disabled }) => disabled)).toEqual([true, true]);

      rerender(bar({ [lock]: false }));

      expect(lastInlineControls(postMessage).map(({ disabled }) => disabled)).toEqual([
        false,
        false,
      ]);
    },
  );

  it("앱 버튼을 누르면 웹 버튼과 같은 처리기를 부른다", () => {
    enterApp();
    const onToggleCamera = vi.fn();
    const onExit = vi.fn();
    render(bar({ onToggleCamera, onExit }));

    pressNative("room-camera", 0);
    pressNative("room-exit", 0);

    expect(onToggleCamera).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("이미지 아이콘의 폭을 세션 심볼 배율로 줄여 iconSize로 보낸다", () => {
    const postMessage = enterApp();
    render(bar({}));

    for (const icon of screen.getByTestId("room-control-bar").querySelectorAll("img")) {
      icon.style.width = "23px";
    }
    fireEvent(window, new Event("resize"));

    expect(lastInlineControls(postMessage)).toMatchObject([
      { iconSize: 23 * 0.82 },
      { iconSize: 23 * 0.82 },
    ]);
  });

  it("앱이 버튼 모양 표시를 알리지 않으면 등록하지 않고 웹 버튼을 보인다", () => {
    const postMessage = enterApp("segment,switch,button");

    render(bar({}));

    expect(lastInlineControls(postMessage)).toEqual([]);
    expect(screen.getByRole("button", { name: "카메라 끄기" })).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("button", { name: "나가기" })).not.toHaveAttribute("aria-hidden");
  });
});
