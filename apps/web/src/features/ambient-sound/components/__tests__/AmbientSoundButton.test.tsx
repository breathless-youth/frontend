import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { AmbientLinesIcon, AmbientSoundButton } from "../AmbientSoundButton";

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.restoreAllMocks();
});

function enterApp() {
  const postMessage = enterGlassChrome("/room/7", "segment,switch,button,button-style");
  measureControlsNow();
  return postMessage;
}

describe("AmbientSoundButton 앱 등록", () => {
  it("기본값은 앱 glass 버튼으로 등록하고 웹 원본을 숨긴다", () => {
    const postMessage = enterApp();

    const { container } = render(
      <AmbientSoundButton on={false} expanded={false} onClick={() => {}} />,
    );

    expect(lastInlineControls(postMessage).map(({ id }) => id)).toEqual(["session-ambient"]);
    expect(container.querySelector("button")).toHaveAttribute("aria-hidden", "true");
  });

  it("nativeId를 주면 그 id로 등록한다", () => {
    const postMessage = enterApp();

    render(
      <AmbientSoundButton nativeId="room-ambient" on={false} expanded={false} onClick={() => {}} />,
    );

    expect(lastInlineControls(postMessage).map(({ id }) => id)).toEqual(["room-ambient"]);
  });

  it("inactive면 웹 버튼은 그대로 두고 앱 버튼만 누름을 막는다", () => {
    const postMessage = enterApp();

    const { container } = render(
      <AmbientSoundButton inactive on={false} expanded={false} onClick={() => {}} />,
    );

    expect(lastInlineControls(postMessage)).toMatchObject([{ disabled: true }]);
    expect(container.querySelector("button")).not.toBeDisabled();
  });
});

describe("AmbientSoundButton 바깥 모양", () => {
  it("className을 주면 세션 유리 모양을 그 클래스로 바꾸고 켜짐 색은 남긴다", () => {
    render(
      <AmbientSoundButton
        className="size-13.5 bg-white/10"
        on
        expanded={false}
        onClick={() => {}}
      />,
    );

    const button = screen.getByRole("button", { name: "배경음 켜짐" });
    expect(button).toHaveClass("size-13.5", "bg-white/10", "data-[on=true]:text-(--state-focus)");
    // 유리 바탕이 남으면 바 버튼과 모양이 다르고 pointer-events-auto가 바의 누름 잠금을 뚫는다.
    expect(button).not.toHaveClass("backdrop-blur-[11px]");
    expect(button).not.toHaveClass("pointer-events-auto");
  });

  it("누름 시작 처리기를 버튼에 단다", () => {
    const onPointerDown = vi.fn();
    render(
      <AmbientSoundButton
        onPointerDown={onPointerDown}
        on={false}
        expanded={false}
        onClick={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "배경음" }));

    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it("잠그면 버튼을 누를 수 없다", () => {
    render(<AmbientSoundButton disabled on={false} expanded={false} onClick={() => {}} />);

    expect(screen.getByRole("button", { name: "배경음" })).toBeDisabled();
  });
});

describe("AmbientLinesIcon 켜짐 표시", () => {
  it("꺼져 있으면 회색 빗금 아이콘이고 그라데이션이 없다", () => {
    const { container } = render(<AmbientLinesIcon on={false} />);

    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
    expect(container.querySelector("svg")).toHaveClass("opacity-40");
    expect(container.querySelector('[data-testid="ambient-off-slash"]')).not.toBeNull();
    expect(container.querySelector("linearGradient")).toBeNull();
  });

  it("켜져 있으면 막대를 흐르는 그라데이션으로 칠한다", () => {
    const { container } = render(<AmbientLinesIcon on />);

    const gradient = container.querySelector("linearGradient")!;
    expect(container.querySelector("svg")).toHaveAttribute("stroke", `url(#${gradient.id})`);
    expect(gradient.querySelectorAll("animate")).toHaveLength(2);
    expect(container.querySelector('[data-testid="ambient-off-slash"]')).toBeNull();
  });

  it("동작 줄이기 설정이면 흐름 없이 그라데이션만 남긴다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));

    const { container } = render(<AmbientLinesIcon on />);

    expect(container.querySelector("linearGradient")).not.toBeNull();
    expect(container.querySelector("animate")).toBeNull();
    vi.unstubAllGlobals();
  });
});
